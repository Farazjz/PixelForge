'use client'

// PixelForge AI — Import dialog. Opens on window events:
//   'pf:menu-import'            — fired by MenuBar ▸ File ▸ Import Image…
//   'pf:import-file'            — fired by the drag & drop surface (detail: { file: File })
// Imports PNG/JPEG/WebP/BMP/GIF files as a new document, a new layer, or new
// animation frames — with sprite-sheet slicing and pixel-art conversion
// (palette limiting, background removal, dark outline). .pfa project files are
// recognized and opened directly via loadDoc.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  FileImage,
  Grid3x3,
  Import as ImportIcon,
  Info,
  Loader2,
  Scaling,
  Wand2,
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  MAX_CANVAS_DIM,
  deserializeDoc,
  extractRegion,
  imageToCel,
  nearestResizeTo,
  outlineCel,
  quantize,
  removeBackground,
  type RGBA,
} from '@/lib/pixelforge/engine'
import { decodeGifFile, decodeImageFile, sliceSheet, type GifFrame } from '@/lib/pixelforge/import-utils'
import { useEditorStore } from '@/lib/pixelforge/store'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

type ImportMode = 'new-doc' | 'layer' | 'frames'
type Sizing = 'original' | 'resize' | 'crop'

interface ImportCell {
  data: Uint8ClampedArray
  w: number
  h: number
  delayMs: number | null
}

const CHECKER_STYLE: React.CSSProperties = {
  backgroundImage: 'repeating-conic-gradient(#3f3f46 0% 25%, #27272a 0% 50%)',
}

const OUTLINE_COLOR: RGBA = [10, 10, 10, 255]

const ACCEPTED = 'image/png,image/jpeg,image/webp,image/bmp,image/gif,.pfa,.json'

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

const baseName = (fileName: string): string =>
  fileName.replace(/\.[^.]+$/, '').trim().slice(0, 64) || 'Imported image'

function formatLabel(file: File): string {
  const t = (file.type || '').toLowerCase()
  if (t === 'image/png') return 'PNG'
  if (t === 'image/jpeg') return 'JPEG'
  if (t === 'image/webp') return 'WebP'
  if (t === 'image/bmp') return 'BMP'
  if (t === 'image/gif') return 'GIF'
  const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)
  return (ext?.[1] ?? 'image').toUpperCase()
}

const clampDim = (raw: string): number => {
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) ? Math.max(1, Math.min(64, n)) : 1
}

const clampDuration = (ms: number): number => Math.max(10, Math.min(10000, Math.round(ms)))

/** Merge extracted palette colors ahead of the document palette (dedupe, cap 256 in the store). */
function mergeExtractedPalette(extracted: string[]): void {
  if (extracted.length === 0) return
  const st = useEditorStore.getState()
  const seen = new Set<string>()
  const merged: string[] = []
  for (const c of [...extracted, ...st.doc.palette]) {
    const key = c.toUpperCase()
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(key)
    }
  }
  st.setDocPalette(merged)
}

export default function ImportDialog() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [format, setFormat] = useState('—')
  const [gifFrames, setGifFrames] = useState<GifFrame[] | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  const [mode, setMode] = useState<ImportMode>('new-doc')
  const [sizing, setSizing] = useState<Sizing>('original')
  const [sliceOn, setSliceOn] = useState(false)
  const [cols, setCols] = useState('1')
  const [rows, setRows] = useState('1')
  const [limitPalette, setLimitPalette] = useState(false)
  const [paletteN, setPaletteN] = useState(16)
  const [removeBg, setRemoveBg] = useState(false)
  const [tolerance, setTolerance] = useState(32)
  const [outline, setOutline] = useState(false)

  // Narrow subscriptions — only what the target-dims hints need
  const docW = useEditorStore((s) => s.doc.width)
  const docH = useEditorStore((s) => s.doc.height)

  // ---- derived availability ----
  const isMultiGif = (gifFrames?.length ?? 0) > 1 && gifFrames !== null
  const slicingActive = sliceOn && !isMultiGif
  const cellCount = isMultiGif && gifFrames ? gifFrames.length : slicingActive ? clampDim(cols) * clampDim(rows) : 1
  const colsNum = clampDim(cols)
  const rowsNum = clampDim(rows)
  const cellW = dims ? Math.max(1, Math.floor(dims.w / colsNum)) : 0
  const cellH = dims ? Math.max(1, Math.floor(dims.h / rowsNum)) : 0

  // Modes only make sense for the current cell count; auto-correct instead of failing.
  useEffect(() => {
    if (cellCount > 1 && mode === 'layer') setMode('frames')
    else if (cellCount <= 1 && mode === 'frames') setMode('layer')
  }, [cellCount, mode])

  // Revoke the previous object URL whenever it changes / on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const resetForNewSelection = useCallback(() => {
    setError(null)
    setFile(null)
    setPreviewUrl(null)
    setDims(null)
    setFormat('—')
    setGifFrames(null)
    imgRef.current = null
    setMode('new-doc')
    setSizing('original')
    setSliceOn(false)
    setCols('1')
    setRows('1')
    setImporting(false)
  }, [])

  // ---- file selection (shared by picker, drop and 'pf:import-file') ----
  const selectFile = useCallback(async (f: File) => {
    setBusy(true)
    setError(null)
    try {
      const lower = f.name.toLowerCase()
      // Native project files load directly, no import options needed.
      if (lower.endsWith('.pfa') || lower.endsWith('.json')) {
        const text = await f.text()
        const doc = deserializeDoc(text)
        useEditorStore.getState().loadDoc(doc)
        toast({ title: 'Project opened', description: `${doc.name} — ${doc.width}×${doc.height}px` })
        setOpen(false)
        return
      }

      if (f.type === 'image/gif' || lower.endsWith('.gif')) {
        await yieldToUi() // let the spinner paint before the synchronous decode
        const frames = await decodeGifFile(f)
        imgRef.current = null
        setGifFrames(frames)
        setDims({ w: frames[0].w, h: frames[0].h })
        setFormat('GIF')
        setPreviewUrl(URL.createObjectURL(f))
      } else {
        const decoded = await decodeImageFile(f)
        imgRef.current = decoded.img
        setGifFrames(null)
        setDims({ w: decoded.w, h: decoded.h })
        setFormat(formatLabel(f))
        setPreviewUrl(URL.createObjectURL(f))
      }
      setFile(f)
      setMode('new-doc')
      setSizing('original')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.')
    } finally {
      setBusy(false)
    }
  }, [])

  // ---- window event contract ----
  useEffect(() => {
    const onMenuImport = () => {
      resetForNewSelection()
      setOpen(true)
    }
    const onImportFile = (ev: Event) => {
      const detail: unknown = ev instanceof CustomEvent ? ev.detail : null
      const maybeFile =
        detail && typeof detail === 'object' && 'file' in detail
          ? (detail as { file: unknown }).file
          : null
      resetForNewSelection()
      setOpen(true)
      if (maybeFile instanceof File) void selectFile(maybeFile)
    }
    window.addEventListener('pf:menu-import', onMenuImport)
    window.addEventListener('pf:import-file', onImportFile)
    return () => {
      window.removeEventListener('pf:menu-import', onMenuImport)
      window.removeEventListener('pf:import-file', onImportFile)
    }
  }, [resetForNewSelection, selectFile])

  // ---- import pipeline ----
  const buildSourceCells = useCallback((): ImportCell[] | null => {
    if (gifFrames && gifFrames.length > 0) {
      if (gifFrames.length > 1) {
        return gifFrames.map((f) => ({ data: f.data, w: f.w, h: f.h, delayMs: f.delayMs }))
      }
      const f0 = gifFrames[0]
      const src: ImportCell = { data: f0.data, w: f0.w, h: f0.h, delayMs: null }
      if (!slicingActive) return [src]
      return sliceSheet(f0.data, f0.w, f0.h, colsNum, rowsNum).map((c) => ({
        data: c.data,
        w: c.w,
        h: c.h,
        delayMs: null,
      }))
    }
    const img = imgRef.current
    if (!img || !dims) return null
    const base = imageToCel(img, dims.w, dims.h)
    if (!slicingActive) return [{ data: base, w: dims.w, h: dims.h, delayMs: null }]
    return sliceSheet(base, dims.w, dims.h, colsNum, rowsNum).map((c) => ({
      data: c.data,
      w: c.w,
      h: c.h,
      delayMs: null,
    }))
  }, [gifFrames, slicingActive, colsNum, rowsNum, dims])

  const doImport = useCallback(async () => {
    if (!file || !dims || busy || importing) return
    setImporting(true)
    setError(null)
    try {
      await yieldToUi()
      // Honest guard: replace-layer imports are silently dropped by the store on locked layers.
      if (mode !== 'new-doc') {
        const stNow = useEditorStore.getState()
        const activeLayer = stNow.doc.layers.find((l) => l.id === stNow.activeLayerId)
        if (activeLayer?.locked) {
          throw new Error('The active layer is locked — unlock it (Layers panel) before importing into this document.')
        }
      }

      let cells = buildSourceCells()
      if (!cells || cells.length === 0) {
        throw new Error('Nothing to import — choose an image first.')
      }

      // Sizing only matters when placing into an existing document.
      if (mode !== 'new-doc') {
        const { width: dw, height: dh } = useEditorStore.getState().doc
        cells = cells.map((cell) => {
          if (sizing === 'resize') {
            const r = nearestResizeTo(cell.data, cell.w, cell.h, dw, dh)
            return { ...cell, data: r.data, w: r.w, h: r.h }
          }
          if (sizing === 'crop') {
            const cw = Math.min(cell.w, dw)
            const ch = Math.min(cell.h, dh)
            const rect = {
              x: Math.floor((cell.w - cw) / 2),
              y: Math.floor((cell.h - ch) / 2),
              w: cw,
              h: ch,
            }
            return { ...cell, data: extractRegion(cell.data, cell.w, cell.h, rect), w: cw, h: ch }
          }
          return cell
        })
      }

      // Pixel-art conversion per cell (remove bg → quantize → outline).
      const extracted: string[] = []
      cells = cells.map((cell) => {
        let data: Uint8ClampedArray = new Uint8ClampedArray(cell.data)
        if (removeBg) removeBackground(data, cell.w, cell.h, tolerance)
        if (limitPalette) {
          const q = quantize(data, paletteN)
          data = q.data
          extracted.push(...q.palette)
        }
        if (outline) outlineCel(data, cell.w, cell.h, OUTLINE_COLOR)
        return { ...cell, data }
      })

      if (mode === 'new-doc') {
        const first = cells[0]
        const w = Math.min(MAX_CANVAS_DIM, Math.max(1, first.w))
        const h = Math.min(MAX_CANVAS_DIM, Math.max(1, first.h))
        useEditorStore.getState().newDoc(w, h, baseName(file.name))
        useEditorStore.getState().importImageIntoDoc(first.data, first.w, first.h, 'replace-layer')
        for (let i = 1; i < cells.length; i++) {
          const cell = cells[i]
          const st = useEditorStore.getState()
          st.addFrame(false) // inserts after the active frame and activates it
          const st2 = useEditorStore.getState()
          if (cell.delayMs !== null) st2.updateFrame(st2.activeFrameId, { durationMs: clampDuration(cell.delayMs) })
          st2.importImageIntoDoc(cell.data, cell.w, cell.h, 'replace-layer')
        }
        mergeExtractedPalette(extracted)
        toast({
          title: 'New document created',
          description:
            cells.length > 1
              ? `Imported ${cells.length} frames (${w}×${h}).`
              : `${w}×${h}px from “${file.name}”.`,
        })
      } else if (mode === 'layer') {
        const cell = cells[0]
        useEditorStore.getState().importImageIntoDoc(cell.data, cell.w, cell.h, 'new-layer')
        mergeExtractedPalette(extracted)
        toast({
          title: 'Imported as new layer',
          description: `${cell.w}×${cell.h}px added to the current document.`,
        })
      } else {
        for (const cell of cells) {
          const st = useEditorStore.getState()
          st.addFrame(false)
          const st2 = useEditorStore.getState()
          if (cell.delayMs !== null) st2.updateFrame(st2.activeFrameId, { durationMs: clampDuration(cell.delayMs) })
          st2.importImageIntoDoc(cell.data, cell.w, cell.h, 'replace-layer')
        }
        mergeExtractedPalette(extracted)
        toast({
          title: 'Frames imported',
          description: `Imported ${cells.length} frames (${cells[0].w}×${cells[0].h}).`,
        })
      }
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.')
    } finally {
      setImporting(false)
    }
  }, [file, dims, busy, importing, buildSourceCells, mode, sizing, removeBg, tolerance, limitPalette, paletteN, outline])

  const clampNote =
    mode === 'new-doc' && dims !== null && (dims.w > MAX_CANVAS_DIM || dims.h > MAX_CANVAS_DIM)
      ? `The image is larger than the ${MAX_CANVAS_DIM}px canvas limit — the new document will be clamped to ${Math.min(MAX_CANVAS_DIM, dims.w)}×${Math.min(MAX_CANVAS_DIM, dims.h)} and overflowing pixels are cropped.`
      : null

  const sizingHint =
    sizing === 'original'
      ? mode === 'layer'
        ? 'Placed centered at its original size; oversized images are scaled down to fit the canvas.'
        : 'Frames keep their pixel size; anything past the canvas edge is clipped.'
      : sizing === 'resize'
        ? `Nearest-neighbor resize to the canvas size (${docW}×${docH}).`
        : `Center-crop to the canvas size (${docW}×${docH}) before placing.`

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Image</DialogTitle>
          <DialogDescription>
            Bring PNG, JPEG, WebP, BMP or GIF files in as documents, layers or animation frames.
          </DialogDescription>
        </DialogHeader>

        {/* ---------- Source ---------- */}
        <section aria-label="Choose source" className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center gap-2">
            <FileImage className="size-4 text-violet-400" />
            <h3 className="text-sm font-semibold text-zinc-100">Source</h3>
          </div>

          <label
            className={cn(
              'flex min-h-28 w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-5 text-center transition-colors',
              busy
                ? 'border-violet-500/60 bg-violet-500/5'
                : 'border-zinc-700 bg-zinc-900/60 hover:border-violet-500/60 hover:bg-violet-500/5',
            )}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const f = e.dataTransfer.files?.[0]
              if (f) void selectFile(f)
            }}
          >
            <input
              type="file"
              accept={ACCEPTED}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void selectFile(f)
                e.target.value = ''
              }}
            />
            {busy ? (
              <Loader2 className="size-6 animate-spin text-violet-400" />
            ) : (
              <FileImage className="size-6 text-zinc-500" />
            )}
            <span className="text-sm font-medium text-zinc-200">
              {busy ? 'Decoding…' : 'Click to choose or drop an image'}
            </span>
            <span className="text-xs text-zinc-500">PNG, JPEG, WebP, BMP, GIF — or a .pfa project file</span>
          </label>

          {file && dims ? (
            <div className="grid gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-200" title={file.name}>
                  {file.name}
                </span>
                <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
                  {dims.w}×{dims.h}
                </Badge>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {format}
                </Badge>
                {isMultiGif && gifFrames ? (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {gifFrames.length} frames
                  </Badge>
                ) : null}
              </div>
              <img
                src={previewUrl ?? undefined}
                alt={`Preview of ${file.name}`}
                className="mx-auto max-h-40 w-auto max-w-full rounded border border-zinc-800 object-contain"
                style={{ ...CHECKER_STYLE, imageRendering: 'pixelated' }}
              />
            </div>
          ) : null}
        </section>

        {/* ---------- Import mode ---------- */}
        <section aria-label="Import mode" className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center gap-2">
            <ImportIcon className="size-4 text-violet-400" />
            <h3 className="text-sm font-semibold text-zinc-100">Import mode</h3>
          </div>
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as ImportMode)} className="gap-3">
            <div className="flex items-start gap-2.5">
              <RadioGroupItem value="new-doc" id="pf-im-new-doc" className="mt-0.5" />
              <Label htmlFor="pf-im-new-doc" className="flex cursor-pointer flex-col gap-0.5 font-normal">
                <span className="text-sm text-zinc-100">New document</span>
                <span className="text-xs text-zinc-500">Creates a canvas matching the image (or each sliced cell).</span>
              </Label>
            </div>
            <div className="flex items-start gap-2.5">
              <RadioGroupItem value="layer" id="pf-im-layer" disabled={cellCount > 1} className="mt-0.5" />
              <Label htmlFor="pf-im-layer" className="flex cursor-pointer flex-col gap-0.5 font-normal">
                <span className="text-sm text-zinc-100">As layer in current document</span>
                <span className="text-xs text-zinc-500">
                  {cellCount > 1 ? 'Multiple cells import as frames instead.' : `Adds a new layer to the ${docW}×${docH} document.`}
                </span>
              </Label>
            </div>
            <div className="flex items-start gap-2.5">
              <RadioGroupItem value="frames" id="pf-im-frames" disabled={cellCount <= 1} className="mt-0.5" />
              <Label htmlFor="pf-im-frames" className="flex cursor-pointer flex-col gap-0.5 font-normal">
                <span className="text-sm text-zinc-100">As new frames (animation)</span>
                <span className="text-xs text-zinc-500">
                  {cellCount <= 1
                    ? 'Enable sprite-sheet slicing or choose a multi-frame GIF to unlock.'
                    : `Appends ${cellCount} frame${cellCount === 1 ? '' : 's'} after the current ones.`}
                </span>
              </Label>
            </div>
          </RadioGroup>
        </section>

        {/* ---------- Sizing (irrelevant for new documents) ---------- */}
        {mode !== 'new-doc' ? (
          <section aria-label="Sizing" className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="flex items-center gap-2">
              <Scaling className="size-4 text-violet-400" />
              <h3 className="text-sm font-semibold text-zinc-100">Sizing</h3>
              <span className="text-xs text-zinc-500">— target canvas {docW}×{docH}</span>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pf-im-sizing">How the image fits the canvas</Label>
              <Select value={sizing} onValueChange={(v) => setSizing(v as Sizing)}>
                <SelectTrigger id="pf-im-sizing" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="original">Original size</SelectItem>
                  <SelectItem value="resize">Resize to canvas</SelectItem>
                  <SelectItem value="crop">Crop to canvas</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-zinc-500">{sizingHint}</p>
            </div>
          </section>
        ) : null}

        {/* ---------- Sprite sheet slicing ---------- */}
        {!isMultiGif && dims ? (
          <section aria-label="Sprite sheet slicing" className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Grid3x3 className="size-4 text-violet-400" />
                <h3 className="text-sm font-semibold text-zinc-100">Sprite sheet slicing</h3>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="pf-im-slice" className="text-xs text-zinc-400">
                  Slice into frames
                </Label>
                <Switch id="pf-im-slice" checked={sliceOn} onCheckedChange={setSliceOn} />
              </div>
            </div>
            {sliceOn ? (
              <div className="grid gap-2">
                <div className="flex items-end gap-3">
                  <div className="grid gap-1">
                    <Label htmlFor="pf-im-cols" className="text-xs text-zinc-400">
                      Columns (1–64)
                    </Label>
                    <Input
                      id="pf-im-cols"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={64}
                      className="h-8 w-24"
                      value={cols}
                      onChange={(e) => setCols(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="pf-im-rows" className="text-xs text-zinc-400">
                      Rows (1–64)
                    </Label>
                    <Input
                      id="pf-im-rows"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={64}
                      className="h-8 w-24"
                      value={rows}
                      onChange={(e) => setRows(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-xs text-zinc-500">
                  {cellCount > 1
                    ? `→ ${cellW}×${cellH}px cells — ${cellCount} frames${cellCount > 256 ? ' (large count: import may take a moment)' : ''}`
                    : '→ 1 cell — increase columns or rows to actually slice.'}
                </p>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* ---------- Pixel-art conversion ---------- */}
        <section aria-label="Pixel-art conversion" className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center gap-2">
            <Wand2 className="size-4 text-violet-400" />
            <h3 className="text-sm font-semibold text-zinc-100">Pixel-art conversion</h3>
            <span className="text-xs text-zinc-500">— applied to every imported frame</span>
          </div>

          <div className="grid gap-2.5">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="pf-im-palette" className="text-sm text-zinc-200">
                Limit palette
              </Label>
              <Switch id="pf-im-palette" checked={limitPalette} onCheckedChange={setLimitPalette} />
            </div>
            {limitPalette ? (
              <div className="flex items-center gap-3">
                <Slider
                  value={[paletteN]}
                  min={2}
                  max={64}
                  step={1}
                  aria-label="Palette size"
                  onValueChange={(v) => setPaletteN(v[0] ?? paletteN)}
                  className="flex-1"
                />
                <span className="w-16 text-right font-mono text-xs tabular-nums text-zinc-300">{paletteN} colors</span>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="pf-im-removebg" className="text-sm text-zinc-200">
                Remove background
              </Label>
              <Switch id="pf-im-removebg" checked={removeBg} onCheckedChange={setRemoveBg} />
            </div>
            {removeBg ? (
              <div className="flex items-center gap-3">
                <Slider
                  value={[tolerance]}
                  min={8}
                  max={128}
                  step={1}
                  aria-label="Background tolerance"
                  onValueChange={(v) => setTolerance(v[0] ?? tolerance)}
                  className="flex-1"
                />
                <span className="w-16 text-right font-mono text-xs tabular-nums text-zinc-300">tol {tolerance}</span>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <div className="grid gap-0.5">
                <Label htmlFor="pf-im-outline" className="text-sm text-zinc-200">
                  Dark outline
                </Label>
                <span className="text-xs text-zinc-500">Adds a 1px #0A0A0A outline around opaque pixels.</span>
              </div>
              <Switch id="pf-im-outline" checked={outline} onCheckedChange={setOutline} />
            </div>
          </div>
        </section>

        {/* ---------- Honest status messages ---------- */}
        {error ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Import problem</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {!error && clampNote ? (
          <Alert>
            <Info />
            <AlertTitle>Canvas limit</AlertTitle>
            <AlertDescription>{clampNote}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter className="sm:justify-end">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={importing}>
            Cancel
          </Button>
          <Button
            onClick={() => void doImport()}
            disabled={!file || busy || importing}
            className="bg-violet-600 text-white hover:bg-violet-700"
          >
            {importing ? <Loader2 className="size-4 animate-spin" /> : <ImportIcon className="size-4" />}
            {importing ? 'Importing…' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
