'use client'

// PixelForge AI — tool properties panel
// Rendered as a tab inside the right sidebar; sections appear conditionally
// based on the active tool. Every control writes through setToolOptions.

import { useState, type ReactNode } from 'react'
import type { ToolOptions, ToolPattern } from '@/lib/pixelforge/types'
import { useEditorStore } from '@/lib/pixelforge/store'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'

const BRUSH_PATTERNS: { value: ToolPattern; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'dither50', label: 'Dither 50%' },
  { value: 'dither25', label: 'Dither 25%' },
  { value: 'dither75', label: 'Dither 75%' },
]

const TEXT_FONTS: { value: ToolOptions['textFont']; label: string }[] = [
  { value: 'monospace', label: 'Monospace' },
  { value: 'sans-serif', label: 'Sans-serif' },
  { value: 'serif', label: 'Serif' },
]

const DARK_INPUT_CLASS = 'h-8 border-zinc-700 bg-zinc-950/60 text-xs text-zinc-200'

function Section({ children }: { children: ReactNode }) {
  return <section className="flex flex-col gap-2">{children}</section>
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-[11px] leading-snug text-zinc-500">{children}</p>
}

function SwitchRow({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string
  label: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="text-xs text-zinc-300">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

export default function ToolProperties() {
  const tool = useEditorStore((s) => s.tool)
  const pattern = useEditorStore((s) => s.toolOptions.pattern)
  const shapeFilled = useEditorStore((s) => s.toolOptions.shapeFilled)
  const tolerance = useEditorStore((s) => s.toolOptions.tolerance)
  const text = useEditorStore((s) => s.toolOptions.text)
  const textSize = useEditorStore((s) => s.toolOptions.textSize)
  const textFont = useEditorStore((s) => s.toolOptions.textFont)
  const symmetryH = useEditorStore((s) => s.toolOptions.symmetryH)
  const symmetryV = useEditorStore((s) => s.toolOptions.symmetryV)

  const [sizeDraft, setSizeDraft] = useState<string | null>(null)

  const set = (o: Partial<ToolOptions>) => useEditorStore.getState().setToolOptions(o)

  return (
    <div className="flex flex-col gap-4">
      {/* Pencil — brush pattern */}
      {tool === 'pencil' && (
        <Section>
          <Label htmlFor="pf-brush-pattern" className="text-xs text-zinc-300">
            Brush pattern
          </Label>
          <Select value={pattern} onValueChange={(v) => set({ pattern: v as ToolPattern })}>
            <SelectTrigger
              id="pf-brush-pattern"
              size="sm"
              className={`w-full ${DARK_INPUT_CLASS} py-1`}
            >
              <SelectValue placeholder="Pattern" />
            </SelectTrigger>
            <SelectContent className="border-zinc-700 bg-zinc-900 text-zinc-200">
              {BRUSH_PATTERNS.map((p) => (
                <SelectItem key={p.value} value={p.value} className="text-xs focus:bg-zinc-800">
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Section>
      )}

      {/* Eraser — hint */}
      {tool === 'eraser' && (
        <Hint>Right-drag not needed — eraser always clears to transparency.</Hint>
      )}

      {/* Bucket / replace — tolerance */}
      {(tool === 'bucket' || tool === 'replace') && (
        <Section>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="pf-tolerance" className="text-xs text-zinc-300">
              Tolerance
            </Label>
            <span
              aria-label={`Tolerance ${tolerance}`}
              className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-violet-300"
            >
              {tolerance}
            </span>
          </div>
          <Slider
            id="pf-tolerance"
            min={0}
            max={128}
            step={1}
            value={[tolerance]}
            onValueChange={(v) => set({ tolerance: v[0] ?? 0 })}
            className="py-1"
          />
          <Hint>0 = exact pixel match. Higher helps with anti-aliased imports.</Hint>
        </Section>
      )}

      {/* Line / rect / ellipse — filled shape */}
      {(tool === 'line' || tool === 'rect' || tool === 'ellipse') && (
        <Section>
          <SwitchRow
            id="pf-shape-filled"
            label="Filled shape"
            checked={shapeFilled}
            onCheckedChange={(v) => set({ shapeFilled: v })}
          />
          <Hint>Hold Shift with Line tool to snap angles.</Hint>
        </Section>
      )}

      {/* Text — content, size, font */}
      {tool === 'text' && (
        <Section>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pf-text-content" className="text-xs text-zinc-300">
              Text
            </Label>
            <Input
              id="pf-text-content"
              value={text}
              placeholder="Hello!"
              onChange={(e) => set({ text: e.target.value })}
              className={DARK_INPUT_CLASS}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pf-text-size" className="text-xs text-zinc-300">
                Size
              </Label>
              <Input
                id="pf-text-size"
                type="number"
                min={4}
                max={64}
                step={1}
                value={sizeDraft ?? String(textSize)}
                onChange={(e) => {
                  setSizeDraft(e.target.value)
                  const n = Number.parseInt(e.target.value, 10)
                  if (!Number.isNaN(n)) set({ textSize: Math.min(64, Math.max(4, n)) })
                }}
                onBlur={() => setSizeDraft(null)}
                className={DARK_INPUT_CLASS}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pf-text-font" className="text-xs text-zinc-300">
                Font
              </Label>
              <Select
                value={textFont}
                onValueChange={(v) => set({ textFont: v as ToolOptions['textFont'] })}
              >
                <SelectTrigger id="pf-text-font" size="sm" className={`w-full ${DARK_INPUT_CLASS} py-1`}>
                  <SelectValue placeholder="Font" />
                </SelectTrigger>
                <SelectContent className="border-zinc-700 bg-zinc-900 text-zinc-200">
                  {TEXT_FONTS.map((f) => (
                    <SelectItem key={f.value} value={f.value} className="text-xs focus:bg-zinc-800">
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Hint>Click on canvas to place text at that point.</Hint>
        </Section>
      )}

      {/* Select / move — floating pixels hint */}
      {(tool === 'select' || tool === 'move') && (
        <Hint>
          Drag to select. Copy (Ctrl+C) / Paste (Ctrl+V) creates floating pixels; move them with
          the Move tool or arrow keys; Enter or tool change commits them.
        </Hint>
      )}

      {/* Symmetry — always visible */}
      <Section>
        <div className="border-t border-zinc-800 pt-4">
          <Label className="text-xs font-medium text-zinc-300">Symmetry</Label>
        </div>
        <SwitchRow
          id="pf-symmetry-h"
          label="Horizontal"
          checked={symmetryH}
          onCheckedChange={(v) => set({ symmetryH: v })}
        />
        <SwitchRow
          id="pf-symmetry-v"
          label="Vertical"
          checked={symmetryV}
          onCheckedChange={(v) => set({ symmetryV: v })}
        />
      </Section>
    </div>
  )
}
