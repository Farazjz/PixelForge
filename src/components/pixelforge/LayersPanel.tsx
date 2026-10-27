'use client'

// PixelForge AI — Layers panel (right sidebar)
// Lists document layers top-first with per-frame thumbnails, visibility/lock
// toggles, inline rename, opacity, and structural layer actions.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowDownToLine,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Plus,
  Trash2,
} from 'lucide-react'
import type { Layer } from '@/lib/pixelforge/types'
import { celToCanvas } from '@/lib/pixelforge/engine'
import { useEditorStore } from '@/lib/pixelforge/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const THUMB = 40

interface LayerThumbProps {
  layer: Layer
  frameId: string
  width: number
  height: number
  pixelVersion: number
  structureVersion: number
}

function LayerThumb({ layer, frameId, width, height, pixelVersion, structureVersion }: LayerThumbProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Pixel data mutates in place (object identity stays stable), so the
    // monotonic version counters are what actually trigger repaints.
    canvas.dataset.rev = `${pixelVersion}:${structureVersion}`

    // checkerboard backdrop — 8px squares
    for (let y = 0; y < THUMB; y += 8) {
      for (let x = 0; x < THUMB; x += 8) {
        ctx.fillStyle = ((x + y) / 8) % 2 === 0 ? '#3f3f46' : '#27272a'
        ctx.fillRect(x, y, 8, 8)
      }
    }

    const cel = layer.cels[frameId]
    if (cel && cel.length === width * height * 4) {
      const temp = celToCanvas(cel, width, height)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(temp, 0, 0, THUMB, THUMB)
    }
  }, [layer, frameId, width, height, pixelVersion, structureVersion])

  return (
    <canvas
      ref={canvasRef}
      width={THUMB}
      height={THUMB}
      style={{ imageRendering: 'pixelated' }}
      className="shrink-0 rounded-sm border border-zinc-700"
      aria-hidden="true"
    />
  )
}

interface HeaderActionProps {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}

function HeaderAction({ label, onClick, disabled = false, children }: HeaderActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-[11px]">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export default function LayersPanel() {
  const layers = useEditorStore((s) => s.doc.layers)
  const docWidth = useEditorStore((s) => s.doc.width)
  const docHeight = useEditorStore((s) => s.doc.height)
  const activeLayerId = useEditorStore((s) => s.activeLayerId)
  const activeFrameId = useEditorStore((s) => s.activeFrameId)
  const pixelVersion = useEditorStore((s) => s.pixelVersion)
  const structureVersion = useEditorStore((s) => s.structureVersion)

  const addLayer = useEditorStore((s) => s.addLayer)
  const deleteLayer = useEditorStore((s) => s.deleteLayer)
  const duplicateLayer = useEditorStore((s) => s.duplicateLayer)
  const mergeDown = useEditorStore((s) => s.mergeDown)
  const moveLayer = useEditorStore((s) => s.moveLayer)
  const updateLayer = useEditorStore((s) => s.updateLayer)
  const setActiveLayer = useEditorStore((s) => s.setActiveLayer)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')

  const startRename = (layer: Layer) => {
    setEditingId(layer.id)
    setDraftName(layer.name)
  }

  const commitRename = () => {
    if (editingId) {
      const name = draftName.trim()
      if (name.length > 0) updateLayer(editingId, { name })
    }
    setEditingId(null)
  }

  const cancelRename = () => setEditingId(null)

  // top layer first (store keeps bottom -> top order)
  const ordered = [...layers].reverse()

  return (
    <section aria-label="Layers panel" className="flex min-h-0 flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Layers</h2>
        <div className="flex items-center gap-0.5">
          <HeaderAction label="New layer" onClick={addLayer}>
            <Plus className="size-3.5" />
          </HeaderAction>
          <HeaderAction label="Duplicate layer" onClick={() => duplicateLayer(activeLayerId)}>
            <Copy className="size-3.5" />
          </HeaderAction>
          <HeaderAction label="Merge down" onClick={() => mergeDown(activeLayerId)}>
            <ArrowDownToLine className="size-3.5" />
          </HeaderAction>
          <HeaderAction label="Move layer up" onClick={() => moveLayer(activeLayerId, 1)}>
            <ChevronUp className="size-3.5" />
          </HeaderAction>
          <HeaderAction label="Move layer down" onClick={() => moveLayer(activeLayerId, -1)}>
            <ChevronDown className="size-3.5" />
          </HeaderAction>
          <HeaderAction
            label="Delete layer"
            onClick={() => deleteLayer(activeLayerId)}
            disabled={layers.length <= 1}
          >
            <Trash2 className="size-3.5" />
          </HeaderAction>
        </div>
      </div>

      <Separator className="bg-zinc-800" />

      <div
        className="max-h-[40vh] min-h-0 overflow-y-auto pr-1 [scrollbar-color:#52525b_transparent] [scrollbar-width:thin]"
        aria-label="Layer list"
      >
        {ordered.map((layer) => {
          const active = layer.id === activeLayerId
          const hasCel = !!layer.cels[activeFrameId]
          const editing = editingId === layer.id
          return (
            <div
              key={layer.id}
              role="button"
              tabIndex={0}
              aria-pressed={active}
              aria-label={`Layer ${layer.name}`}
              onClick={() => setActiveLayer(layer.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setActiveLayer(layer.id)
                }
              }}
              className={cn(
                'group mb-1 flex cursor-pointer items-start gap-2 rounded-md border border-transparent p-1.5 outline-none transition-colors',
                'focus-visible:ring-1 focus-visible:ring-violet-600',
                active
                  ? 'border-violet-600/50 bg-violet-600/10 ring-1 ring-violet-600'
                  : 'hover:bg-zinc-800/50',
                !layer.visible && 'opacity-70',
              )}
            >
              <LayerThumb
                layer={layer}
                frameId={activeFrameId}
                width={docWidth}
                height={docHeight}
                pixelVersion={pixelVersion}
                structureVersion={structureVersion}
              />

              <button
                type="button"
                aria-label={layer.visible ? `Hide layer ${layer.name}` : `Show layer ${layer.name}`}
                title={layer.visible ? 'Hide layer' : 'Show layer'}
                className="mt-0.5 rounded-sm p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-600"
                onClick={(e) => {
                  e.stopPropagation()
                  updateLayer(layer.id, { visible: !layer.visible })
                }}
              >
                {layer.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
              </button>

              <button
                type="button"
                aria-label={layer.locked ? `Unlock layer ${layer.name}` : `Lock layer ${layer.name}`}
                title={layer.locked ? 'Locked — painting disabled' : 'Lock layer'}
                className={cn(
                  'mt-0.5 rounded-sm p-1 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-600',
                  layer.locked ? 'text-violet-400' : 'text-zinc-600 hover:text-zinc-300',
                )}
                onClick={(e) => {
                  e.stopPropagation()
                  updateLayer(layer.id, { locked: !layer.locked })
                }}
              >
                {layer.locked ? <Lock className="size-3" /> : <LockOpen className="size-3" />}
              </button>

              <div className="min-w-0 flex-1">
                {editing ? (
                  <Input
                    autoFocus
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename()
                      else if (e.key === 'Escape') cancelRename()
                    }}
                    onBlur={commitRename}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Layer name"
                    className="h-6 border-violet-600/60 bg-zinc-900 px-1.5 py-0 text-xs"
                  />
                ) : (
                  <span
                    tabIndex={0}
                    className="block cursor-text truncate text-xs text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-600"
                    title={`${layer.name} — double-click to rename`}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      startRename(layer)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.stopPropagation()
                        startRename(layer)
                      }
                    }}
                  >
                    {layer.name}
                  </span>
                )}

                <div className="mt-0.5 flex items-center gap-1.5">
                  {layer.locked && (
                    <span
                      className="inline-flex items-center gap-0.5 rounded-sm bg-zinc-800 px-1 text-[9px] uppercase tracking-wide text-zinc-500"
                      title="Painting disabled"
                    >
                      <Lock className="size-2.5" /> locked
                    </span>
                  )}
                  {!hasCel && <span className="text-[9px] text-zinc-600">empty</span>}
                </div>

                {active && (
                  <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                    <Slider
                      value={[Math.round(layer.opacity * 100)]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={(vals) => updateLayer(layer.id, { opacity: (vals[0] ?? 0) / 100 })}
                      aria-label={`Opacity for layer ${layer.name}`}
                      className="w-full"
                    />
                  </div>
                )}
              </div>

              {active && (
                <span className="mt-0.5 w-8 shrink-0 text-right text-[10px] tabular-nums text-zinc-500">
                  {Math.round(layer.opacity * 100)}%
                </span>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
