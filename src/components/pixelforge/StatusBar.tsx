'use client'

// PixelForge AI — bottom status bar
// Document stats, frame indicator, zoom, live cursor coords, active tool,
// primary/secondary swatches, AI provider chip and history depth.
// Uses narrow zustand selectors so high-frequency HUD updates stay cheap.

import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { History, Sparkles } from 'lucide-react'
import type { ToolId } from '@/lib/pixelforge/types'
import { useEditorStore } from '@/lib/pixelforge/store'
import { useHudStore, useSettingsStore } from '@/lib/pixelforge/settings-store'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

const TOOL_LABELS: Record<ToolId, string> = {
  pencil: 'Pencil',
  eraser: 'Eraser',
  bucket: 'Bucket',
  replace: 'Replace color',
  line: 'Line',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  eyedropper: 'Eyedropper',
  select: 'Select',
  move: 'Move',
  pan: 'Pan',
  text: 'Text',
}

/** Normalize a stored color to a 6-digit hex the native color input accepts */
function toHex6(color: string): string {
  const v = color.startsWith('#') ? color.slice(1) : color
  const expanded = v.length === 3 ? v.split('').map((c) => c + c).join('') : v
  return /^[0-9a-fA-F]{6}$/.test(expanded) ? `#${expanded.toLowerCase()}` : '#000000'
}

function StatusItem({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span title={title} className="shrink-0">
      {children}
    </span>
  )
}

function VSep() {
  return <Separator orientation="vertical" className="h-4 shrink-0 bg-zinc-800" aria-hidden="true" />
}

export default function StatusBar() {
  // Narrow selectors — primitives and stable references only
  const docName = useEditorStore((s) => s.doc.name)
  const docWidth = useEditorStore((s) => s.doc.width)
  const docHeight = useEditorStore((s) => s.doc.height)
  const frames = useEditorStore((s) => s.doc.frames)
  const activeFrameId = useEditorStore((s) => s.activeFrameId)
  const dirty = useEditorStore((s) => s.dirty)
  const zoom = useEditorStore((s) => s.view.zoom)
  const tool = useEditorStore((s) => s.tool)
  const primary = useEditorStore((s) => s.primary)
  const secondary = useEditorStore((s) => s.secondary)
  const undoDepth = useEditorStore((s) => s.undoStack.length)
  const redoDepth = useEditorStore((s) => s.redoStack.length)

  const cursor = useHudStore((s) => s.cursor)
  const activeProfileId = useSettingsStore((s) => s.activeProfileId)
  const profiles = useSettingsStore((s) => s.profiles)

  const frameIndex = useMemo(() => {
    const i = frames.findIndex((f) => f.id === activeFrameId)
    return i < 0 ? 0 : i
  }, [frames, activeFrameId])

  const profile = profiles.find((p) => p.id === activeProfileId) ?? profiles[0]
  const isBuiltin = profile?.kind !== 'custom'

  return (
    <div
      aria-label="Editor status bar"
      className="flex h-8 shrink-0 items-center gap-3 overflow-hidden whitespace-nowrap border-t border-zinc-800 bg-zinc-900 px-3 text-xs text-zinc-400"
    >
      {/* Document name + dirty marker */}
      <span className="flex shrink-0 items-center gap-1.5" title={dirty ? 'Unsaved changes' : 'No unsaved changes'}>
        <span className="max-w-40 truncate text-zinc-300">{docName}</span>
        {dirty && (
          <span
            role="img"
            aria-label="Unsaved changes"
            title="Unsaved changes"
            className="size-2 shrink-0 rounded-full bg-amber-400"
          />
        )}
      </span>

      <VSep />

      <StatusItem title="Canvas size">
        <span className="font-mono">
          {docWidth}×{docHeight}px
        </span>
      </StatusItem>

      <StatusItem title="Active frame">
        <span className="font-mono">
          Frame {frameIndex + 1}/{frames.length}
        </span>
      </StatusItem>

      <StatusItem title="Zoom level">
        <span className="font-mono">{Math.round(zoom * 100)}%</span>
      </StatusItem>

      <VSep />

      <StatusItem title="Cursor position (canvas pixels)">
        <span className="font-mono tabular-nums">
          {cursor ? `X: ${cursor.x} Y: ${cursor.y}` : 'X: – Y: –'}
        </span>
      </StatusItem>

      <StatusItem title="Active tool">
        <span className="text-zinc-300">{TOOL_LABELS[tool]}</span>
      </StatusItem>

      {/* Primary / secondary swatch pair — primary is editable via native color input */}
      <span
        className="relative size-6 shrink-0"
        title="Primary (top-left, click to edit) / secondary color"
      >
        <label
          title="Primary color — click to edit"
          className="absolute left-0 top-0 z-0 size-4 cursor-pointer rounded-[2px] border border-zinc-600 transition-transform hover:scale-110"
          style={{ backgroundColor: primary }}
        >
          <input
            type="color"
            aria-label="Primary color"
            value={toHex6(primary)}
            onChange={(e) => useEditorStore.getState().setPrimary(e.target.value, true)}
            className="sr-only"
          />
        </label>
        <span
          role="img"
          aria-label="Secondary color"
          title="Secondary color"
          className="absolute bottom-0 right-0 z-10 size-4 rounded-[2px] border border-zinc-600"
          style={{ backgroundColor: secondary }}
        />
      </span>

      <VSep />

      {/* AI provider chip */}
      <StatusItem title={`AI provider: ${profile?.name ?? 'None'}`}>
        <span
          className={cn(
            'flex items-center gap-1 font-medium',
            isBuiltin ? 'text-violet-400' : 'text-emerald-400'
          )}
        >
          <Sparkles className="size-3 shrink-0" aria-hidden="true" />
          <span className="max-w-44 truncate">{profile?.name ?? 'No provider'}</span>
        </span>
      </StatusItem>

      {/* Undo / redo availability dots */}
      <StatusItem title="Undo / redo availability">
        <span className="flex items-center gap-1">
          <span
            role="img"
            aria-label={undoDepth > 0 ? 'Undo available' : 'Nothing to undo'}
            className={cn('size-1.5 rounded-full', undoDepth > 0 ? 'bg-violet-400' : 'bg-zinc-700')}
          />
          <span
            role="img"
            aria-label={redoDepth > 0 ? 'Redo available' : 'Nothing to redo'}
            className={cn('size-1.5 rounded-full', redoDepth > 0 ? 'bg-violet-400' : 'bg-zinc-700')}
          />
        </span>
      </StatusItem>

      {/* History depth — right aligned */}
      <span
        className="ml-auto flex shrink-0 items-center gap-1 font-mono"
        title="History depth (undo steps)"
      >
        <History className="size-3.5" aria-hidden="true" />
        <span className="tabular-nums">{undoDepth}</span>
      </span>
    </div>
  )
}
