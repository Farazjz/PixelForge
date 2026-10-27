'use client'

// PixelForge AI — Settings dialog: AI provider profiles (BYO OpenAI-compatible) + interface prefs.
// Opens on window event 'pf:menu-settings'. API keys live only in browser localStorage.

import { useCallback, useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { CheckCircle2, Loader2, Pencil, PlugZap, Plus, Trash2, XCircle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { BUILTIN_PROFILE_ID, useSettingsStore } from '@/lib/pixelforge/settings-store'
import type { AIProfile } from '@/lib/pixelforge/types'
import { cn } from '@/lib/utils'

// ---- defensive JSON helpers ----

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

interface ProfileForm {
  name: string
  baseUrl: string
  apiKey: string
  textModel: string
  imageModel: string
  editModel: string
  timeoutMs: string
  maxRetries: string
  headers: string
}

const EMPTY_FORM: ProfileForm = {
  name: '',
  baseUrl: '',
  apiKey: '',
  textModel: '',
  imageModel: '',
  editModel: '',
  timeoutMs: '120000',
  maxRetries: '2',
  headers: '',
}

function maskKey(key: string | undefined): string {
  if (!key) return 'no key'
  return `••••${key.slice(-4)}`
}

export function SettingsDialog() {
  const [open, setOpen] = useState(false)

  // settings store
  const profiles = useSettingsStore((s) => s.profiles)
  const activeProfileId = useSettingsStore((s) => s.activeProfileId)
  const autosaveEnabled = useSettingsStore((s) => s.autosaveEnabled)
  const defaultGridVisible = useSettingsStore((s) => s.defaultGridVisible)
  const defaultOnionSkin = useSettingsStore((s) => s.defaultOnionSkin)
  const hydrate = useSettingsStore((s) => s.hydrate)
  const upsertProfile = useSettingsStore((s) => s.upsertProfile)
  const deleteProfile = useSettingsStore((s) => s.deleteProfile)
  const setActiveProfile = useSettingsStore((s) => s.setActiveProfile)
  const setSettings = useSettingsStore((s) => s.set)

  const { theme, setTheme } = useTheme()

  // profile form
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM)
  const [existingKey, setExistingKey] = useState<string | undefined>(undefined)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('pf:menu-settings', handler)
    return () => window.removeEventListener('pf:menu-settings', handler)
  }, [])

  // Load persisted settings from localStorage when mounted
  useEffect(() => {
    hydrate()
  }, [hydrate])

  const setField = (patch: Partial<ProfileForm>) => setForm((f) => ({ ...f, ...patch }))

  const startNew = useCallback(() => {
    setEditingId(null)
    setExistingKey(undefined)
    setForm(EMPTY_FORM)
    setTestResult(null)
  }, [])

  const startEdit = useCallback((p: AIProfile) => {
    setEditingId(p.id)
    setExistingKey(p.apiKey)
    setForm({
      name: p.name,
      baseUrl: p.baseUrl ?? '',
      apiKey: '',
      textModel: p.textModel ?? '',
      imageModel: p.imageModel ?? '',
      editModel: p.editModel ?? '',
      timeoutMs: String(p.timeoutMs ?? 120000),
      maxRetries: String(p.maxRetries ?? 2),
      headers: p.headers ?? '',
    })
    setTestResult(null)
  }, [])

  const saveProfile = () => {
    const id = editingId ?? `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const timeout = Number(form.timeoutMs)
    const retries = Number(form.maxRetries)
    const profile: AIProfile = {
      id,
      kind: id === BUILTIN_PROFILE_ID ? 'builtin' : 'custom',
      name: form.name.trim() || (id === BUILTIN_PROFILE_ID ? 'Built-in AI (Z.ai sandbox)' : 'Untitled provider'),
      baseUrl: form.baseUrl.trim() || undefined,
      apiKey: form.apiKey.trim() ? form.apiKey.trim() : existingKey,
      textModel: form.textModel.trim() || undefined,
      imageModel: form.imageModel.trim() || undefined,
      editModel: form.editModel.trim() || undefined,
      timeoutMs: Number.isFinite(timeout) && timeout > 0 ? Math.round(timeout) : undefined,
      maxRetries: Number.isFinite(retries) ? Math.max(0, Math.round(retries)) : undefined,
      headers: form.headers.trim() || undefined,
    }
    upsertProfile(profile)
    setEditingId(id)
    setExistingKey(profile.apiKey)
    setForm((f) => ({ ...f, apiKey: '' }))
  }

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/ai/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: form.baseUrl.trim() || undefined,
          apiKey: form.apiKey.trim() ? form.apiKey.trim() : existingKey,
          textModel: form.textModel.trim() || undefined,
        }),
      })
      const json = asRecord(await res.json())
      const ok = res.ok && json?.ok === true
      const models = json?.models
      const modelCount =
        pickNumber(json, 'modelCount', 'count') ?? (Array.isArray(models) ? models.length : undefined)
      const errMsg = pickString(json, 'error', 'message')
      if (ok) {
        setTestResult({
          ok: true,
          message: modelCount !== undefined ? `Connected — ${modelCount} models available` : 'Connection OK',
        })
      } else {
        setTestResult({ ok: false, message: errMsg ?? `Request failed (HTTP ${res.status})` })
      }
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : 'Network error' })
    } finally {
      setTesting(false)
    }
  }

  const inputCls = 'h-8'

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>AI providers and studio preferences. Keys never leave your browser.</DialogDescription>
        </DialogHeader>

        {/* ============ AI Providers ============ */}
        <section aria-label="AI providers" className="grid gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100">AI Providers</h3>
            <Button variant="outline" size="sm" onClick={startNew}>
              <Plus className="size-4" />
              Add provider
            </Button>
          </div>

          <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
            {profiles.map((p) => (
              <div
                key={p.id}
                className={cn(
                  'flex items-center gap-3 rounded-lg border p-2.5',
                  p.id === activeProfileId ? 'border-violet-500/50 bg-violet-500/5' : 'border-zinc-800 bg-zinc-900/60',
                )}
              >
                <RadioGroup
                  value={activeProfileId}
                  onValueChange={setActiveProfile}
                  className="flex items-center"
                  aria-label={`Use ${p.name}`}
                >
                  <RadioGroupItem value={p.id} aria-label={`Set ${p.name} as active`} />
                </RadioGroup>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-zinc-100">{p.name}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'h-4 px-1 text-[10px] uppercase tracking-wide',
                        p.kind === 'builtin'
                          ? 'border-violet-500/40 text-violet-300'
                          : 'border-zinc-600 text-zinc-400',
                      )}
                    >
                      {p.kind}
                    </Badge>
                  </div>
                  <div className="truncate text-xs text-zinc-500">
                    {p.baseUrl ? p.baseUrl : 'built-in sandbox endpoint'} · key: {maskKey(p.apiKey)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                  aria-label={`Edit ${p.name}`}
                  onClick={() => startEdit(p)}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-400"
                  aria-label={`Delete ${p.name}`}
                  disabled={p.id === BUILTIN_PROFILE_ID}
                  onClick={() => deleteProfile(p.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>

          {/* ---- profile form ---- */}
          <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {editingId ? 'Edit provider' : 'New provider'}
              </span>
              {editingId ? (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-400" onClick={startNew}>
                  Cancel edit
                </Button>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="pf-prof-name">Name</Label>
                <Input
                  id="pf-prof-name"
                  className={inputCls}
                  value={form.name}
                  onChange={(e) => setField({ name: e.target.value })}
                  placeholder="My OpenAI-compatible server"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pf-prof-url">Base URL</Label>
                <Input
                  id="pf-prof-url"
                  className={inputCls}
                  value={form.baseUrl}
                  onChange={(e) => setField({ baseUrl: e.target.value })}
                  placeholder="https://api.example.com/v1"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="pf-prof-key">API key</Label>
              <Input
                id="pf-prof-key"
                type="password"
                autoComplete="off"
                className={inputCls}
                value={form.apiKey}
                onChange={(e) => setField({ apiKey: e.target.value })}
                placeholder={existingKey ? maskKey(existingKey) : 'sk-…'}
              />
              <p className="text-xs text-zinc-500">
                {existingKey
                  ? `Existing key: ${maskKey(existingKey)} — leave blank to keep it. `
                  : ''}
                Stored only in your browser. Never included in project files or logs.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pf-prof-text">Text model</Label>
                <Input
                  id="pf-prof-text"
                  className={inputCls}
                  value={form.textModel}
                  onChange={(e) => setField({ textModel: e.target.value })}
                  placeholder="gpt-4o-mini"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pf-prof-image">Image model</Label>
                <Input
                  id="pf-prof-image"
                  className={inputCls}
                  value={form.imageModel}
                  onChange={(e) => setField({ imageModel: e.target.value })}
                  placeholder="cogview-3-flash"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pf-prof-edit">Edit model</Label>
                <Input
                  id="pf-prof-edit"
                  className={inputCls}
                  value={form.editModel}
                  onChange={(e) => setField({ editModel: e.target.value })}
                  placeholder="image-edit model id"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="pf-prof-timeout">Timeout (ms)</Label>
                <Input
                  id="pf-prof-timeout"
                  type="number"
                  min={1000}
                  className={inputCls}
                  value={form.timeoutMs}
                  onChange={(e) => setField({ timeoutMs: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pf-prof-retries">Max retries</Label>
                <Input
                  id="pf-prof-retries"
                  type="number"
                  min={0}
                  className={inputCls}
                  value={form.maxRetries}
                  onChange={(e) => setField({ maxRetries: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="pf-prof-headers">Custom headers (JSON)</Label>
              <Textarea
                id="pf-prof-headers"
                className="min-h-16 font-mono text-xs"
                value={form.headers}
                onChange={(e) => setField({ headers: e.target.value })}
                placeholder={'{ "X-Custom-Header": "value" }'}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={saveProfile}>
                {editingId ? 'Save changes' : 'Add provider'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => void testConnection()} disabled={testing}>
                {testing ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
                Test connection
              </Button>
              {testResult ? (
                <span
                  className={cn(
                    'flex items-center gap-1.5 text-xs',
                    testResult.ok ? 'text-emerald-400' : 'text-rose-400',
                  )}
                  role="status"
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="size-3.5 shrink-0" />
                  ) : (
                    <XCircle className="size-3.5 shrink-0" />
                  )}
                  {testResult.message}
                </span>
              ) : null}
            </div>
          </div>
        </section>

        <Separator />

        {/* ============ Interface ============ */}
        <section aria-label="Interface" className="grid gap-3">
          <h3 className="text-sm font-semibold text-zinc-100">Interface</h3>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="pf-set-theme" className="text-sm text-zinc-300">
              Theme
            </Label>
            <Select value="dark" onValueChange={() => { /* dark studio theme is the only fully-supported theme */ }} disabled>
              <SelectTrigger id="pf-set-theme" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dark">Dark (studio)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-zinc-500">The dark studio theme is currently the only theme. Light theme is planned — see Help → About.</p>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="pf-set-autosave" className="text-sm text-zinc-300">
                Autosave
              </Label>
              <p className="text-xs text-zinc-500">Periodically save the project to the cloud.</p>
            </div>
            <Switch
              id="pf-set-autosave"
              checked={autosaveEnabled}
              onCheckedChange={(v) => setSettings({ autosaveEnabled: v })}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="pf-set-grid" className="text-sm text-zinc-300">
                Show grid by default
              </Label>
              <p className="text-xs text-zinc-500">Grid overlay for new projects.</p>
            </div>
            <Switch
              id="pf-set-grid"
              checked={defaultGridVisible}
              onCheckedChange={(v) => setSettings({ defaultGridVisible: v })}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="pf-set-onion" className="text-sm text-zinc-300">
                Onion skin by default
              </Label>
              <p className="text-xs text-zinc-500">Ghost previous frame while drawing.</p>
            </div>
            <Switch
              id="pf-set-onion"
              checked={defaultOnionSkin}
              onCheckedChange={(v) => setSettings({ defaultOnionSkin: v })}
            />
          </div>
        </section>
      </DialogContent>
    </Dialog>
  )
}
