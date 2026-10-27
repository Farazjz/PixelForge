'use client'

// PixelForge AI — global keyboard shortcuts hook
// Mount once from the app shell. Reads the store via getState() inside the
// handler so there are no stale closures and the component never subscribes
// to the whole store.

import { useEffect } from 'react'
import { useEditorStore } from '@/lib/pixelforge/store'

const MENU_EVENTS = {
  new: 'pf:menu-new',
  open: 'pf:menu-open',
  save: 'pf:menu-save',
  export: 'pf:menu-export',
} as const

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  )
}

function isDialogOpen(): boolean {
  return typeof document !== 'undefined' && document.querySelector('[role="dialog"]') !== null
}

function dispatchMenuEvent(event: string) {
  window.dispatchEvent(new CustomEvent(event))
}

export function useShortcuts(): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (isTextEntry(e.target) || isDialogOpen()) return

      const s = useEditorStore.getState()
      const mod = e.ctrlKey || e.metaKey
      const key = e.key

      // ---------- modifier combos ----------
      if (mod) {
        switch (key.toLowerCase()) {
          case 'z':
            e.preventDefault()
            if (e.shiftKey) s.redo()
            else s.undo()
            return
          case 'y':
            e.preventDefault()
            s.redo()
            return
          case 'a':
            e.preventDefault()
            s.selectAll()
            return
          case 'd':
            e.preventDefault()
            s.deselect()
            return
          case 'x':
            e.preventDefault()
            s.cutSelection()
            return
          case 'c':
            e.preventDefault()
            s.copySelection()
            return
          case 'v':
            if (s.clipboard) {
              e.preventDefault()
              s.pasteClipboard()
            }
            // no internal pixel clipboard → let the native paste event fire
            // (CanvasStage listens for image pastes and opens the import flow)
            return
          case 'n':
            e.preventDefault()
            dispatchMenuEvent(MENU_EVENTS.new)
            return
          case 'o':
            e.preventDefault()
            dispatchMenuEvent(MENU_EVENTS.open)
            return
          case 's':
            e.preventDefault()
            dispatchMenuEvent(e.shiftKey ? MENU_EVENTS.export : MENU_EVENTS.save)
            return
          default:
            return
        }
      }

      if (e.altKey) return

      // ---------- delete ----------
      if (key === 'Delete' || key === 'Backspace') {
        e.preventDefault()
        s.deleteSelection()
        return
      }

      // ---------- arrow keys: move floating pixels, else nudge selection ----------
      if (key.startsWith('Arrow')) {
        const dx = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0
        const dy = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0
        const step = e.shiftKey ? 8 : 1
        if (s.floating) {
          e.preventDefault()
          s.moveFloating(dx * step, dy * step)
          return
        }
        if (s.selection) {
          e.preventDefault()
          const sel = s.selection
          const maxX = Math.max(0, s.doc.width - sel.w)
          const maxY = Math.max(0, s.doc.height - sel.h)
          const nx = Math.min(Math.max(sel.x + dx * step, 0), maxX)
          const ny = Math.min(Math.max(sel.y + dy * step, 0), maxY)
          if (nx !== sel.x || ny !== sel.y) s.setSelection({ ...sel, x: nx, y: ny })
          return
        }
        return
      }

      // ---------- single-key actions ----------
      if (key === 'Enter') {
        e.preventDefault()
        s.commitFloating()
        return
      }
      if (key === 'Escape') {
        e.preventDefault()
        s.deselect()
        return
      }
      if (key === '0') {
        e.preventDefault()
        s.fitToViewport()
        return
      }
      if (key === '1') {
        e.preventDefault()
        s.actualSize()
        return
      }
      if (key === '=' || key === '+') {
        e.preventDefault()
        s.zoomBy(1.25)
        return
      }
      if (key === '-') {
        e.preventDefault()
        s.zoomBy(0.8)
        return
      }

      // Shift+G (uppercase G) → replace color, before the generic tool keys
      if (key === 'G' || (key === 'g' && e.shiftKey)) {
        e.preventDefault()
        s.setTool('replace')
        return
      }

      switch (key.toLowerCase()) {
        case 'b':
          e.preventDefault()
          s.setTool('pencil')
          return
        case 'e':
          e.preventDefault()
          s.setTool('eraser')
          return
        case 'g':
          e.preventDefault()
          s.setTool('bucket')
          return
        case 'l':
          e.preventDefault()
          s.setTool('line')
          return
        case 'r':
          e.preventDefault()
          s.setTool('rect')
          return
        case 'o':
          e.preventDefault()
          s.setTool('ellipse')
          return
        case 'i':
          e.preventDefault()
          s.setTool('eyedropper')
          return
        case 'm':
          e.preventDefault()
          s.setTool('select')
          return
        case 'v':
          e.preventDefault()
          s.setTool('move')
          return
        case 'h':
          e.preventDefault()
          s.setTool('pan')
          return
        case 't':
          e.preventDefault()
          s.setTool('text')
          return
        case 'x':
          e.preventDefault()
          s.swapColors()
          return
        case 'd':
          e.preventDefault()
          s.resetColors()
          return
        default:
          return
      }
    }

    window.addEventListener('keydown', handler, false)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
