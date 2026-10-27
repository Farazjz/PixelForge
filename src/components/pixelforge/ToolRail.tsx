'use client'

// PixelForge AI — vertical tool rail (left edge of the editor)
// Renders every editor tool with its keyboard shortcut, group separators,
// symmetry toggles and a read-only primary color swatch.

import type { LucideIcon } from 'lucide-react'
import {
  BoxSelect,
  Circle,
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  Hand,
  Move,
  PaintBucket,
  PaintRoller,
  Pencil,
  Pipette,
  Slash,
  Square,
  Type,
} from 'lucide-react'
import type { ToolId } from '@/lib/pixelforge/types'
import { useEditorStore } from '@/lib/pixelforge/store'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface RailTool {
  id: ToolId
  name: string
  shortcut: string
  icon: LucideIcon
}

const RAIL_TOOLS: RailTool[] = [
  { id: 'pencil', name: 'Pencil', shortcut: 'B', icon: Pencil },
  { id: 'eraser', name: 'Eraser', shortcut: 'E', icon: Eraser },
  { id: 'bucket', name: 'Bucket fill', shortcut: 'G', icon: PaintBucket },
  { id: 'replace', name: 'Replace color', shortcut: 'Shift+G', icon: PaintRoller },
  { id: 'line', name: 'Line', shortcut: 'L', icon: Slash },
  { id: 'rect', name: 'Rectangle', shortcut: 'R', icon: Square },
  { id: 'ellipse', name: 'Ellipse', shortcut: 'O', icon: Circle },
  { id: 'eyedropper', name: 'Eyedropper', shortcut: 'I', icon: Pipette },
  { id: 'select', name: 'Select', shortcut: 'M', icon: BoxSelect },
  { id: 'move', name: 'Move', shortcut: 'V', icon: Move },
  { id: 'pan', name: 'Pan', shortcut: 'H', icon: Hand },
  { id: 'text', name: 'Text', shortcut: 'T', icon: Type },
]

/** Group dividers are rendered after these tool ids */
const SEPARATOR_AFTER = new Set<ToolId>(['eraser', 'ellipse', 'select', 'pan'])

const TOOLTIP_CLASS = 'border border-zinc-700 bg-zinc-800 text-zinc-100'
const IDLE_TOOL_CLASS = 'size-9 rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
const ACTIVE_TOOL_CLASS = 'bg-violet-600 text-white hover:bg-violet-500 hover:text-white'

export default function ToolRail() {
  const tool = useEditorStore((s) => s.tool)
  const symmetryH = useEditorStore((s) => s.toolOptions.symmetryH)
  const symmetryV = useEditorStore((s) => s.toolOptions.symmetryV)
  const primary = useEditorStore((s) => s.primary)

  const toggleSymmetryH = () => {
    const s = useEditorStore.getState()
    s.setToolOptions({ symmetryH: !s.toolOptions.symmetryH })
  }
  const toggleSymmetryV = () => {
    const s = useEditorStore.getState()
    s.setToolOptions({ symmetryV: !s.toolOptions.symmetryV })
  }

  return (
    <nav
      aria-label="Tool palette"
      className="flex h-full w-12 shrink-0 flex-col items-center border-r border-zinc-800 bg-zinc-900 p-1.5"
    >
      {/* Tools */}
      <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {RAIL_TOOLS.flatMap((t) => {
          const Icon = t.icon
          const active = tool === t.id
          const items = [
            <Tooltip key={t.id}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`${t.name} (${t.shortcut})`}
                  aria-pressed={active}
                  onClick={() => useEditorStore.getState().setTool(t.id)}
                  className={cn(IDLE_TOOL_CLASS, active && ACTIVE_TOOL_CLASS)}
                >
                  <Icon className="size-4.5" strokeWidth={1.75} aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={6} className={TOOLTIP_CLASS}>
                <span className="font-medium">{t.name}</span>
                <span className="ml-1.5 text-zinc-400">{t.shortcut}</span>
              </TooltipContent>
            </Tooltip>,
          ]
          if (SEPARATOR_AFTER.has(t.id)) {
            items.push(
              <Separator
                key={`${t.id}-sep`}
                orientation="horizontal"
                className="w-5 shrink-0 bg-zinc-800"
                aria-hidden="true"
              />
            )
          }
          return items
        })}
      </div>

      {/* Symmetry toggles + primary color swatch */}
      <div className="flex shrink-0 flex-col items-center gap-1 border-t border-zinc-800 pt-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Horizontal symmetry"
              aria-pressed={symmetryH}
              onClick={toggleSymmetryH}
              className={cn(IDLE_TOOL_CLASS, symmetryH && ACTIVE_TOOL_CLASS)}
            >
              <FlipHorizontal2 className="size-4.5" strokeWidth={1.75} aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={6} className={TOOLTIP_CLASS}>
            <span className="font-medium">Symmetry: Horizontal</span>
            <span className="ml-1.5 text-zinc-400">{symmetryH ? 'On' : 'Off'}</span>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Vertical symmetry"
              aria-pressed={symmetryV}
              onClick={toggleSymmetryV}
              className={cn(IDLE_TOOL_CLASS, symmetryV && ACTIVE_TOOL_CLASS)}
            >
              <FlipVertical2 className="size-4.5" strokeWidth={1.75} aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={6} className={TOOLTIP_CLASS}>
            <span className="font-medium">Symmetry: Vertical</span>
            <span className="ml-1.5 text-zinc-400">{symmetryV ? 'On' : 'Off'}</span>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              title="Primary color"
              aria-label="Primary color"
              className="size-8 shrink-0 cursor-default rounded border border-zinc-600 shadow-inner"
              style={{ backgroundColor: primary }}
            />
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={6} className={TOOLTIP_CLASS}>
            Primary color
          </TooltipContent>
        </Tooltip>
      </div>
    </nav>
  )
}
