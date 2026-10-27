'use client'

// PixelForge AI — AI Studio panel (right sidebar).
// Tabs: "Generate" (text-to-image + client-side pixel pipeline) and "AI Edit"
// (image-to-image edit endpoint + local guided suggestions).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Download,
  FilePlus2,
  History,
  ImageDown,
  Layers,
  Link2,
  Loader2,
  Palette,
  Settings2,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useToast } from '@/hooks/use-toast'
import {
  applyColorMap,
  celToCanvas,
  compositeFrame,
  imageToCel,
  loadImage,
  outlineCel,
  quantize,
  removeBackground,
  renderCompositeToCanvas,
} from '@/lib/pixelforge/engine'
import { useEditorStore } from '@/lib/pixelforge/store'
import { useSettingsStore } from '@/lib/pixelforge/settings-store'
import type { AIProfile, GuidedEditSuggestion } from '@/lib/pixelforge/types'
import { PROMPT_TEMPLATES } from '@/lib/pixelforge/palettes'

// ---------- constants & helpers ----------

type Detail = 'low' | 'medium' | 'high'
type StyleId = 'none' | 'retro-rpg' | 'game-sprite' | 'ui-icon' | 'isometric' | 'tileable-texture' | 'character-portrait'

const HISTORY_KEY = 'pixelforge.ai.history.v1'
const HISTORY_MAX = 20

const OUTLINE_COLOR: [number, number, number, number] = [10, 10, 10, 255]

const CHECKER_STYLE: React.CSSProperties = {
  backgroundImage: 'repeating-conic-gradient(#3f3f46 0% 25%, #27272a 0% 50%)',
  backgroundSize: '8px 8px',
}

const STYLE_OPTIONS: { value: StyleId; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'retro-rpg', label: 'Retro RPG' },
  { value: 'game-sprite', label: 'Game sprite' },
  { value: 'ui-icon', label: 'UI icon' },
  { value: 'isometric', label: 'Isometric' },
  { value: 'tileable-texture', label: 'Tileable texture' },
  { value: 'character-portrait', label: 'Character portrait' },
]

interface GenResult {
  id: string
  prompt: string
  beforeUrl: string
  cel: Uint8ClampedArray
  w: number
  h: number
  palette?: string[]
}

interface HistoryItem {
  prompt: string
  thumb: string
  w: number
  h: number
  createdAt: number
}

interface HistoryPick {
  item: HistoryItem
  cel: Uint8ClampedArray
  w: number
  h: number
}

const uid = () => `r${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`

function clampInt(raw: string, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function loadHistory(): HistoryItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (it): it is HistoryItem =>
        !!it &&
        typeof (it as HistoryItem).thumb === 'string' &&
        typeof (it as HistoryItem).prompt === 'string' &&
        typeof (it as HistoryItem).w === 'number' &&
        typeof (it as HistoryItem).h === 'number',
    )
  } catch {
    return []
  }
}

function persistHistory(items: HistoryItem[]) {
  if (typeof window === 'undefined') return
  // Data URLs can be large — on quota errors progressively drop the oldest items.
  let list = items.slice(0, HISTORY_MAX)
  for (;;) {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(list))
      return
    } catch {
      if (list.length <= 1) return
      list = list.slice(0, Math.floor(list.length / 2))
    }
  }
}

function parseSuggestion(text: string): GuidedEditSuggestion | null {
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence && fence[1]) t = fence[1].trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start >= 0 && end > start) t = t.slice(start, end + 1)
  try {
    const obj = JSON.parse(t) as Partial<GuidedEditSuggestion>
    if (typeof obj.summary !== 'string' || !Array.isArray(obj.steps)) return null
    const steps = obj.steps.filter((s): s is string => typeof s === 'string')
    const colorMap = Array.isArray(obj.colorMap)
      ? obj.colorMap.filter(
          (m): m is { from: string; to: string } =>
            !!m && typeof m.from === 'string' && typeof m.to === 'string',
        )
      : []
    return { summary: obj.summary, steps, colorMap }
  } catch {
    return null
  }
}

// ---------- small presentational pieces ----------

function CelPreview({ cel, w, h }: { cel: Uint8ClampedArray; w: number; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    celToCanvas(cel, w, h, c)
  }, [cel, w, h])
  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      className="block h-auto w-full"
      style={{ ...CHECKER_STYLE, imageRendering: 'pixelated' }}
      aria-label={`Pixel preview ${w}x${h}`}
      role="img"
    />
  )
}

function BeforePreview({ url, w, h }: { url: string; w: number; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let cancelled = false
    loadImage(url)
      .then((img) => {
        if (cancelled) return
        const c = ref.current
        if (!c) return
        c.width = w
        c.height = h
        const ctx = c.getContext('2d')
        if (!ctx) return
        ctx.imageSmoothingEnabled = false
        ctx.clearRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
      })
      .catch(() => {
        /* preview only — result cards keep the processed cel */
      })
    return () => {
      cancelled = true
    }
  }, [url, w, h])
  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      className="block h-auto w-full"
      style={{ ...CHECKER_STYLE, imageRendering: 'pixelated' }}
      aria-label={`Raw image preview ${w}x${h}`}
      role="img"
    />
  )
}

function ResultCard({ result }: { result: GenResult }) {
  const [showBefore, setShowBefore] = useState(false)
  const toast = useToast().toast

  const importAsLayer = useCallback(() => {
    const st = useEditorStore.getState()
    st.importImageIntoDoc(result.cel, result.w, result.h, 'new-layer')
    toast({
      title: 'Imported as new layer',
      description: 'The processed image was added as its own layer (scaled to fit the document if needed).',
    })
  }, [result, toast])

  const importAsNewDoc = useCallback(() => {
    const st = useEditorStore.getState()
    st.newDoc(result.w, result.h, (result.prompt || 'AI image').slice(0, 24))
    useEditorStore.getState().importImageIntoDoc(result.cel, result.w, result.h, 'replace-layer')
    toast({
      title: 'New document created',
      description: `${result.w}×${result.h} document created and the image imported into it.`,
    })
  }, [result, toast])

  const savePng = useCallback(() => {
    const canvas = celToCanvas(result.cel, result.w, result.h)
    downloadDataUrl(canvas.toDataURL('image/png'), `pixelforge-${result.w}x${result.h}-${result.id}.png`)
  }, [result])

  const addPalette = useCallback(() => {
    if (!result.palette || result.palette.length === 0) return
    const st = useEditorStore.getState()
    const seen = new Set<string>()
    const merged: string[] = []
    for (const c of [...result.palette, ...st.doc.palette]) {
      const key = c.toUpperCase()
      if (!seen.has(key)) {
        seen.add(key)
        merged.push(key)
      }
    }
    st.setDocPalette(merged)
    toast({
      title: 'Palette added',
      description: `Extracted palette merged into the document (${merged.length} colors total).`,
    })
  }, [result, toast])

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
            {result.w}×{result.h}
          </Badge>
          {result.palette && result.palette.length > 0 && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {result.palette.length} colors
            </Badge>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 shrink-0 px-2 text-[11px]"
          onClick={() => setShowBefore((v) => !v)}
        >
          {showBefore ? 'Show after' : 'Show before'}
        </Button>
      </div>
      <div className="overflow-hidden rounded border border-zinc-200 dark:border-zinc-800">
        {showBefore ? (
          <BeforePreview url={result.beforeUrl} w={result.w} h={result.h} />
        ) : (
          <CelPreview cel={result.cel} w={result.w} h={result.h} />
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={importAsLayer}>
          <Layers className="size-3" /> Import as layer
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={importAsNewDoc}>
          <FilePlus2 className="size-3" /> New document
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={savePng}>
          <Download className="size-3" /> Save PNG
        </Button>
        {result.palette && result.palette.length > 0 && (
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={addPalette}>
            <Palette className="size-3" /> Add palette
          </Button>
        )}
      </div>
    </div>
  )
}

// ---------- main panel ----------

export default function AIStudioPanel() {
  const toast = useToast().toast

  // ----- store subscriptions -----
  const doc = useEditorStore((s) => s.doc)
  const activeFrameId = useEditorStore((s) => s.activeFrameId)
  const activeLayerId = useEditorStore((s) => s.activeLayerId)
  const newDoc = useEditorStore((s) => s.newDoc)
  const importImageIntoDoc = useEditorStore((s) => s.importImageIntoDoc)
  const setDocPalette = useEditorStore((s) => s.setDocPalette)

  const settingsLoaded = useSettingsStore((s) => s.loaded)
  const hydrateSettings = useSettingsStore((s) => s.hydrate)
  // getActiveProfile() resolves the active profile — stable object reference, safe as selector.
  const profile = useSettingsStore((s) => s.getActiveProfile())

  // ----- provider chip state -----
  const providerStatus: 'builtin' | 'complete' | 'incomplete' = useMemo(() => {
    if (profile.kind !== 'custom') return 'builtin'
    return profile.baseUrl && profile.imageModel ? 'complete' : 'incomplete'
  }, [profile])
  const statusColor =
    providerStatus === 'builtin'
      ? 'bg-violet-500'
      : providerStatus === 'complete'
        ? 'bg-emerald-500'
        : 'bg-amber-500'

  const customProfilePayload = useCallback(
    (p: AIProfile) => ({
      baseUrl: p.baseUrl,
      apiKey: p.apiKey,
      imageModel: p.imageModel,
      timeoutMs: p.timeoutMs,
      maxRetries: p.maxRetries,
    }),
    [],
  )

  // ----- generate form state -----
  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [widthStr, setWidthStr] = useState(String(doc.width))
  const [heightStr, setHeightStr] = useState(String(doc.height))
  const [style, setStyle] = useState<StyleId>('none')
  const [limitPalette, setLimitPalette] = useState(false)
  const [paletteSize, setPaletteSize] = useState(16)
  const [transparentBg, setTransparentBg] = useState(true)
  const [darkOutline, setDarkOutline] = useState(false)
  const [detail, setDetail] = useState<Detail>('medium')
  const [seedStr, setSeedStr] = useState('')

  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [results, setResults] = useState<GenResult[]>([])

  const abortRef = useRef<AbortController | null>(null)

  // ----- history state -----
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [historyPick, setHistoryPick] = useState<HistoryPick | null>(null)

  useEffect(() => {
    if (!settingsLoaded) hydrateSettings()
    setHistory(loadHistory())
  }, [settingsLoaded, hydrateSettings])

  // honest elapsed-seconds counter (no fake progress)
  useEffect(() => {
    if (!loading) return
    setElapsed(0)
    const startedAt = Date.now()
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(iv)
  }, [loading])

  const saveToHistory = useCallback((items: HistoryItem[]) => {
    const trimmed = items.slice(0, HISTORY_MAX)
    setHistory(trimmed)
    persistHistory(trimmed)
  }, [])

  const pushToHistory = useCallback(
    (item: HistoryItem) => {
      const current = loadHistory()
      saveToHistory([item, ...current])
    },
    [saveToHistory],
  )

  const clearHistory = useCallback(() => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(HISTORY_KEY)
    setHistory([])
    setHistoryPick(null)
    toast({ title: 'History cleared' })
  }, [toast])

  const syncSizeFromDoc = useCallback(() => {
    setWidthStr(String(useEditorStore.getState().doc.width))
    setHeightStr(String(useEditorStore.getState().doc.height))
  }, [])

  // ----- generate -----
  const generate = useCallback(async () => {
    if (loading) {
      abortRef.current?.abort()
      return
    }
    const w = clampInt(widthStr, doc.width, 8, 1024)
    const h = clampInt(heightStr, doc.height, 8, 1024)
    if (!prompt.trim()) {
      setError('Prompt is required — describe what to generate.')
      toast({ title: 'Prompt required', variant: 'destructive' })
      return
    }

    setError(null)
    setWarning(null)
    setLoading(true)
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          prompt,
          negativePrompt,
          width: w,
          height: h,
          style,
          paletteSize: limitPalette ? paletteSize : 0,
          transparentBg,
          outline: darkOutline,
          detail,
          seed: profile.kind === 'custom' && seedStr.trim() !== '' ? clampInt(seedStr, 0, 0, Number.MAX_SAFE_INTEGER) : undefined,
          provider: profile.kind,
          profile: profile.kind === 'custom' ? customProfilePayload(profile) : undefined,
        }),
      })
      const data: unknown = await res.json().catch(() => null)
      if (!res.ok) {
        const msg =
          !!data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
            ? (data as { error: string }).error
            : `Generation failed (HTTP ${res.status})`
        throw new Error(msg)
      }
      const images =
        !!data && typeof data === 'object' && 'images' in data && Array.isArray((data as { images: unknown }).images)
          ? (data as { images: unknown[] }).images.filter((x): x is string => typeof x === 'string')
          : []
      if (images.length === 0) throw new Error('Provider returned no images.')

      const respWarning =
        !!data && typeof data === 'object' && 'warning' in data && typeof (data as { warning: unknown }).warning === 'string'
          ? (data as { warning: string }).warning
          : null
      if (respWarning) setWarning(respWarning)

      // ---- client-side pixel pipeline (core product logic) ----
      const built: GenResult[] = []
      for (const dataUrl of images) {
        const img = await loadImage(dataUrl)
        let cel = imageToCel(img, w, h)
        if (transparentBg) removeBackground(cel, w, h, 32)
        let palette: string[] | undefined
        if (limitPalette && paletteSize >= 2) {
          const out = quantize(cel, paletteSize)
          cel = out.data
          palette = out.palette.filter((c) => typeof c === 'string' && c.length > 0)
        }
        if (darkOutline) outlineCel(cel, w, h, OUTLINE_COLOR)
        built.push({ id: uid(), prompt, beforeUrl: dataUrl, cel, w, h, palette })
        pushToHistory({ prompt, thumb: dataUrl, w, h, createdAt: Date.now() })
      }
      setResults((prev) => [...built, ...prev].slice(0, 12))
      toast({
        title: images.length === 1 ? 'Image generated' : `${images.length} images generated`,
        description: `Pixel pipeline applied at ${w}×${h}.`,
      })
    } catch (e) {
      if (isAbortError(e)) {
        toast({ title: 'Generation cancelled' })
      } else {
        const msg = errorMessage(e)
        setError(msg)
        toast({ title: 'Generation failed', description: msg, variant: 'destructive' })
      }
    } finally {
      abortRef.current = null
      setLoading(false)
    }
  }, [
    loading, widthStr, heightStr, doc.width, doc.height, prompt, negativePrompt, style,
    limitPalette, paletteSize, transparentBg, darkOutline, detail, seedStr, profile,
    customProfilePayload, toast, pushToHistory,
  ])

  // ----- history pick -----
  const openHistoryItem = useCallback(
    (item: HistoryItem) => {
      loadImage(item.thumb)
        .then((img) => {
          const cel = imageToCel(img, item.w, item.h)
          // Apply the current global toggles lightly (no palette re-extraction).
          if (transparentBg) removeBackground(cel, item.w, item.h, 32)
          if (darkOutline) outlineCel(cel, item.w, item.h, OUTLINE_COLOR)
          setHistoryPick({ item, cel, w: item.w, h: item.h })
        })
        .catch((err: unknown) => {
          toast({ title: 'Could not load history image', description: errorMessage(err), variant: 'destructive' })
        })
    },
    [transparentBg, darkOutline, toast],
  )

  const importHistoryPick = useCallback(() => {
    if (!historyPick) return
    const st = useEditorStore.getState()
    st.importImageIntoDoc(historyPick.cel, historyPick.w, historyPick.h, 'new-layer')
    toast({
      title: 'Imported as new layer',
      description: 'History image added as its own layer (original layer untouched).',
    })
  }, [historyPick, toast])

  const saveHistoryPickPng = useCallback(() => {
    if (!historyPick) return
    const canvas = celToCanvas(historyPick.cel, historyPick.w, historyPick.h)
    downloadDataUrl(
      canvas.toDataURL('image/png'),
      `pixelforge-${historyPick.w}x${historyPick.h}-history.png`,
    )
  }, [historyPick])

  // ----- AI Edit: Mode A (image-to-image, custom only) -----
  const [editInstruction, setEditInstruction] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editResultUrl, setEditResultUrl] = useState<string | null>(null)

  const isBuiltin = profile.kind !== 'custom'

  const runEdit = useCallback(async () => {
    if (editLoading) return
    if (!editInstruction.trim()) {
      setEditError('Describe the edit you want first.')
      return
    }
    setEditError(null)
    setEditLoading(true)
    try {
      const st = useEditorStore.getState()
      const canvas = document.createElement('canvas')
      renderCompositeToCanvas(st.doc, st.activeFrameId, canvas)
      const imageDataUrl = canvas.toDataURL('image/png')
      const res = await fetch('/api/ai/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: editInstruction,
          imageDataUrl,
          provider: isBuiltin ? 'builtin' : 'custom',
          profile: isBuiltin
            ? undefined
            : {
                baseUrl: profile.baseUrl,
                apiKey: profile.apiKey,
                editModel: profile.editModel || profile.imageModel,
                imageModel: profile.imageModel,
                timeoutMs: profile.timeoutMs,
                maxRetries: profile.maxRetries,
              },
        }),
      })
      const data: unknown = await res.json().catch(() => null)
      if (!res.ok) {
        const msg =
          !!data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
            ? (data as { error: string }).error
            : `Edit failed (HTTP ${res.status})`
        throw new Error(msg)
      }
      const image =
        !!data && typeof data === 'object' && 'image' in data && typeof (data as { image: unknown }).image === 'string'
          ? (data as { image: string }).image
          : null
      if (!image) throw new Error('Edit endpoint returned no image.')
      setEditResultUrl(image)
      toast({ title: 'Edit result ready', description: 'Review it below, then import it as a duplicate layer.' })
    } catch (e) {
      const msg = errorMessage(e)
      setEditError(msg)
      toast({ title: 'Image edit failed', description: msg, variant: 'destructive' })
    } finally {
      setEditLoading(false)
    }
  }, [isBuiltin, editLoading, editInstruction, profile, toast])

  const importEditResult = useCallback(async () => {
    if (!editResultUrl) return
    try {
      const st = useEditorStore.getState()
      const img = await loadImage(editResultUrl)
      const cel = imageToCel(img, st.doc.width, st.doc.height)
      st.importImageIntoDoc(cel, st.doc.width, st.doc.height, 'new-layer')
      toast({
        title: 'Imported as duplicate layer',
        description: 'Your original artwork stays untouched — the result sits on its own new layer.',
      })
    } catch (e) {
      toast({ title: 'Import failed', description: errorMessage(e), variant: 'destructive' })
    }
  }, [editResultUrl, toast])

  // ----- AI Edit: Mode B (guided suggestions) -----
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)
  const [suggestion, setSuggestion] = useState<GuidedEditSuggestion | null>(null)
  const [rawSuggestion, setRawSuggestion] = useState<string | null>(null)

  const getSuggestions = useCallback(async () => {
    if (suggestLoading) return
    if (!editInstruction.trim()) {
      setSuggestError('Describe what you want changed first.')
      return
    }
    setSuggestError(null)
    setSuggestion(null)
    setRawSuggestion(null)
    setSuggestLoading(true)
    try {
      const st = useEditorStore.getState()
      const canvas = document.createElement('canvas')
      renderCompositeToCanvas(st.doc, st.activeFrameId, canvas)
      const compositeDataUrl = canvas.toDataURL('image/png')
      const built =
        'You are a pixel art editing assistant. Here is the image as a data URL: ' +
        compositeDataUrl +
        ' . The document palette is: ' +
        st.doc.palette.join(',') +
        '. The user wants: ' +
        editInstruction +
        '. Reply ONLY with JSON: {"summary": string, "steps": string[], "colorMap": [{"from": "#RRGGBB", "to": "#RRGGBB"}]}. colorMap maps existing palette colors to replacements. Keep it terse.'
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: built }],
          provider: profile.kind,
          profile:
            profile.kind === 'custom'
              ? {
                  baseUrl: profile.baseUrl,
                  apiKey: profile.apiKey,
                  textModel: profile.textModel,
                  timeoutMs: profile.timeoutMs,
                  maxRetries: profile.maxRetries,
                }
              : undefined,
        }),
      })
      const data: unknown = await res.json().catch(() => null)
      if (!res.ok) {
        const msg =
          !!data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
            ? (data as { error: string }).error
            : `Suggestions failed (HTTP ${res.status})`
        throw new Error(msg)
      }
      const text =
        !!data && typeof data === 'object' && 'text' in data && typeof (data as { text: unknown }).text === 'string'
          ? (data as { text: string }).text
          : ''
      if (!text) throw new Error('Chat endpoint returned an empty response.')
      const parsed = parseSuggestion(text)
      if (parsed) setSuggestion(parsed)
      else setRawSuggestion(text)
    } catch (e) {
      const msg = errorMessage(e)
      setSuggestError(msg)
      toast({ title: 'Guided suggestions failed', description: msg, variant: 'destructive' })
    } finally {
      setSuggestLoading(false)
    }
  }, [suggestLoading, editInstruction, profile, toast])

  const applyColorMapToCopy = useCallback(() => {
    if (!suggestion || suggestion.colorMap.length === 0) return
    const st = useEditorStore.getState()
    const comp = compositeFrame(st.doc, st.activeFrameId)
    applyColorMap(comp, suggestion.colorMap)
    st.importImageIntoDoc(comp, st.doc.width, st.doc.height, 'new-layer')
    toast({ title: 'Applied to new layer', description: 'The recolored copy was added as a new layer.' })
  }, [suggestion, toast])

  const activeLayerName = useMemo(
    () => doc.layers.find((l) => l.id === activeLayerId)?.name ?? 'layer',
    [doc.layers, activeLayerId],
  )
  void activeFrameId
  void activeLayerName

  const formDisabled = loading

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs defaultValue="generate" className="flex min-h-0 flex-1 flex-col gap-3">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="generate" className="gap-1.5 text-xs">
            <Sparkles className="size-3.5" /> Generate
          </TabsTrigger>
          <TabsTrigger value="edit" className="gap-1.5 text-xs">
            <Wand2 className="size-3.5" /> AI Edit
          </TabsTrigger>
        </TabsList>

        {/* ============================= GENERATE ============================= */}
        <TabsContent value="generate" className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="flex flex-col gap-3">
            {/* provider chip */}
            <div className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
              <Badge variant="secondary" className="gap-1.5 bg-zinc-100 dark:bg-zinc-900">
                <span className={`inline-block size-1.5 rounded-full ${statusColor}`} aria-hidden />
                <span className="max-w-[150px] truncate">Provider: {profile.name}</span>
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-[11px]"
                onClick={() => window.dispatchEvent(new CustomEvent('pf:menu-settings'))}
              >
                <Settings2 className="size-3" /> Configure
              </Button>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pf-gen-prompt" className="text-xs">Prompt</Label>
              <Textarea
                id="pf-gen-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the sprite, tile, icon…"
                className="min-h-20 text-sm"
                disabled={formDisabled}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Templates</Label>
              <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                {PROMPT_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={formDisabled}
                    onClick={() => setPrompt(t.template)}
                    className="focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none disabled:opacity-50"
                    aria-label={`Use template: ${t.label}`}
                  >
                    <Badge
                      variant="secondary"
                      className="cursor-pointer border border-transparent bg-zinc-100 text-[11px] font-normal hover:border-violet-400 hover:bg-violet-50 dark:bg-zinc-900 dark:hover:border-violet-500 dark:hover:bg-violet-950"
                    >
                      {t.label}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pf-gen-negative" className="text-xs">Negative prompt</Label>
              <Input
                id="pf-gen-negative"
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="blurry, text, watermark…"
                className="h-8 text-sm"
                disabled={formDisabled}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Size (px)</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={8}
                  max={1024}
                  value={widthStr}
                  onChange={(e) => setWidthStr(e.target.value)}
                  className="h-8 text-sm"
                  aria-label="Width in pixels"
                  disabled={formDisabled}
                />
                <span className="text-xs text-zinc-500">×</span>
                <Input
                  type="number"
                  min={8}
                  max={1024}
                  value={heightStr}
                  onChange={(e) => setHeightStr(e.target.value)}
                  className="h-8 text-sm"
                  aria-label="Height in pixels"
                  disabled={formDisabled}
                />
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0"
                        onClick={syncSizeFromDoc}
                        disabled={formDisabled}
                        aria-label="Reset size from document"
                      >
                        <Link2 className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Reset size from document ({doc.width}×{doc.height})</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Style</Label>
              <Select value={style} onValueChange={(v) => setStyle(v as StyleId)} disabled={formDisabled}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STYLE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2 rounded-md border border-zinc-200 p-2.5 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="pf-gen-limitpalette" className="text-xs">Limit palette</Label>
                <Switch
                  id="pf-gen-limitpalette"
                  checked={limitPalette}
                  onCheckedChange={setLimitPalette}
                  disabled={formDisabled}
                />
              </div>
              <div className={limitPalette ? 'flex flex-col gap-1.5' : 'pointer-events-none flex flex-col gap-1.5 opacity-50'}>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="pf-gen-palettesize" className="text-[11px] text-zinc-500">
                    Palette size
                  </Label>
                  <span className="font-mono text-[11px] text-zinc-500">{paletteSize} colors</span>
                </div>
                <Slider
                  id="pf-gen-palettesize"
                  min={2}
                  max={64}
                  step={1}
                  value={[paletteSize]}
                  onValueChange={(v) => setPaletteSize(v[0] ?? 16)}
                  disabled={formDisabled || !limitPalette}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="pf-gen-transparent" className="text-xs">Transparent background</Label>
                <Switch
                  id="pf-gen-transparent"
                  checked={transparentBg}
                  onCheckedChange={setTransparentBg}
                  disabled={formDisabled}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="pf-gen-outline" className="text-xs">Dark outline</Label>
                <Switch
                  id="pf-gen-outline"
                  checked={darkOutline}
                  onCheckedChange={setDarkOutline}
                  disabled={formDisabled}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Detail</Label>
              <Select value={detail} onValueChange={(v) => setDetail(v as Detail)} disabled={formDisabled}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {profile.kind === 'custom' && (
              <div className="flex flex-col gap-1.5 rounded-md border border-zinc-200 p-2.5 dark:border-zinc-800">
                <Label className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Advanced</Label>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="pf-gen-seed" className="text-xs">Seed</Label>
                  <Input
                    id="pf-gen-seed"
                    type="number"
                    value={seedStr}
                    onChange={(e) => setSeedStr(e.target.value)}
                    placeholder="auto"
                    className="h-8 text-sm"
                    disabled={formDisabled}
                  />
                </div>
              </div>
            )}

            <Button
              type="button"
              onClick={loading ? () => abortRef.current?.abort() : generate}
              disabled={!loading && !prompt.trim()}
              className="w-full gap-1.5 bg-violet-600 text-white hover:bg-violet-700"
              title={loading ? 'Click to cancel' : undefined}
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Generating… {elapsed}s
                  <span className="font-normal opacity-75">(click to cancel)</span>
                </>
              ) : (
                <>
                  <Sparkles className="size-4" /> Generate
                </>
              )}
            </Button>

            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertTitle>Generation failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {warning && (
              <Alert>
                <AlertTriangle className="size-4" />
                <AlertTitle>Provider notice</AlertTitle>
                <AlertDescription>{warning}</AlertDescription>
              </Alert>
            )}

            {results.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Results</Label>
                <ScrollArea className="max-h-[300px]">
                  <div className="flex flex-col gap-3 pr-2">
                    {results.map((r) => (
                      <ResultCard key={r.id} result={r} />
                    ))}
                  </div>
                  <ScrollBar orientation="vertical" />
                </ScrollArea>
              </div>
            )}

            <Separator />

            {/* history strip */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="flex items-center gap-1 text-xs">
                  <History className="size-3.5" /> History
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={clearHistory}
                  disabled={history.length === 0}
                  aria-label="Clear generation history"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              {history.length === 0 ? (
                <p className="text-[11px] text-zinc-500">Generated images are saved here (max 20).</p>
              ) : (
                <ScrollArea className="max-w-full">
                  <div className="flex max-h-28 flex-wrap gap-1.5 pr-2">
                    {history.map((item) => (
                      <button
                        key={`${item.createdAt}-${item.prompt}`}
                        type="button"
                        onClick={() => openHistoryItem(item)}
                        className="group relative size-10 shrink-0 overflow-hidden rounded border border-zinc-200 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none hover:border-violet-400 dark:border-zinc-800 dark:hover:border-violet-500"
                        title={item.prompt}
                        aria-label={`Open history item: ${item.prompt}`}
                      >
                        <img
                          src={item.thumb}
                          alt={item.prompt}
                          className="size-full object-cover"
                          style={CHECKER_STYLE}
                        />
                      </button>
                    ))}
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              )}
            </div>

            {historyPick && (
              <div className="flex flex-col gap-1.5 rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {historyPick.w}×{historyPick.h}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => setHistoryPick(null)}
                    aria-label="Close history preview"
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
                <p className="truncate text-[11px] text-zinc-500" title={historyPick.item.prompt}>
                  {historyPick.item.prompt}
                </p>
                <div className="overflow-hidden rounded border border-zinc-200 dark:border-zinc-800">
                  <CelPreview cel={historyPick.cel} w={historyPick.w} h={historyPick.h} />
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-[11px]"
                    onClick={importHistoryPick}
                  >
                    <Layers className="size-3" /> Import as layer
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-[11px]"
                    onClick={saveHistoryPickPng}
                  >
                    <Download className="size-3" /> Save PNG
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ============================== AI EDIT ============================== */}
        <TabsContent value="edit" className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="flex flex-col gap-3">
            {isBuiltin && (
              <Alert>
                <Sparkles className="size-4 text-violet-500" />
                <AlertTitle>Built-in provider</AlertTitle>
                <AlertDescription>
                  The built-in provider supports text-to-image generation, direct image-to-image
                  editing (Mode A below) and vision-based Guided suggestions. For other providers,
                  configure a custom endpoint in Settings.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
              <Badge variant="secondary" className="gap-1.5 bg-zinc-100 dark:bg-zinc-900">
                <span className={`inline-block size-1.5 rounded-full ${statusColor}`} aria-hidden />
                <span className="max-w-[150px] truncate">Provider: {profile.name}</span>
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-[11px]"
                onClick={() => window.dispatchEvent(new CustomEvent('pf:menu-settings'))}
              >
                <Settings2 className="size-3" /> Configure
              </Button>
            </div>

            {/* Mode A: image-to-image edit (works with builtin + custom providers) */}
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pf-edit-instruction" className="text-xs">
                  Edit instruction (image-to-image)
                </Label>
                <Textarea
                  id="pf-edit-instruction"
                  value={editInstruction}
                  onChange={(e) => setEditInstruction(e.target.value)}
                  placeholder="e.g. change the sword to a glowing axe, keep everything else"
                  className="min-h-16 text-sm"
                  disabled={editLoading}
                />
              </div>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-block">
                      <Button
                        type="button"
                        onClick={runEdit}
                        disabled={editLoading}
                        className="w-full gap-1.5 bg-violet-600 text-white hover:bg-violet-700"
                      >
                        {editLoading ? (
                          <>
                            <Loader2 className="size-4 animate-spin" /> Editing…
                          </>
                        ) : (
                          <>
                            <Wand2 className="size-4" /> Send to image-edit endpoint
                          </>
                        )}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {isBuiltin && (
                    <TooltipContent>
                      Requires a custom provider with an edit model — configure one in Settings.
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>

              {editError && (
                <Alert variant="destructive">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>Edit failed</AlertTitle>
                  <AlertDescription>{editError}</AlertDescription>
                </Alert>
              )}

              {editResultUrl && (
                <div className="flex flex-col gap-1.5 rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
                  <Label className="text-xs">Edit result</Label>
                  <div
                    className="overflow-hidden rounded border border-zinc-200 dark:border-zinc-800"
                    style={CHECKER_STYLE}
                  >
                    <img
                      src={editResultUrl}
                      alt="AI edit result"
                      className="mx-auto block max-h-48 w-auto max-w-full"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-[11px]"
                    onClick={() => void importEditResult()}
                  >
                    <ImageDown className="size-3" /> Import as duplicate layer
                  </Button>
                  <p className="text-[10px] text-zinc-500">
                    Your original artwork stays untouched — the result is imported on its own new
                    layer above “{activeLayerName}”.
                  </p>
                </div>
              )}
            </div>

            <Separator />

            {/* Mode B: guided suggestions (always available) */}
            <section className="flex flex-col gap-2">
              <div>
                <Label className="text-xs">Guided suggestions</Label>
                <p className="text-[10px] text-zinc-500">
                  Guided suggestions — analyzed locally, nothing is auto-applied.
                </p>
              </div>
              <Button
                type="button"
                onClick={getSuggestions}
                disabled={suggestLoading}
                variant="outline"
                className="w-full gap-1.5"
              >
                {suggestLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Analyzing…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" /> Get editing suggestions
                  </>
                )}
              </Button>

              {suggestError && (
                <Alert variant="destructive">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>Suggestions failed</AlertTitle>
                  <AlertDescription>{suggestError}</AlertDescription>
                </Alert>
              )}

              {suggestion && (
                <div className="flex flex-col gap-2 rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
                  <p className="text-xs font-medium">{suggestion.summary}</p>
                  {suggestion.steps.length > 0 && (
                    <ol className="ml-4 list-decimal space-y-0.5 text-[11px] text-zinc-600 dark:text-zinc-400">
                      {suggestion.steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  )}
                  {suggestion.colorMap.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <Label className="text-[11px] text-zinc-500">Suggested color map</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {suggestion.colorMap.map((m, i) => (
                          <span
                            key={`${m.from}-${m.to}-${i}`}
                            className="flex items-center gap-1 rounded border border-zinc-200 px-1 py-0.5 font-mono text-[10px] dark:border-zinc-800"
                          >
                            <span
                              className="inline-block size-3 rounded-sm border border-zinc-400/60"
                              style={{ backgroundColor: m.from }}
                              aria-hidden
                            />
                            {m.from}
                            <ArrowRight className="size-2.5 text-zinc-400" aria-hidden />
                            <span
                              className="inline-block size-3 rounded-sm border border-zinc-400/60"
                              style={{ backgroundColor: m.to }}
                              aria-hidden
                            />
                            {m.to}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 self-start text-[11px]"
                    onClick={applyColorMapToCopy}
                    disabled={suggestion.colorMap.length === 0}
                  >
                    <Palette className="size-3" /> Apply color map to a copy of this layer
                  </Button>
                </div>
              )}

              {rawSuggestion && (
                <div className="flex flex-col gap-1 rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
                  <Label className="text-[11px] text-zinc-500">Raw response (could not parse JSON)</Label>
                  <pre className="max-h-40 overflow-auto rounded bg-zinc-100 p-1.5 font-mono text-[10px] whitespace-pre-wrap dark:bg-zinc-900">
                    {rawSuggestion}
                  </pre>
                </div>
              )}
            </section>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
