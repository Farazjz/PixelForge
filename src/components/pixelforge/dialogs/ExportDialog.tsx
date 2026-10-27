'use client'

// PixelForge AI — Export dialog (PNG / JPEG / WebP / BMP, sprite sheets,
// animated GIF, frames-as-ZIP, palette JSON).
// Opens on window event 'pf:menu-export'. Scaling is always nearest-neighbor.

import { useEffect, useState } from 'react'
import { ImageDown, FileJson, Loader2 } from 'lucide-react'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  celToCanvas,
  compositeFrame,
  hexToRgba,
  nearestScale,
  renderCompositeToCanvas,
} from '@/lib/pixelforge/engine'
import {
  canvasToPngBlob,
  encodeAnimatedGIF,
  encodeBMP,
  zipBlobs,
} from '@/lib/pixelforge/export-utils'
import { useEditorStore } from '@/lib/pixelforge/store'
import { toast } from '@/hooks/use-toast'

type Format = 'png' | 'jpeg' | 'webp' | 'bmp'
type Scope = 'frame' | 'sheet' | 'gif' | 'zip'

const SCALES = [1, 2, 3, 4, 8]
const COLUMNS = ['auto', '1', '2', '4', '8']

function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9-_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'pixelforge'
  )
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  downloadDataUrl(url, filename)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function ExportDialog() {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<Format>('png')
  const [scale, setScale] = useState(1)
  const [scope, setScope] = useState<Scope>('frame')
  const [columns, setColumns] = useState('auto')
  const [jpegBg, setJpegBg] = useState('#ffffff')
  const [exporting, setExporting] = useState(false)

  // Reactive doc info for the preview line
  const docW = useEditorStore((s) => s.doc.width)
  const docH = useEditorStore((s) => s.doc.height)
  const frameCount = useEditorStore((s) => s.doc.frames.length)

  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('pf:menu-export', handler)
    return () => window.removeEventListener('pf:menu-export', handler)
  }, [])

  const mime = format === 'png' ? 'image/png' : format === 'jpeg' ? 'image/jpeg' : 'image/webp'

  const runExport = async () => {
    if (exporting) return
    const { doc, activeFrameId } = useEditorStore.getState()
    setExporting(true)
    try {
      const base = sanitizeFilename(doc.name)

      // ---- Animated GIF: composite every frame, NN-scale, encode looping 256-color GIF ----
      if (scope === 'gif') {
        const frames = doc.frames.map((frame) => {
          const comp = compositeFrame(doc, frame.id)
          const scaled = nearestScale(comp, doc.width, doc.height, scale)
          return { data: scaled.data, delayMs: frame.durationMs }
        })
        const blob = encodeAnimatedGIF(frames, doc.width * scale, doc.height * scale)
        downloadBlob(blob, `${base}-anim-${doc.frames.length}f.gif`)
        toast({
          title: 'Export complete',
          description: `Animated GIF (${doc.frames.length} frames, looping, 256-color) exported.`,
        })
        return
      }

      // ---- ZIP: one NN-scaled transparent PNG per frame, zipped client-side ----
      if (scope === 'zip') {
        const count = doc.frames.length
        const pad = String(count).length
        const files: { name: string; blob: Blob }[] = []
        for (let i = 0; i < count; i++) {
          const comp = compositeFrame(doc, doc.frames[i].id)
          const scaled = nearestScale(comp, doc.width, doc.height, scale)
          const canvas = celToCanvas(scaled.data, scaled.w, scaled.h)
          files.push({
            name: `${base}-frame-${String(i + 1).padStart(pad, '0')}.png`,
            blob: await canvasToPngBlob(canvas),
          })
        }
        downloadBlob(await zipBlobs(files), `${base}-frames-${count}f-${scale}x.zip`)
        toast({
          title: 'Export complete',
          description: `${count} frame PNG${count === 1 ? '' : 's'} zipped.`,
        })
        return
      }

      // ---- Raster scopes (current frame | sprite sheet) ----
      const src = document.createElement('canvas')
      const out = document.createElement('canvas')
      const octx = out.getContext('2d')
      if (!octx) throw new Error('Canvas 2D context unavailable')
      octx.imageSmoothingEnabled = false // nearest-neighbor — pixels stay crisp

      // BMP is flat: semi-transparent pixels blend over the chosen background.
      const [bgR, bgG, bgB] = hexToRgba(jpegBg)
      const bmpBg: [number, number, number] | null = format === 'bmp' ? [bgR, bgG, bgB] : null

      if (scope === 'frame') {
        renderCompositeToCanvas(doc, activeFrameId, src)
        const frameIndex = Math.max(0, doc.frames.findIndex((f) => f.id === activeFrameId))
        out.width = doc.width * scale
        out.height = doc.height * scale
        if (format === 'jpeg') {
          octx.fillStyle = jpegBg
          octx.fillRect(0, 0, out.width, out.height)
        }
        octx.drawImage(src, 0, 0, out.width, out.height)
        const filename = `${base}-frame${frameIndex + 1}-${scale}x.${format}`
        if (format === 'bmp') {
          // canvas.toDataURL cannot emit BMP — read the rendered pixels back instead.
          const px = octx.getImageData(0, 0, out.width, out.height)
          downloadBlob(encodeBMP(px.data, out.width, out.height, bmpBg), filename)
        } else {
          downloadDataUrl(out.toDataURL(mime, 0.92), filename)
        }
      } else {
        const cols = columns === 'auto' ? doc.frames.length : Number(columns)
        const rows = Math.ceil(doc.frames.length / cols)
        out.width = doc.width * cols * scale
        out.height = doc.height * rows * scale
        if (format === 'jpeg') {
          octx.fillStyle = jpegBg
          octx.fillRect(0, 0, out.width, out.height)
        }
        doc.frames.forEach((frame, i) => {
          renderCompositeToCanvas(doc, frame.id, src)
          octx.drawImage(
            src,
            (i % cols) * doc.width * scale,
            Math.floor(i / cols) * doc.height * scale,
            doc.width * scale,
            doc.height * scale,
          )
        })
        const filename = `${base}-sheet-${doc.frames.length}f-${scale}x.${format}`
        if (format === 'bmp') {
          const px = octx.getImageData(0, 0, out.width, out.height)
          downloadBlob(encodeBMP(px.data, out.width, out.height, bmpBg), filename)
        } else {
          downloadDataUrl(out.toDataURL(mime, 0.92), filename)
        }
      }

      toast({
        title: 'Export complete',
        description:
          scope === 'frame' ? 'Current frame exported.' : `Sprite sheet (${doc.frames.length} frames) exported.`,
      })
    } catch (err) {
      toast({
        title: 'Export failed',
        description: err instanceof Error ? err.message : 'Something went wrong while exporting.',
        variant: 'destructive',
      })
    } finally {
      setExporting(false)
    }
  }

  const exportPalette = () => {
    const { doc } = useEditorStore.getState()
    const json = JSON.stringify(doc.palette, null, 2)
    downloadBlob(new Blob([json], { type: 'application/json' }), `${sanitizeFilename(doc.name)}-palette.json`)
    toast({ title: 'Palette exported', description: `${doc.palette.length} colors (JSON)` })
  }

  const colsPreview = columns === 'auto' ? frameCount : Number(columns)
  const rowsPreview = Math.ceil(frameCount / Math.max(1, colsPreview))
  const sheetW = docW * colsPreview * scale
  const sheetH = docH * rowsPreview * scale
  const raster = scope === 'frame' || scope === 'sheet'
  const outputLabel =
    scope === 'sheet'
      ? `${sheetW}×${sheetH}px`
      : scope === 'gif'
        ? `${docW * scale}×${docH * scale}px per frame · looping`
        : scope === 'zip'
          ? `${docW * scale}×${docH * scale}px per frame · ${frameCount} PNG ${frameCount === 1 ? 'file' : 'files'}`
          : `${docW * scale}×${docH * scale}px`
  const exportName = scope === 'gif' ? 'GIF' : scope === 'zip' ? 'ZIP' : format.toUpperCase()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>
            Pixel-perfect export — scaling uses nearest-neighbor, so pixels never blur.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          <div className={raster ? 'grid grid-cols-2 gap-3' : 'grid gap-1.5'}>
            {raster ? (
              <div className="grid gap-1.5">
                <Label htmlFor="pf-exp-format">Format</Label>
                <Select value={format} onValueChange={(v) => setFormat(v as Format)}>
                  <SelectTrigger id="pf-exp-format" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="png">PNG (transparency)</SelectItem>
                    <SelectItem value="jpeg">JPEG (flat background)</SelectItem>
                    <SelectItem value="webp">WebP (transparency)</SelectItem>
                    <SelectItem value="bmp">BMP (no compression)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <Label htmlFor="pf-exp-scale">Scale</Label>
              <Select value={String(scale)} onValueChange={(v) => setScale(Number(v))}>
                <SelectTrigger id="pf-exp-scale" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCALES.map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {s}×
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="pf-exp-scope">Scope</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
              <SelectTrigger id="pf-exp-scope" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="frame">Current frame</SelectItem>
                <SelectItem value="sheet">Sprite sheet (all frames)</SelectItem>
                <SelectItem value="gif">Animated GIF (looping, 256-color)</SelectItem>
                <SelectItem value="zip">Frames as ZIP (PNG)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scope === 'gif' ? (
            <p className="text-xs text-zinc-500">
              256 colors per frame · 1-bit transparency · loops forever. Frame delay comes from each
              frame&apos;s duration.
            </p>
          ) : null}

          {scope === 'zip' ? (
            <p className="text-xs text-zinc-500">One transparent PNG per frame, zipped client-side (DEFLATE).</p>
          ) : null}

          {scope === 'sheet' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pf-exp-cols">Sheet columns</Label>
                <Select value={columns} onValueChange={setColumns}>
                  <SelectTrigger id="pf-exp-cols" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLUMNS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c === 'auto' ? `Auto (${frameCount})` : c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid content-end gap-1.5">
                <span className="text-xs text-zinc-500">
                  Sheet size: {sheetW}×{sheetH}px ({rowsPreview} row{rowsPreview === 1 ? '' : 's'})
                </span>
              </div>
            </div>
          ) : null}

          {raster && (format === 'jpeg' || format === 'bmp') ? (
            <div className="grid gap-1.5">
              <Label htmlFor="pf-exp-bg">Background (JPEG &amp; BMP — flat, no transparency)</Label>
              <Input
                id="pf-exp-bg"
                type="color"
                value={jpegBg}
                onChange={(e) => setJpegBg(e.target.value)}
                className="h-9 w-16 cursor-pointer p-1"
              />
            </div>
          ) : null}

          <p className="text-xs text-zinc-500">
            Output: {outputLabel} · <span className="text-zinc-400">imageSmoothingEnabled = false (nearest-neighbor)</span>
          </p>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={exportPalette}>
            <FileJson className="size-4" />
            Export palette JSON
          </Button>
          <Button onClick={runExport} disabled={exporting}>
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <ImageDown className="size-4" />}
            {exporting ? 'Exporting…' : `Export ${exportName}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
