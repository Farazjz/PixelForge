'use client'

// PixelForge AI — Export dialog (PNG / JPEG / WebP, sprite sheets, palette JSON).
// Opens on window event 'pf:menu-export'. Scaling is always nearest-neighbor.

import { useEffect, useState } from 'react'
import { ImageDown, FileJson } from 'lucide-react'

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
import { renderCompositeToCanvas } from '@/lib/pixelforge/engine'
import { useEditorStore } from '@/lib/pixelforge/store'
import { toast } from '@/hooks/use-toast'

type Format = 'png' | 'jpeg' | 'webp'
type Scope = 'frame' | 'sheet'

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

  const runExport = () => {
    const { doc, activeFrameId } = useEditorStore.getState()
    const src = document.createElement('canvas')
    const out = document.createElement('canvas')
    const octx = out.getContext('2d')
    if (!octx) return
    octx.imageSmoothingEnabled = false // nearest-neighbor — pixels stay crisp

    const base = sanitizeFilename(doc.name)

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
      downloadDataUrl(out.toDataURL(mime, 0.92), `${base}-frame${frameIndex + 1}-${scale}x.${format}`)
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
      downloadDataUrl(out.toDataURL(mime, 0.92), `${base}-sheet-${doc.frames.length}f-${scale}x.${format}`)
    }

    toast({
      title: 'Export complete',
      description: scope === 'frame' ? 'Current frame exported.' : `Sprite sheet (${doc.frames.length} frames) exported.`,
    })
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
          <div className="grid grid-cols-2 gap-3">
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
                </SelectContent>
              </Select>
            </div>
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
            <Select value={scope} onValueChange={(v) => setScope(v === 'sheet' ? 'sheet' : 'frame')}>
              <SelectTrigger id="pf-exp-scope" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="frame">Current frame</SelectItem>
                <SelectItem value="sheet">Sprite sheet (all frames)</SelectItem>
              </SelectContent>
            </Select>
          </div>

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

          {format === 'jpeg' ? (
            <div className="grid gap-1.5">
              <Label htmlFor="pf-exp-bg">Background color (JPEG has no transparency)</Label>
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
            Output: {scope === 'frame' ? `${docW * scale}×${docH * scale}px` : `${sheetW}×${sheetH}px`}{' '}
            · <span className="text-zinc-400">imageSmoothingEnabled = false (nearest-neighbor)</span>
          </p>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={exportPalette}>
            <FileJson className="size-4" />
            Export palette JSON
          </Button>
          <Button onClick={runExport}>
            <ImageDown className="size-4" />
            Export {format.toUpperCase()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
