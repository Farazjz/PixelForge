'use client'

// PixelForge AI — Palette panel (right sidebar)
// Primary/secondary color swatches, hex entry, document palette, presets with
// JSON import/export, and recently used colors.

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { ArrowLeftRight, Download, Plus, RotateCcw, Upload } from 'lucide-react'
import { hexToRgba } from '@/lib/pixelforge/engine'
import { PALETTE_PRESETS } from '@/lib/pixelforge/palettes'
import { useEditorStore } from '@/lib/pixelforge/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const HEX_RE = /^#?[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/
const MAX_PALETTE = 256
const MAX_RECENT = 24

function normalizeHex(raw: string): string | null {
  const s = raw.trim()
  if (!HEX_RE.test(s)) return null
  return `#${s.replace('#', '').toUpperCase()}`
}

function toColorInputValue(hex: string): string {
  return `#${hex.replace('#', '').slice(0, 6).toLowerCase()}`
}

interface SwatchProps {
  color: string
  size?: number
  title?: string
  highlight?: boolean
  className?: string
  onClick?: (e: ReactMouseEvent<HTMLButtonElement>) => void
  onContextMenu?: (e: ReactMouseEvent<HTMLButtonElement>) => void
}

function Swatch({ color, size = 24, title, highlight = false, className, onClick, onContextMenu }: SwatchProps) {
  return (
    <button
      type="button"
      title={title ?? color}
      aria-label={`Color ${color}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{ backgroundColor: color, width: size, height: size }}
      className={cn(
        'shrink-0 rounded-sm border border-zinc-700 transition-[transform,border-color] hover:scale-110 hover:border-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
        highlight && 'ring-2 ring-violet-500',
        className,
      )}
    />
  )
}

function PanelLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{children}</h3>
      {right}
    </div>
  )
}

export default function PalettePanel() {
  const { toast } = useToast()

  const primary = useEditorStore((s) => s.primary)
  const secondary = useEditorStore((s) => s.secondary)
  const docPalette = useEditorStore((s) => s.doc.palette)
  const docName = useEditorStore((s) => s.doc.name)
  const recentColors = useEditorStore((s) => s.recentColors)

  const setPrimary = useEditorStore((s) => s.setPrimary)
  const setSecondary = useEditorStore((s) => s.setSecondary)
  const swapColors = useEditorStore((s) => s.swapColors)
  const resetColors = useEditorStore((s) => s.resetColors)
  const setDocPalette = useEditorStore((s) => s.setDocPalette)
  const addPaletteColor = useEditorStore((s) => s.addPaletteColor)
  const removePaletteColor = useEditorStore((s) => s.removePaletteColor)

  const [hexDraft, setHexDraft] = useState(primary)
  const [presetNonce, setPresetNonce] = useState(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setHexDraft(primary)
  }, [primary])

  const [r, g, b, a] = hexToRgba(primary)
  const rgbaHint = `rgba(${r}, ${g}, ${b}, ${a === 255 ? '1' : (a / 255).toFixed(2)})`
  const hexInvalid = hexDraft.trim().length > 0 && !HEX_RE.test(hexDraft.trim())

  const commitHex = () => {
    const normalized = normalizeHex(hexDraft)
    if (normalized) {
      setPrimary(normalized)
      setHexDraft(normalized)
    } else {
      setHexDraft(primary)
    }
  }

  const applyPreset = (presetId: string) => {
    const preset = PALETTE_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    setDocPalette(preset.colors)
    setPresetNonce((n) => n + 1) // remount the select so the same preset can be re-applied
    toast({ title: 'Preset applied', description: `${preset.name} — ${preset.colors.length} colors` })
  }

  const exportPalette = () => {
    const filename = `${docName || 'untitled'}-palette.json`
    const blob = new Blob([JSON.stringify(docPalette, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    toast({ title: 'Palette exported', description: filename })
  }

  const importPalette = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!Array.isArray(parsed)) throw new Error('Expected a JSON array of hex color strings')
      const colors: string[] = []
      for (const item of parsed) {
        if (typeof item !== 'string') throw new Error('Every palette entry must be a hex color string')
        const normalized = normalizeHex(item)
        if (!normalized) throw new Error(`Invalid hex color: "${item}"`)
        if (!colors.includes(normalized)) colors.push(normalized)
        if (colors.length >= MAX_PALETTE) break
      }
      setDocPalette(colors)
      toast({
        title: 'Palette imported',
        description: `${colors.length} color${colors.length === 1 ? '' : 's'}${parsed.length > MAX_PALETTE ? ' (capped at 256)' : ''}`,
      })
    } catch (err) {
      toast({
        title: 'Import failed',
        description: err instanceof Error ? err.message : 'Could not parse palette file',
        variant: 'destructive',
      })
    }
  }

  const recent = recentColors.slice(0, MAX_RECENT)

  return (
    <section aria-label="Color palette panel" className="flex flex-col gap-5 p-3">
      {/* a) primary / secondary swatches */}
      <div>
        <PanelLabel>Colors</PanelLabel>
        <div className="mt-2 flex items-center gap-4">
          <div className="relative h-16 w-16 select-none">
            <label className="absolute left-0 top-0 z-0 cursor-pointer rounded-sm" title="Secondary color">
              <input
                type="color"
                value={toColorInputValue(secondary)}
                onChange={(e) => setSecondary(e.target.value)}
                className="sr-only"
                aria-label="Secondary color"
              />
              <span
                style={{ backgroundColor: secondary }}
                className="block h-7 w-7 rounded-sm border border-zinc-600 shadow-sm"
              />
            </label>
            <label className="absolute left-6 top-6 z-10 cursor-pointer rounded-sm" title="Primary color">
              <input
                type="color"
                value={toColorInputValue(primary)}
                onChange={(e) => setPrimary(e.target.value, false)}
                className="sr-only"
                aria-label="Primary color"
              />
              <span
                style={{ backgroundColor: primary }}
                className="block h-10 w-10 rounded-sm border border-zinc-500 shadow-md"
              />
            </label>
          </div>

          <div className="flex flex-col gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              title="Swap (X)"
              aria-label="Swap primary and secondary colors (X)"
              onClick={swapColors}
              className="size-7 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            >
              <ArrowLeftRight className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Reset (D)"
              aria-label="Reset colors to black and white (D)"
              onClick={resetColors}
              className="size-7 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            >
              <RotateCcw className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* b) hex entry */}
        <div className="mt-3">
          <Input
            value={hexDraft}
            onChange={(e) => setHexDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitHex()
            }}
            onBlur={() => setHexDraft(primary)}
            spellCheck={false}
            aria-invalid={hexInvalid}
            aria-label="Primary color hex value"
            placeholder="#FF004D"
            className="h-8 border-zinc-700 bg-zinc-900/60 font-mono text-xs uppercase"
          />
          <p className="mt-1 text-[10px] text-zinc-600">{rgbaHint} · Enter to apply</p>
        </div>
      </div>

      {/* c) document palette */}
      <div>
        <PanelLabel
          right={
            <span className="text-[10px] tabular-nums text-zinc-600">
              {docPalette.length}/{MAX_PALETTE}
            </span>
          }
        >
          Document palette
        </PanelLabel>
        <div className="mt-2 grid grid-cols-8 gap-1">
          {docPalette.map((hex, i) => (
            <Swatch
              key={`${hex}-${i}`}
              color={hex}
              highlight={hex === primary}
              title={`${hex}${hex === primary ? ' · primary' : ''}`}
              onClick={(e) => {
                if (e.altKey) removePaletteColor(hex)
                else setPrimary(hex)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                setSecondary(hex)
              }}
            />
          ))}
          <button
            type="button"
            onClick={() => addPaletteColor(primary)}
            disabled={docPalette.length >= MAX_PALETTE}
            title="Add primary color to palette"
            aria-label="Add primary color to palette"
            className="flex h-6 w-6 items-center justify-center rounded-sm border border-dashed border-zinc-700 text-zinc-500 transition-colors hover:border-violet-500 hover:text-violet-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:pointer-events-none disabled:opacity-40"
          >
            <Plus className="size-3" />
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-zinc-600">Click: primary · Right-click: secondary · Alt+click: remove</p>
      </div>

      {/* d) presets + import/export */}
      <div>
        <PanelLabel>Presets</PanelLabel>
        <Select key={presetNonce} onValueChange={applyPreset}>
          <SelectTrigger className="mt-2 h-8 w-full border-zinc-700 bg-zinc-900/60 text-xs">
            <SelectValue placeholder="Load preset…" />
          </SelectTrigger>
          <SelectContent className="border-zinc-700 bg-zinc-900 text-xs">
            {PALETTE_PRESETS.map((preset) => (
              <SelectItem key={preset.id} value={preset.id} className="text-xs">
                {preset.name} · {preset.colors.length}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="mt-2 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportPalette}
            className="h-7 flex-1 border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <Download className="size-3" /> Export JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="h-7 flex-1 border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <Upload className="size-3" /> Import
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-label="Import palette JSON file"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void importPalette(file)
            }}
          />
        </div>
      </div>

      {/* e) recent colors */}
      <div>
        <PanelLabel
          right={<span className="text-[10px] tabular-nums text-zinc-600">{recent.length}</span>}
        >
          Recent colors
        </PanelLabel>
        {recent.length === 0 ? (
          <p className="mt-2 text-[11px] text-zinc-600">Draw to collect recent colors.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1">
            {recent.map((hex, i) => (
              <Swatch
                key={`${hex}-${i}`}
                color={hex}
                highlight={hex === primary}
                onClick={() => setPrimary(hex)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setSecondary(hex)
                }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
