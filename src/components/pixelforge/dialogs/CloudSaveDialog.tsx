'use client'

// PixelForge AI — Cloud save dialog. Opens on window event 'pf:menu-cloud-save'.
// POST /api/projects (new) or PUT /api/projects/[id] (update existing cloud project).
// Also offers the quick "Download .pfa" action (same as Ctrl+S).

import { useEffect, useState } from 'react'
import { CloudUpload, Download, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { renderCompositeToCanvas, serializeDoc } from '@/lib/pixelforge/engine'
import { useEditorStore } from '@/lib/pixelforge/store'
import type { PFDocument } from '@/lib/pixelforge/types'
import { toast } from '@/hooks/use-toast'

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

function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9-_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'pixelforge'
  )
}

/** Render the active frame composite into a small nearest-neighbor thumbnail (128px wide). */
function makeThumb(doc: PFDocument, frameId: string): string | null {
  try {
    const src = document.createElement('canvas')
    renderCompositeToCanvas(doc, frameId, src)
    const tw = 128
    const th = Math.max(1, Math.round((doc.height / Math.max(1, doc.width)) * tw))
    const out = document.createElement('canvas')
    out.width = tw
    out.height = th
    const ctx = out.getContext('2d')
    if (!ctx) return null
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(src, 0, 0, tw, th)
    return out.toDataURL('image/png')
  } catch {
    return null
  }
}

function downloadPfa() {
  const { doc } = useEditorStore.getState()
  const json = serializeDoc(doc)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${sanitizeFilename(doc.name)}.pfa`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function CloudSaveDialog() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const handler = () => {
      setName(useEditorStore.getState().doc.name)
      setOpen(true)
    }
    window.addEventListener('pf:menu-cloud-save', handler)
    return () => window.removeEventListener('pf:menu-cloud-save', handler)
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const { doc, activeFrameId, projectId } = useEditorStore.getState()
      const body = JSON.stringify({
        name: name.trim() || doc.name,
        width: doc.width,
        height: doc.height,
        dataJson: serializeDoc(doc),
        thumb: makeThumb(doc, activeFrameId),
      })
      const res = await fetch(
        projectId ? `/api/projects/${encodeURIComponent(projectId)}` : '/api/projects',
        {
          method: projectId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        },
      )
      if (!res.ok) throw new Error(`Save failed (HTTP ${res.status})`)
      const json = asRecord(await res.json())
      const proj = asRecord(json?.project) ?? json
      const id = pickString(proj, 'id', 'projectId', '_id')
      const finalName = name.trim() || doc.name
      useEditorStore.getState().setDocName(finalName)
      useEditorStore.getState().markSaved(id ?? null)
      toast({
        title: projectId ? 'Project updated' : 'Project saved to cloud',
        description: `${name.trim() || doc.name} — ${doc.width}×${doc.height}px`,
      })
      setOpen(false)
    } catch (e) {
      toast({
        title: 'Save failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Save to Cloud</DialogTitle>
          <DialogDescription>
            Stores the project (all layers &amp; frames) server-side so you can reopen it anywhere.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5 py-1">
          <Label htmlFor="pf-cloud-name">Project name</Label>
          <Input
            id="pf-cloud-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Untitled sprite"
          />
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={downloadPfa}>
            <Download className="size-4" />
            Download .pfa
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
            {saving ? 'Saving…' : 'Save to cloud'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
