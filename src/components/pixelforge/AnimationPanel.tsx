'use client'

// PixelForge AI — Animation panel: frame strip, playback, onion skin toggle,
// per-frame actions and sprite-sheet export.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  CopyPlus,
  Download,
  Film,
  Pause,
  Play,
  Plus,
  Trash2,
} from 'lucide-react'

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
import { Switch } from '@/components/ui/switch'
import { celToCanvas, compositeFrame, renderCompositeToCanvas } from '@/lib/pixelforge/engine'
import { useEditorStore } from '@/lib/pixelforge/store'
import type { PFDocument } from '@/lib/pixelforge/types'

const CHECKER_STYLE: React.CSSProperties = {
  backgroundImage: 'repeating-conic-gradient(#3f3f46 0% 25%, #27272a 0% 50%)',
  backgroundSize: '8px 8px',
}

const MIN_FRAME_MS = 10
const MAX_FRAME_MS = 10000

function clampDuration(n: number): number {
  if (!Number.isFinite(n)) return 120
  return Math.min(MAX_FRAME_MS, Math.max(MIN_FRAME_MS, Math.round(n)))
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** Renders the composited content of one frame into a small pixelated canvas. */
function FrameThumb({
  doc,
  frameId,
  pixelVersion,
  structureVersion,
}: {
  doc: PFDocument
  frameId: string
  pixelVersion: number
  structureVersion: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const comp = compositeFrame(doc, frameId)
    const tmp = celToCanvas(comp, doc.width, doc.height)
    c.width = doc.width
    c.height = doc.height
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, doc.width, doc.height)
    ctx.drawImage(tmp, 0, 0)
  }, [doc, frameId, pixelVersion, structureVersion])
  return (
    <canvas
      ref={ref}
      width={doc.width}
      height={doc.height}
      className="block max-h-16 max-w-16"
      style={{ ...CHECKER_STYLE, imageRendering: 'pixelated' }}
      aria-label={`Frame thumbnail ${doc.width}x${doc.height}`}
      role="img"
    />
  )
}

export default function AnimationPanel() {
  const doc = useEditorStore((s) => s.doc)
  const activeFrameId = useEditorStore((s) => s.activeFrameId)
  const playing = useEditorStore((s) => s.playing)
  const onionSkin = useEditorStore((s) => s.onionSkin)
  const pixelVersion = useEditorStore((s) => s.pixelVersion)
  const structureVersion = useEditorStore((s) => s.structureVersion)

  const setActiveFrame = useEditorStore((s) => s.setActiveFrame)
  const addFrame = useEditorStore((s) => s.addFrame)
  const deleteFrame = useEditorStore((s) => s.deleteFrame)
  const moveFrame = useEditorStore((s) => s.moveFrame)
  const updateFrame = useEditorStore((s) => s.updateFrame)
  const setPlaying = useEditorStore((s) => s.setPlaying)
  const setOnionSkin = useEditorStore((s) => s.setOnionSkin)

  // ----- playback: cumulative setTimeout chain, re-reads latest state each tick -----
  useEffect(() => {
    if (!playing) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = () => {
      if (cancelled) return
      const st = useEditorStore.getState()
      const frames = st.doc.frames
      if (frames.length === 0) {
        setPlaying(false)
        return
      }
      const idx = frames.findIndex((f) => f.id === st.activeFrameId)
      const next = frames[(idx + 1) % frames.length]
      if (next) st.setActiveFrame(next.id)
      const dur = useEditorStore.getState().doc.frames.find((f) => f.id === next?.id)?.durationMs ?? 120
      timer = setTimeout(tick, clampDuration(dur))
    }
    const st = useEditorStore.getState()
    const current = st.doc.frames.find((f) => f.id === st.activeFrameId)?.durationMs ?? 120
    timer = setTimeout(tick, clampDuration(current))
    return () => {
      cancelled = true
      if (timer !== null) clearTimeout(timer)
    }
  }, [playing, setPlaying])

  const totalMs = useMemo(
    () => doc.frames.reduce((acc, f) => acc + (Number.isFinite(f.durationMs) ? f.durationMs : 0), 0),
    [doc.frames],
  )
  const avgFps = useMemo(() => {
    if (doc.frames.length === 0 || totalMs <= 0) return 0
    return Math.round((doc.frames.length / totalMs) * 1000)
  }, [doc.frames.length, totalMs])

  const duplicateFrame = useCallback(
    (frameId: string) => {
      // addFrame(copyContent) duplicates the *active* frame — select it first when needed.
      if (useEditorStore.getState().activeFrameId !== frameId) setActiveFrame(frameId)
      addFrame(true)
    },
    [setActiveFrame, addFrame],
  )

  // ----- sprite sheet export -----
  const [colsChoice, setColsChoice] = useState<'auto' | '1' | '2' | '4' | '8'>('auto')

  const exportSheet = useCallback(() => {
    const st = useEditorStore.getState()
    const frames = st.doc.frames
    if (frames.length === 0) return
    const cols = colsChoice === 'auto' ? frames.length : Number.parseInt(colsChoice, 10)
    const rows = Math.ceil(frames.length / cols)
    const { width: w, height: h } = st.doc
    const sheet = document.createElement('canvas')
    sheet.width = cols * w
    sheet.height = rows * h
    const ctx = sheet.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    const tmp = document.createElement('canvas')
    for (let i = 0; i < frames.length; i++) {
      renderCompositeToCanvas(st.doc, frames[i].id, tmp)
      ctx.drawImage(tmp, (i % cols) * w, Math.floor(i / cols) * h)
    }
    downloadDataUrl(sheet.toDataURL('image/png'), `${st.doc.name || 'untitled'}-sheet.png`)
  }, [colsChoice])

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Film className="size-4 text-zinc-500" aria-hidden />
            <h2 className="text-sm font-semibold">Animation</h2>
            <Badge variant="secondary" className="font-mono text-[10px]">
              {doc.frames.length} {doc.frames.length === 1 ? 'frame' : 'frames'}
            </Badge>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-[11px]"
            onClick={() => setPlaying(!playing)}
            aria-pressed={playing}
          >
            {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            {playing ? 'Pause' : 'Play'}
          </Button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="pf-onion-skin" className="text-xs text-zinc-500">
              Onion skin
            </Label>
            <Switch id="pf-onion-skin" checked={onionSkin} onCheckedChange={(v) => setOnionSkin(v)} />
          </div>
          <span className="font-mono text-[10px] text-zinc-500" title="Total loop duration and average playback rate">
            {totalMs} ms · ≈{avgFps} fps
          </span>
        </div>
      </div>

      {/* frames strip */}
      <ScrollArea className="max-w-full">
        <div className="flex max-h-44 gap-2 overflow-y-auto pb-2">
          {doc.frames.map((frame, i) => {
            const isActive = frame.id === activeFrameId
            return (
              <div
                key={frame.id}
                className={`group relative flex w-20 shrink-0 flex-col items-center gap-1 rounded-md border p-1.5 transition-colors ${
                  isActive
                    ? 'border-violet-500 ring-2 ring-violet-500/40 dark:border-violet-500'
                    : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700'
                }`}
              >
                <button
                  type="button"
                  className="w-full focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none"
                  onClick={() => setActiveFrame(frame.id)}
                  aria-label={`Select frame ${i + 1}`}
                >
                  <div
                    className={`flex h-16 w-full items-center justify-center overflow-hidden rounded ${isActive ? 'ring-1 ring-violet-500/60' : ''}`}
                    style={CHECKER_STYLE}
                  >
                    <FrameThumb
                      doc={doc}
                      frameId={frame.id}
                      pixelVersion={pixelVersion}
                      structureVersion={structureVersion}
                    />
                  </div>
                </button>
                <div className="flex w-full items-center justify-between gap-1">
                  <span className="font-mono text-[10px] text-zinc-500">{i + 1}</span>
                  {isActive ? (
                    <Input
                      type="number"
                      min={MIN_FRAME_MS}
                      max={MAX_FRAME_MS}
                      value={frame.durationMs}
                      onChange={(e) =>
                        updateFrame(frame.id, { durationMs: clampDuration(Number.parseInt(e.target.value, 10)) })
                      }
                      className="h-5 w-14 border-0 bg-zinc-100 px-1 text-right font-mono text-[10px] dark:bg-zinc-900"
                      aria-label={`Duration of frame ${i + 1} in milliseconds`}
                    />
                  ) : (
                    <span className="font-mono text-[10px] text-zinc-400">{frame.durationMs}ms</span>
                  )}
                </div>
                {/* per-frame actions */}
                <div
                  className={`absolute inset-x-1 top-1 flex justify-center gap-0.5 rounded bg-white/90 p-0.5 opacity-0 transition-opacity group-hover:opacity-100 dark:bg-zinc-950/90 ${
                    isActive ? 'opacity-100' : ''
                  }`}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-5"
                    onClick={() => duplicateFrame(frame.id)}
                    aria-label={`Duplicate frame ${i + 1}`}
                    title="Duplicate frame"
                  >
                    <Copy className="size-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-5"
                    onClick={() => deleteFrame(frame.id)}
                    disabled={doc.frames.length <= 1}
                    aria-label={`Delete frame ${i + 1}`}
                    title="Delete frame"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-5"
                    onClick={() => moveFrame(frame.id, -1)}
                    disabled={i === 0}
                    aria-label={`Move frame ${i + 1} left`}
                    title="Move left"
                  >
                    <ChevronLeft className="size-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-5"
                    onClick={() => moveFrame(frame.id, 1)}
                    disabled={i === doc.frames.length - 1}
                    aria-label={`Move frame ${i + 1} right`}
                    title="Move right"
                  >
                    <ChevronRight className="size-3" />
                  </Button>
                </div>
              </div>
            )
          })}

          {/* add-frame actions at the end of the strip */}
          <div className="flex w-20 shrink-0 flex-col gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-[52px] w-full flex-col gap-0.5 text-[10px]"
              onClick={() => addFrame(false)}
              title="Add a new empty frame after the current one"
            >
              <Plus className="size-3.5" />
              New blank frame
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-[52px] w-full flex-col gap-0.5 text-[10px]"
              onClick={() => addFrame(true)}
              title="Duplicate the current frame with its content"
            >
              <CopyPlus className="size-3.5" />
              Duplicate current
            </Button>
          </div>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <Separator />

      {/* sprite sheet export */}
      <section className="flex flex-col gap-2" aria-label="Export sprite sheet">
        <Label className="text-xs">Export sprite sheet</Label>
        <div className="flex items-center gap-2">
          <Select value={colsChoice} onValueChange={(v) => setColsChoice(v as typeof colsChoice)}>
            <SelectTrigger className="h-8 flex-1 text-sm" aria-label="Sprite sheet columns">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (one row)</SelectItem>
              <SelectItem value="1">1 column</SelectItem>
              <SelectItem value="2">2 columns</SelectItem>
              <SelectItem value="4">4 columns</SelectItem>
              <SelectItem value="8">8 columns</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={exportSheet}
          >
            <Download className="size-3.5" /> Export
          </Button>
        </div>
        <p className="text-[10px] leading-relaxed text-zinc-500">
          Frames laid out left→right, top→bottom, 1x scale, transparent background.
        </p>
      </section>
    </div>
  )
}
