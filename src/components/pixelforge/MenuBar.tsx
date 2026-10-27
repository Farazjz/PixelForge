'use client'

// PixelForge AI — Top app bar: menus + quick actions.
// Consumes window CustomEvents contract: dispatches pf:menu-* / pf:open-ai-studio / pf:quantize,
// listens for pf:toggle-theme.

import { useCallback, useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import {
  CloudUpload,
  FilePlus2,
  FolderOpen,
  Grid3x3,
  ImageDown,
  Layers2,
  Maximize2,
  Moon,
  Pause,
  Play,
  Redo2,
  Save,
  Settings2,
  Sparkles,
  Sun,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from '@/components/ui/menubar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useEditorStore } from '@/lib/pixelforge/store'
import { PALETTE_PRESETS } from '@/lib/pixelforge/palettes'
import type { CanvasBackground } from '@/lib/pixelforge/types'
import { cn } from '@/lib/utils'

function fire(type: string) {
  window.dispatchEvent(new CustomEvent(type))
}

/** Quick action icon button with tooltip. */
function QuickButton({
  label,
  onClick,
  disabled,
  active,
  accent,
  className,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  accent?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            'h-8 w-8 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100',
            active && 'bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 hover:text-violet-300',
            accent && !active && 'text-violet-400 hover:bg-violet-500/15 hover:text-violet-300',
            className,
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

function MenuTrigger({ label }: { label: string }) {
  return (
    <MenubarTrigger className="h-8 rounded-sm px-2 text-[13px] font-medium text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100 data-[state=open]:bg-zinc-800 data-[state=open]:text-zinc-100">
      {label}
    </MenubarTrigger>
  )
}

export function MenuBar() {
  // Narrow reactive subscriptions (only what affects rendering)
  const undoCount = useEditorStore((s) => s.undoStack.length)
  const redoCount = useEditorStore((s) => s.redoStack.length)
  const hasClipboard = useEditorStore((s) => s.clipboard !== null)
  const hasSelection = useEditorStore((s) => s.selection !== null)
  const layerCount = useEditorStore((s) => s.doc.layers.length)
  const frameCount = useEditorStore((s) => s.doc.frames.length)
  const layerIndex = useEditorStore((s) => s.doc.layers.findIndex((l) => l.id === s.activeLayerId))
  const background = useEditorStore((s) => s.doc.background)
  const primary = useEditorStore((s) => s.primary)
  const playing = useEditorStore((s) => s.playing)
  const gridVisible = useEditorStore((s) => s.gridVisible)
  const onionSkin = useEditorStore((s) => s.onionSkin)
  const zoom = useEditorStore((s) => s.view.zoom)

  const { resolvedTheme, setTheme } = useTheme()

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }, [resolvedTheme, setTheme])

  // Keep the window-event listener pointing at the latest toggle without re-binding
  const toggleThemeRef = useRef(toggleTheme)
  useEffect(() => {
    toggleThemeRef.current = toggleTheme
  }, [toggleTheme])

  useEffect(() => {
    const handler = () => toggleThemeRef.current()
    window.addEventListener('pf:toggle-theme', handler)
    return () => window.removeEventListener('pf:toggle-theme', handler)
  }, [])

  const st = () => useEditorStore.getState()

  return (
    <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900 px-2">
      {/* Left: branding + menus (horizontally scrollable on narrow screens) */}
      <div className="flex min-w-0 items-center gap-2 overflow-x-auto [scrollbar-width:none] md:overflow-visible [&::-webkit-scrollbar]:hidden">
        <div className="ml-1 hidden size-4 shrink-0 grid-cols-2 gap-0.5 md:grid" aria-hidden="true">
          <span className="bg-violet-500" />
          <span className="bg-amber-400" />
          <span className="bg-emerald-400" />
          <span className="bg-rose-400" />
        </div>
        <span className="hidden shrink-0 text-sm font-semibold tracking-tight text-zinc-100 md:block">
          PixelForge AI
        </span>

        <Menubar className="border-none bg-transparent shadow-none">
          {/* ---------- File ---------- */}
          <MenubarMenu>
            <MenuTrigger label="File" />
            <MenubarContent>
              <MenubarItem onSelect={() => fire('pf:menu-new')}>
                New<MenubarShortcut>Ctrl+N</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onSelect={() => fire('pf:menu-open')}>
                Open…<MenubarShortcut>Ctrl+O</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onSelect={() => fire('pf:menu-import')}>
                <ImageDown className="mr-2 size-4" />
                Import Image…
              </MenubarItem>
              <MenubarItem onSelect={() => fire('pf:menu-save')}>
                Save Project (.pfa)<MenubarShortcut>Ctrl+S</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onSelect={() => fire('pf:menu-cloud-save')}>Save to Cloud</MenubarItem>
              <MenubarItem onSelect={() => fire('pf:menu-export')}>Export…</MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          {/* ---------- Edit ---------- */}
          <MenubarMenu>
            <MenuTrigger label="Edit" />
            <MenubarContent>
              <MenubarItem disabled={undoCount === 0} onSelect={() => st().undo()}>
                Undo<MenubarShortcut>Ctrl+Z</MenubarShortcut>
              </MenubarItem>
              <MenubarItem disabled={redoCount === 0} onSelect={() => st().redo()}>
                Redo<MenubarShortcut>Ctrl+Y</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem disabled={!hasSelection} onSelect={() => st().cutSelection()}>
                Cut<MenubarShortcut>Ctrl+X</MenubarShortcut>
              </MenubarItem>
              <MenubarItem disabled={!hasSelection} onSelect={() => st().copySelection()}>
                Copy<MenubarShortcut>Ctrl+C</MenubarShortcut>
              </MenubarItem>
              <MenubarItem disabled={!hasClipboard} onSelect={() => st().pasteClipboard()}>
                Paste<MenubarShortcut>Ctrl+V</MenubarShortcut>
              </MenubarItem>
              <MenubarItem disabled={!hasSelection} onSelect={() => st().deleteSelection()}>
                Delete<MenubarShortcut>Del</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem onSelect={() => st().selectAll()}>
                Select All<MenubarShortcut>Ctrl+A</MenubarShortcut>
              </MenubarItem>
              <MenubarItem disabled={!hasSelection} onSelect={() => st().deselect()}>
                Deselect<MenubarShortcut>Ctrl+D</MenubarShortcut>
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          {/* ---------- Canvas ---------- */}
          <MenubarMenu>
            <MenuTrigger label="Canvas" />
            <MenubarContent>
              <MenubarItem onSelect={() => fire('pf:menu-resize')}>Resize Canvas…</MenubarItem>
              <MenubarItem onSelect={() => st().cropToContent()}>Trim (crop to content)</MenubarItem>
              <MenubarItem disabled={!hasSelection} onSelect={() => st().cropToSelection()}>
                Crop to Selection
              </MenubarItem>
              <MenubarSeparator />
              <MenubarSub>
                <MenubarSubTrigger>Background</MenubarSubTrigger>
                <MenubarSubContent>
                  <MenubarRadioGroup
                    value={background}
                    onValueChange={(v) => st().setBackground(v as CanvasBackground)}
                  >
                    <MenubarRadioItem value="checker">Checkerboard</MenubarRadioItem>
                    <MenubarRadioItem value="dark">Dark</MenubarRadioItem>
                    <MenubarRadioItem value="light">Light</MenubarRadioItem>
                  </MenubarRadioGroup>
                </MenubarSubContent>
              </MenubarSub>
            </MenubarContent>
          </MenubarMenu>

          {/* ---------- Image ---------- */}
          <MenubarMenu>
            <MenuTrigger label="Image" />
            <MenubarContent>
              <MenubarItem onSelect={() => st().flip(true)}>Flip Horizontal</MenubarItem>
              <MenubarItem onSelect={() => st().flip(false)}>Flip Vertical</MenubarItem>
              <MenubarItem onSelect={() => st().rotate()}>Rotate 90° CW</MenubarItem>
              <MenubarSeparator />
              <MenubarItem onSelect={() => st().addOutline()}>Add 1px Outline (primary color)</MenubarItem>
              <MenubarItem onSelect={() => fire('pf:quantize')}>Reduce Colors…</MenubarItem>
              <MenubarSub>
                <MenubarSubTrigger>Quantize (active layer)</MenubarSubTrigger>
                <MenubarSubContent>
                  {[4, 8, 16, 32, 64].map((n) => (
                    <MenubarItem key={n} onSelect={() => st().quantizeActiveLayer(n)}>
                      {n} colors
                    </MenubarItem>
                  ))}
                </MenubarSubContent>
              </MenubarSub>
            </MenubarContent>
          </MenubarMenu>

          {/* ---------- Layer ---------- */}
          <MenubarMenu>
            <MenuTrigger label="Layer" />
            <MenubarContent>
              <MenubarItem onSelect={() => st().addLayer()}>New Layer</MenubarItem>
              <MenubarItem onSelect={() => st().duplicateLayer(st().activeLayerId)}>
                Duplicate Layer
              </MenubarItem>
              <MenubarItem disabled={layerCount <= 1} onSelect={() => st().deleteLayer(st().activeLayerId)}>
                Delete Layer
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem disabled={layerIndex <= 0} onSelect={() => st().mergeDown(st().activeLayerId)}>
                Merge Down
              </MenubarItem>
              <MenubarItem
                disabled={layerIndex < 0 || layerIndex >= layerCount - 1}
                onSelect={() => st().moveLayer(st().activeLayerId, 1)}
              >
                Move Up
              </MenubarItem>
              <MenubarItem disabled={layerIndex <= 0} onSelect={() => st().moveLayer(st().activeLayerId, -1)}>
                Move Down
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem onSelect={() => st().clearLayer()}>Clear Layer</MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          {/* ---------- Animation ---------- */}
          <MenubarMenu>
            <MenuTrigger label="Animation" />
            <MenubarContent>
              <MenubarItem onSelect={() => st().addFrame(false)}>New Frame</MenubarItem>
              <MenubarItem onSelect={() => st().addFrame(true)}>Duplicate Frame</MenubarItem>
              <MenubarItem disabled={frameCount <= 1} onSelect={() => st().deleteFrame(st().activeFrameId)}>
                Delete Frame
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem onSelect={() => st().setPlaying(!st().playing)}>
                {playing ? 'Pause' : 'Play'}
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          {/* ---------- Palette ---------- */}
          <MenubarMenu>
            <MenuTrigger label="Palette" />
            <MenubarContent>
              {PALETTE_PRESETS.map((preset) => (
                <MenubarItem key={preset.id} onSelect={() => st().setDocPalette(preset.colors)}>
                  {preset.name}
                </MenubarItem>
              ))}
              <MenubarSeparator />
              <MenubarItem onSelect={() => st().addPaletteColor(st().primary)}>
                Add Current Color
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          {/* ---------- AI Studio ---------- */}
          <MenubarMenu>
            <MenuTrigger label="AI" />
            <MenubarContent>
              <MenubarItem onSelect={() => fire('pf:open-ai-studio')}>Open AI Studio</MenubarItem>
              <MenubarSeparator />
              <MenubarItem onSelect={() => fire('pf:menu-settings')}>Configure AI Providers…</MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          {/* ---------- View ---------- */}
          <MenubarMenu>
            <MenuTrigger label="View" />
            <MenubarContent>
              <MenubarItem onSelect={() => st().zoomBy(1.25)}>
                Zoom In<MenubarShortcut>+</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onSelect={() => st().zoomBy(0.8)}>
                Zoom Out<MenubarShortcut>-</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onSelect={() => st().actualSize()}>
                Actual Size<MenubarShortcut>1</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onSelect={() => st().fitToViewport()}>
                Fit Canvas<MenubarShortcut>0</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onSelect={() => st().centerCanvas()}>Center</MenubarItem>
              <MenubarSeparator />
              <MenubarCheckboxItem checked={gridVisible} onSelect={() => st().setGridVisible(!gridVisible)}>
                Toggle Grid
              </MenubarCheckboxItem>
              <MenubarCheckboxItem checked={onionSkin} onSelect={() => st().setOnionSkin(!onionSkin)}>
                Toggle Onion Skin
              </MenubarCheckboxItem>
            </MenubarContent>
          </MenubarMenu>

          {/* ---------- Help ---------- */}
          <MenubarMenu>
            <MenuTrigger label="Help" />
            <MenubarContent>
              <MenubarItem onSelect={() => fire('pf:menu-about')}>
                Keyboard Shortcuts &amp; About
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>
      </div>

      {/* Right: quick actions (progressively hidden on narrow screens — full set in menus) */}
      <div className="flex shrink-0 items-center gap-0.5">
        <QuickButton label="New project (Ctrl+N)" className="hidden sm:inline-flex" onClick={() => fire('pf:menu-new')}>
          <FilePlus2 className="size-4" />
        </QuickButton>
        <QuickButton label="Open project (Ctrl+O)" className="hidden md:inline-flex" onClick={() => fire('pf:menu-open')}>
          <FolderOpen className="size-4" />
        </QuickButton>
        <QuickButton label="Save project (.pfa) (Ctrl+S)" className="hidden sm:inline-flex" onClick={() => fire('pf:menu-save')}>
          <Save className="size-4" />
        </QuickButton>
        <QuickButton label="Save to cloud" className="hidden md:inline-flex" onClick={() => fire('pf:menu-cloud-save')}>
          <CloudUpload className="size-4" />
        </QuickButton>

        <div className="mx-0.5 hidden h-5 w-px bg-zinc-800 sm:block" aria-hidden="true" />

        <QuickButton label="Undo (Ctrl+Z)" disabled={undoCount === 0} onClick={() => st().undo()} className="hidden md:inline-flex">
          <Undo2 className="size-4" />
        </QuickButton>
        <QuickButton label="Redo (Ctrl+Y)" disabled={redoCount === 0} onClick={() => st().redo()} className="hidden md:inline-flex">
          <Redo2 className="size-4" />
        </QuickButton>

        <div className="mx-0.5 hidden h-5 w-px bg-zinc-800 lg:block" aria-hidden="true" />

        <QuickButton label="Zoom out (-)" className="hidden lg:inline-flex" onClick={() => st().zoomBy(0.8)}>
          <ZoomOut className="size-4" />
        </QuickButton>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Zoom level — click to reset to 100%"
              onClick={() => st().actualSize()}
              className="hidden h-8 w-12 px-1 text-xs tabular-nums text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 lg:inline-flex"
            >
              {Math.round(zoom * 100)}%
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Reset zoom to 100%</TooltipContent>
        </Tooltip>
        <QuickButton label="Zoom in (+)" className="hidden lg:inline-flex" onClick={() => st().zoomBy(1.25)}>
          <ZoomIn className="size-4" />
        </QuickButton>
        <QuickButton label="Fit canvas (0)" className="hidden lg:inline-flex" onClick={() => st().fitToViewport()}>
          <Maximize2 className="size-4" />
        </QuickButton>
        <QuickButton
          label={gridVisible ? 'Grid: on' : 'Grid: off'}
          active={gridVisible}
          className="hidden md:inline-flex"
          onClick={() => st().setGridVisible(!gridVisible)}
        >
          <Grid3x3 className="size-4" />
        </QuickButton>
        <QuickButton
          label={onionSkin ? 'Onion skin: on' : 'Onion skin: off'}
          active={onionSkin}
          className="hidden md:inline-flex"
          onClick={() => st().setOnionSkin(!onionSkin)}
        >
          <Layers2 className="size-4" />
        </QuickButton>
        <QuickButton
          label={playing ? 'Pause animation' : 'Play animation'}
          className="hidden sm:inline-flex"
          onClick={() => st().setPlaying(!playing)}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </QuickButton>

        <div className="mx-0.5 h-5 w-px bg-zinc-800" aria-hidden="true" />

        <QuickButton label="Open AI Studio" accent onClick={() => fire('pf:open-ai-studio')}>
          <Sparkles className="size-4" />
        </QuickButton>
        <QuickButton label="Toggle light / dark theme" onClick={toggleTheme}>
          {/* CSS-driven so there is no hydration mismatch: sun shows in dark mode, moon in light */}
          <Sun className="hidden size-4 dark:block" />
          <Moon className="size-4 dark:hidden" />
        </QuickButton>
        <QuickButton label="Settings" onClick={() => fire('pf:menu-settings')}>
          <Settings2 className="size-4" />
        </QuickButton>
      </div>
    </header>
  )
}
