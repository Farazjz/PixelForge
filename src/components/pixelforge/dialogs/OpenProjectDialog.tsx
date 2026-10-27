'use client'

// PixelForge AI — Open Project dialog (.pfa file or cloud). Opens on window event 'pf:menu-open'.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Cloud, FileUp, Loader2, RefreshCw, Trash2 } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { deserializeDoc } from '@/lib/pixelforge/engine'
import { useEditorStore } from '@/lib/pixelforge/store'
import { toast } from '@/hooks/use-toast'

interface CloudProject {
  id: string
  name: string
  width: number
  height: number
  updatedAt: string
  thumb: string | null
}

// ---- defensive JSON helpers (cloud API is built by a sibling task) ----

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null
}

function pickString(r: Record<string, unknown> | null, ...keys: string[]): string | undefined {
  if (!r) return undefined
  for (const k of keys) {
    const v = r[k]
    if (typeof v === 'string') return v
  }
  return undefined
}

function pickNumber(r: Record<string, unknown> | null, ...keys: string[]): number | undefined {
  if (!r) return undefined
  for (const k of keys) {
    const v = r[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return undefined
}

function parseProject(raw: unknown): CloudProject | null {
  const rec = asRecord(raw)
  if (!rec) return null
  const id = pickString(rec, 'id', 'projectId', '_id')
  if (!id) return null
  return {
    id,
    name: pickString(rec, 'name', 'title') ?? 'Untitled',
    width: pickNumber(rec, 'width', 'w') ?? 0,
    height: pickNumber(rec, 'height', 'h') ?? 0,
    updatedAt: pickString(rec, 'updatedAt', 'updated_at', 'createdAt') ?? '',
    thumb: pickString(rec, 'thumb', 'thumbnail', 'thumbDataUrl') ?? null,
  }
}

function formatDate(s: string): string {
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

export function OpenProjectDialog() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'file' | 'cloud'>('file')
  const [fileError, setFileError] = useState<string | null>(null)
  const [items, setItems] = useState<CloudProject[]>([])
  const [loading, setLoading] = useState(false)
  const [cloudError, setCloudError] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CloudProject | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = () => {
      setFileError(null)
      setCloudError(null)
      setOpen(true)
    }
    window.addEventListener('pf:menu-open', handler)
    return () => window.removeEventListener('pf:menu-open', handler)
  }, [])

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    setCloudError(null)
    try {
      const res = await fetch('/api/projects')
      if (!res.ok) throw new Error(`Failed to load projects (HTTP ${res.status})`)
      const json: unknown = await res.json()
      const rec = asRecord(json)
      const list: unknown[] = Array.isArray(json)
        ? json
        : Array.isArray(rec?.projects)
          ? (rec.projects as unknown[])
          : Array.isArray(rec?.items)
            ? (rec.items as unknown[])
            : []
      setItems(list.map(parseProject).filter((p): p is CloudProject => p !== null))
    } catch (e) {
      setCloudError(e instanceof Error ? e.message : 'Failed to load cloud projects.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Load cloud list whenever the dialog opens
  useEffect(() => {
    if (open) void fetchProjects()
  }, [open, fetchProjects])

  const openFile = async (file: File) => {
    setFileError(null)
    try {
      const text = await file.text()
      const doc = deserializeDoc(text)
      useEditorStore.getState().loadDoc(doc)
      toast({ title: 'Project opened', description: `${doc.name} — ${doc.width}×${doc.height}px` })
      setOpen(false)
    } catch (e) {
      setFileError(e instanceof Error ? e.message : 'Invalid project file.')
    }
  }

  const openFromCloud = async (project: CloudProject) => {
    setOpeningId(project.id)
    setCloudError(null)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project.id)}`)
      if (!res.ok) throw new Error(`Failed to load project (HTTP ${res.status})`)
      const json: unknown = await res.json()
      const rec = asRecord(json)
      const proj = asRecord(rec?.project) ?? rec
      const dataJson = pickString(proj, 'dataJson', 'data', 'json')
      if (!dataJson) throw new Error('Project payload is missing pixel data.')
      const doc = deserializeDoc(dataJson)
      useEditorStore.getState().loadDoc(doc, project.id)
      toast({ title: 'Project opened', description: `${doc.name} — ${doc.width}×${doc.height}px` })
      setOpen(false)
    } catch (e) {
      setCloudError(e instanceof Error ? e.message : 'Failed to open project.')
    } finally {
      setOpeningId(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleteTarget(null)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(target.id)}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) throw new Error(`Delete failed (HTTP ${res.status})`)
      toast({ title: 'Project deleted', description: target.name })
      void fetchProjects()
    } catch (e) {
      toast({
        title: 'Delete failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Open Project</DialogTitle>
            <DialogDescription>Load a .pfa project file or pick one from the cloud.</DialogDescription>
          </DialogHeader>

          <Tabs value={tab} onValueChange={(v) => setTab(v === 'cloud' ? 'cloud' : 'file')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="file">
                <FileUp className="size-4" />
                From file
              </TabsTrigger>
              <TabsTrigger value="cloud">
                <Cloud className="size-4" />
                From cloud
              </TabsTrigger>
            </TabsList>

            {/* ---------- From file ---------- */}
            <TabsContent value="file" className="mt-3">
              <Input
                ref={fileRef}
                type="file"
                accept=".pfa,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void openFile(f)
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/60 px-4 py-6 text-center transition-colors hover:border-violet-500/60 hover:bg-violet-500/5"
              >
                <FileUp className="size-6 text-zinc-500" />
                <span className="text-sm font-medium text-zinc-200">Choose a .pfa / .json project file</span>
                <span className="text-xs text-zinc-500">Pixelforge AI project format (raw RGBA sprite data)</span>
              </button>
              {fileError ? (
                <p className="mt-2 text-sm text-rose-400" role="alert">
                  {fileError}
                </p>
              ) : null}
            </TabsContent>

            {/* ---------- From cloud ---------- */}
            <TabsContent value="cloud" className="mt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-zinc-500">
                  {loading ? 'Loading…' : `${items.length} project${items.length === 1 ? '' : 's'}`}
                </span>
                <Button variant="outline" size="sm" onClick={() => void fetchProjects()} disabled={loading}>
                  <RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} />
                  Refresh
                </Button>
              </div>

              {cloudError ? (
                <p className="mb-2 text-sm text-rose-400" role="alert">
                  {cloudError}
                </p>
              ) : null}

              <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {!loading && items.length === 0 && !cloudError ? (
                  <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-zinc-800 text-sm text-zinc-500">
                    No cloud projects yet — save one with “Save to Cloud”.
                  </div>
                ) : null}
                {items.map((p) => (
                  <div
                    key={p.id}
                    className="group flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-2 transition-colors hover:border-violet-500/50"
                  >
                    <button
                      type="button"
                      onClick={() => void openFromCloud(p)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span
                        aria-hidden="true"
                        className="h-14 w-14 shrink-0 rounded border border-zinc-800 bg-zinc-950"
                        style={{
                          backgroundImage: p.thumb ? `url(${p.thumb})` : undefined,
                          backgroundSize: 'contain',
                          backgroundPosition: 'center',
                          backgroundRepeat: 'no-repeat',
                          imageRendering: 'pixelated',
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-zinc-100">{p.name}</span>
                        <span className="block text-xs text-zinc-500">
                          {p.width}×{p.height}px · {formatDate(p.updatedAt)}
                        </span>
                      </span>
                      {openingId === p.id ? (
                        <Loader2 className="size-4 shrink-0 animate-spin text-violet-400" />
                      ) : null}
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${p.name}`}
                      className="h-8 w-8 shrink-0 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-400"
                      onClick={() => setDeleteTarget(p)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete cloud project?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.name}” will be permanently removed from the cloud. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDelete()}
              className="bg-rose-600 text-white hover:bg-rose-500"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
