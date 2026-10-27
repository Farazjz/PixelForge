'use client'

// PixelForge AI — New Project dialog. Opens on window event 'pf:menu-new'.

import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'

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
import { useEditorStore } from '@/lib/pixelforge/store'
import { PALETTE_PRESETS } from '@/lib/pixelforge/palettes'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const PRESET_SIZES = [8, 16, 32, 48, 64, 96, 128, 256, 512] as const

/** Asset type → suggested canvas size. */
const ASSET_SUGGESTIONS: { id: string; label: string; w: number; h: number }[] = [
  { id: 'sprite', label: 'Sprite', w: 32, h: 32 },
  { id: 'character', label: 'Character', w: 32, h: 48 },
  { id: 'tileset', label: 'Tileset', w: 16, h: 16 },
  { id: 'icon', label: 'Icon', w: 16, h: 16 },
  { id: 'background', label: 'Background', w: 256, h: 256 },
]

const DIALOG_CAP = 1024

export function NewProjectDialog() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('Untitled sprite')
  const [width, setWidth] = useState('32')
  const [height, setHeight] = useState('32')
  const [paletteId, setPaletteId] = useState('custom')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handler = () => {
      setName('Untitled sprite')
      setWidth('32')
      setHeight('32')
      setPaletteId('custom')
      setError(null)
      setOpen(true)
    }
    window.addEventListener('pf:menu-new', handler)
    return () => window.removeEventListener('pf:menu-new', handler)
  }, [])

  const applyPreset = (size: number) => {
    setWidth(String(size))
    setHeight(String(size))
    setError(null)
  }

  const applyAssetType = (id: string) => {
    const suggestion = ASSET_SUGGESTIONS.find((a) => a.id === id)
    if (!suggestion) return
    setWidth(String(suggestion.w))
    setHeight(String(suggestion.h))
    setError(null)
  }

  const create = () => {
    const w = Math.round(Number(width))
    const h = Math.round(Number(height))
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1 || w > DIALOG_CAP || h > DIALOG_CAP) {
      setError(`Width and height must be integers between 1 and ${DIALOG_CAP}.`)
      return
    }
    const finalName = name.trim() || 'Untitled sprite'
    useEditorStore.getState().newDoc(w, h, finalName)
    if (paletteId !== 'custom') {
      const preset = PALETTE_PRESETS.find((p) => p.id === paletteId)
      if (preset) useEditorStore.getState().setDocPalette(preset.colors)
    }
    toast({
      title: 'Project created',
      description: `${finalName} — ${w}×${h}px`,
    })
    setOpen(false)
  }

  const wNum = Math.round(Number(width))
  const hNum = Math.round(Number(height))
  const isSquarePreset = (size: number) => wNum === size && hNum === size

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <DialogDescription>Create a fresh pixel-art canvas.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          <div className="grid gap-1.5">
            <Label htmlFor="pf-new-name">Project name</Label>
            <Input
              id="pf-new-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Untitled sprite"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pf-new-w">Width (px)</Label>
              <Input
                id="pf-new-w"
                type="number"
                inputMode="numeric"
                min={1}
                max={DIALOG_CAP}
                value={width}
                onChange={(e) => setWidth(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pf-new-h">Height (px)</Label>
              <Input
                id="pf-new-h"
                type="number"
                inputMode="numeric"
                min={1}
                max={DIALOG_CAP}
                value={height}
                onChange={(e) => setHeight(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Presets (square)</Label>
            <div className="flex flex-wrap gap-1">
              {PRESET_SIZES.map((size) => (
                <Button
                  key={size}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset(size)}
                  className={cn(
                    'h-7 min-w-11 px-2 font-mono text-xs',
                    isSquarePreset(size) && 'border-violet-500/60 bg-violet-500/15 text-violet-300 hover:bg-violet-500/25',
                  )}
                >
                  {size}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="pf-new-asset">Asset type (suggests a size)</Label>
            <Select onValueChange={applyAssetType}>
              <SelectTrigger id="pf-new-asset" className="w-full">
                <SelectValue placeholder="Pick an asset type…" />
              </SelectTrigger>
              <SelectContent>
                {ASSET_SUGGESTIONS.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.label} — {a.w}×{a.h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="pf-new-palette">Palette</Label>
            <Select value={paletteId} onValueChange={setPaletteId}>
              <SelectTrigger id="pf-new-palette" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom (keep current)</SelectItem>
                {PALETTE_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error ? (
            <p className="text-sm text-rose-400" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={create}>
            <Plus className="size-4" />
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
