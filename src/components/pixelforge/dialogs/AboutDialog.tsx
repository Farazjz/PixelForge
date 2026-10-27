'use client'

// PixelForge AI — About dialog: app overview, keyboard shortcuts, honest implementation notes.
// Opens on window event 'pf:menu-about'.

import { useEffect, useState } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Ctrl+N', action: 'New project' },
  { keys: 'Ctrl+O', action: 'Open project' },
  { keys: 'Ctrl+S', action: 'Save project (.pfa)' },
  { keys: 'Ctrl+Z', action: 'Undo' },
  { keys: 'Ctrl+Y', action: 'Redo' },
  { keys: 'Ctrl+X', action: 'Cut selection' },
  { keys: 'Ctrl+C', action: 'Copy selection' },
  { keys: 'Ctrl+V', action: 'Paste' },
  { keys: 'Del', action: 'Delete selection' },
  { keys: 'Ctrl+A', action: 'Select all' },
  { keys: 'Ctrl+D', action: 'Deselect' },
  { keys: '1', action: 'Actual size (100%)' },
  { keys: '0', action: 'Fit canvas to viewport' },
  { keys: '+ / -', action: 'Zoom in / out' },
]

const IMPLEMENTED = [
  'Manual pixel editor: layers, frames, tools, palettes, full undo/redo history',
  'AI generation using the built-in provider, or your own OpenAI-compatible server',
  'Guided AI editing (suggestions you apply step-by-step)',
  '.pfa project format (save / open locally)',
  'PNG / JPEG / WebP export including sprite sheets and palette JSON',
]

const LIMITATIONS = [
  'No animated GIF export (export frames as a sprite sheet instead)',
  'No lasso selection — selections are rectangular',
  'No gradient tool',
  'AI edit models require a custom provider (built-in provider covers generation)',
  '.pfa stores raw RGBA, so large projects mean large files',
]

function ShortcutRow({ keys, action }: { keys: string; action: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md px-2 py-1 hover:bg-zinc-800/50">
      <span className="text-sm text-zinc-300">{action}</span>
      <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
        {keys}
      </kbd>
    </div>
  )
}

export function AboutDialog() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('pf:menu-about', handler)
    return () => window.removeEventListener('pf:menu-about', handler)
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-4 grid-cols-2 gap-0.5" aria-hidden="true">
              <span className="bg-violet-500" />
              <span className="bg-amber-400" />
              <span className="bg-emerald-400" />
              <span className="bg-rose-400" />
            </span>
            About PixelForge AI
          </DialogTitle>
          <DialogDescription>
            A pixel-art studio for game sprites — hand-crafted pixels, AI assists when you want them.
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm leading-relaxed text-zinc-300">
          PixelForge AI is a browser-based pixel-art studio. Draw sprites by hand with layers, frames and a
          full history, or let AI generate a starting point and refine it with guided edits. Projects save as
          portable .pfa files or to the cloud, and export as crisp PNG / JPEG / WebP — including sprite
          sheets for game engines.
        </p>

        <Separator />

        <section aria-label="Keyboard shortcuts" className="grid gap-2">
          <h3 className="text-sm font-semibold text-zinc-100">Keyboard shortcuts</h3>
          <div className="grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2">
            {SHORTCUTS.map((s) => (
              <ShortcutRow key={s.keys} {...s} />
            ))}
          </div>
        </section>

        <Separator />

        <section aria-label="Implementation notes" className="grid gap-3">
          <h3 className="text-sm font-semibold text-zinc-100">Implementation notes</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-400">
                Implemented
              </h4>
              <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-zinc-400">
                {IMPLEMENTED.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-400">
                Known limitations
              </h4>
              <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-zinc-400">
                {LIMITATIONS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </DialogContent>
    </Dialog>
  )
}
