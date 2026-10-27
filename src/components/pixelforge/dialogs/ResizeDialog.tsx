'use client'

// PixelForge AI — Resize dialog: canvas resize (anchor), NN artwork scale, color reduction.
// Opens on window event 'pf:menu-resize'.

import { useEffect, useState } from 'react'
import { Scaling, Shrink, Wand2 } from 'lucide-react'

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
import { Slider } from '@/components/ui/slider'
import { useEditorStore } from '@/lib/pixelforge/store'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

/**
 * Anchor ids intentionally avoid ambiguous substrings for the store's
 * `anchor.includes('n'|'s'|'e'|'w')` matching — 'c' is the true center.
 */
type AnchorId = 'nw' | 'n' | 'ne' | 'w' | 'c' | 'e' | 'sw' | 's' | 'se'

const ANCHOR_GRID: AnchorId[] = ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se']

const ARTWORK_SCALES = [0.5, 2, 3, 4]

const DIALOG_CAP = 1024

export function ResizeDialog() {
  const [open, setOpen] = useState(false)
  const [width, setWidth] = useState('32')
  const [height, setHeight] = useState('32')
  const [anchor, setAnchor] = useState<AnchorId>('c')
  const [quantizeN, setQuantizeN] = useState(16)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handler = () => {
      const { doc } = useEditorStore.getState()
      setWidth(String(doc.width))
      setHeight(String(doc.height))
      setAnchor('c')
      setError(null)
      setOpen(true)
    }
    window.addEventListener('pf:menu-resize', handler)
    return () => window.removeEventListener('pf:menu-resize', handler)
  }, [])

  const applyResize = () => {
    const w = Math.round(Number(width))
    const h = Math.round(Number(height))
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1 || w > DIALOG_CAP || h > DIALOG_CAP) {
      setError(`Width and height must be integers between 1 and ${DIALOG_CAP}.`)
      return
    }
    useEditorStore.getState().resizeCanvas(w, h, anchor)
    toast({ title: 'Canvas resized', description: `${w}×${h}px — anchor “${anchor}”` })
    setOpen(false)
  }

  const applyArtworkScale = (factor: number) => {
    useEditorStore.getState().scaleArtwork(factor)
    const { doc } = useEditorStore.getState()
    toast({ title: `Artwork scaled ${factor}×`, description: `Now ${doc.width}×${doc.height}px (nearest-neighbor)` })
  }

  const applyQuantize = () => {
    useEditorStore.getState().quantizeActiveLayer(quantizeN)
    toast({ title: `Reduced to ${quantizeN} colors`, description: 'Applied to the active layer / frame.' })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Resize &amp; Optimize</DialogTitle>
          <DialogDescription>Change canvas size, scale artwork, or reduce colors.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-1">
          {/* ---- (a) Resize canvas ---- */}
          <section aria-label="Resize canvas" className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="flex items-center gap-2">
              <Scaling className="size-4 text-violet-400" />
              <h3 className="text-sm font-semibold text-zinc-100">Resize canvas</h3>
              <span className="text-xs text-zinc-500">— existing pixels keep their position</span>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="pf-rz-w">Width (px)</Label>
                <Input
                  id="pf-rz-w"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={DIALOG_CAP}
                  className="h-8 w-24"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pf-rz-h">Height (px)</Label>
                <Input
                  id="pf-rz-h"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={DIALOG_CAP}
                  className="h-8 w-24"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                />
              </div>

              <div className="grid gap-1.5">
                <Label>Anchor</Label>
                <div className="grid grid-cols-3 gap-0.5 rounded-md border border-zinc-800 bg-zinc-950 p-1">
                  {ANCHOR_GRID.map((a) => (
                    <button
                      key={a}
                      type="button"
                      aria-label={`Anchor ${a}`}
                      aria-pressed={anchor === a}
                      onClick={() => setAnchor(a)}
                      className={cn(
                        'size-7 rounded-sm font-mono text-[10px] uppercase text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200',
                        anchor === a && 'bg-violet-600 text-white hover:bg-violet-600 hover:text-white',
                      )}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>

              <Button size="sm" onClick={applyResize}>
                Resize
              </Button>
            </div>
          </section>

          {/* ---- (b) Resize artwork ---- */}
          <section aria-label="Resize artwork" className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="flex items-center gap-2">
              <Shrink className="size-4 text-violet-400" />
              <h3 className="text-sm font-semibold text-zinc-100">Resize artwork (nearest-neighbor)</h3>
              <span className="text-xs text-zinc-500">— pixels are scaled, never blurred</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ARTWORK_SCALES.map((f) => (
                <Button key={f} variant="outline" size="sm" className="min-w-14 font-mono" onClick={() => applyArtworkScale(f)}>
                  {f}×
                </Button>
              ))}
            </div>
          </section>

          {/* ---- (c) Reduce colors ---- */}
          <section aria-label="Reduce colors" className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="flex items-center gap-2">
              <Wand2 className="size-4 text-violet-400" />
              <h3 className="text-sm font-semibold text-zinc-100">Reduce colors (median-cut quantize)</h3>
              <span className="text-xs text-zinc-500">— applies to active layer / frame</span>
            </div>
            <div className="flex items-center gap-4">
              <Slider
                value={[quantizeN]}
                min={2}
                max={64}
                step={1}
                aria-label="Number of colors"
                onValueChange={(v) => setQuantizeN(v[0] ?? quantizeN)}
                className="flex-1"
              />
              <span className="w-16 text-right font-mono text-sm tabular-nums text-zinc-200">{quantizeN} colors</span>
              <Button size="sm" onClick={applyQuantize}>
                Apply
              </Button>
            </div>
          </section>

          {error ? (
            <p className="text-sm text-rose-400" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
