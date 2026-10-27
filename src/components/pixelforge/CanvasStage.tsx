'use client'

// PixelForge AI — Canvas workspace: pixel-perfect rendering, zoom/pan, tool input.
// All drawing goes through the store; this component only renders buffers + routes pointer events.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditorStore } from '@/lib/pixelforge/store'
import { useHudStore } from '@/lib/pixelforge/settings-store'
import { useToast } from '@/hooks/use-toast'

interface SizeCache {
  canvas: HTMLCanvasElement
  w: number
  h: number
}

// Image-import event contract (consumed by ImportDialog, see Task 3-a):
// window CustomEvent 'pf:import-file' with detail { file: File }.
const IMPORT_FILE_EVENT = 'pf:import-file'

const firstImageFile = (dt: DataTransfer | null): File | null => {
  if (!dt) return null
  // Prefer the first dropped file entry when it is an image…
  if (dt.files.length > 0 && dt.files[0].type.startsWith('image/')) return dt.files[0]
  // …else scan items for anything file-typed and image-ish (e.g. dragged <img> elements).
  for (let i = 0; i < dt.items.length; i++) {
    const item = dt.items[i]
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile()
      if (f) return f
    }
  }
  return null
}

const dragHasFiles = (e: DragEvent): boolean => {
  const dt = e.dataTransfer
  return !!dt && Array.from(dt.types).includes('Files')
}

export default function CanvasStage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const spaceRef = useRef(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const panRef = useRef<{ sx: number; sy: number; panX: number; panY: number } | null>(null)
  const strokeRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const antsOffsetRef = useRef(0)
  const antsRafRef = useRef<number | null>(null)
  const lastToastRef = useRef(0)
  const { toast } = useToast()

  const pixelVersion = useEditorStore((s) => s.pixelVersion)
  const structureVersion = useEditorStore((s) => s.structureVersion)
  const view = useEditorStore((s) => s.view)
  const gridVisible = useEditorStore((s) => s.gridVisible)
  const onionSkin = useEditorStore((s) => s.onionSkin)
  const selection = useEditorStore((s) => s.selection)
  const floating = useEditorStore((s) => s.floating)
  const tool = useEditorStore((s) => s.tool)
  const docW = useEditorStore((s) => s.doc.width)
  const docH = useEditorStore((s) => s.doc.height)
  const playing = useEditorStore((s) => s.playing)

  const warn = useCallback((message: string) => {
    const now = Date.now()
    if (now - lastToastRef.current < 1500) return
    lastToastRef.current = now
    toast({ title: 'Cannot draw here', description: message, variant: 'destructive' })
  }, [toast])

  // ---------- buffer caches ----------
  const compCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const onionPrevRef = useRef<SizeCache | null>(null)
  const onionNextRef = useRef<SizeCache | null>(null)
  const layerCacheRef = useRef<Map<string, SizeCache>>(new Map())
  const previewCacheRef = useRef<SizeCache | null>(null)
  const floatCacheRef = useRef<SizeCache | null>(null)
  const checkerPatternRef = useRef<CanvasPattern | null>(null)

  const getCompCanvas = useCallback((w: number, h: number): HTMLCanvasElement => {
    let c = compCanvasRef.current
    if (!c || c.width !== w || c.height !== h) {
      c = document.createElement('canvas')
      c.width = w; c.height = h
      compCanvasRef.current = c
      layerCacheRef.current.clear()
    }
    return c
  }, [])

  const getCache = useCallback((map: Map<string, SizeCache> | null, key: string, w: number, h: number, single?: { current: SizeCache | null }): SizeCache => {
    if (single) {
      let s = single.current
      if (!s || s.w !== w || s.h !== h) {
        s = { canvas: document.createElement('canvas'), w, h }
        s.canvas.width = w; s.canvas.height = h
        single.current = s
      }
      return s
    }
    if (!map) throw new Error('no map')
    let s = map.get(key)
    if (!s || s.w !== w || s.h !== h) {
      s = { canvas: document.createElement('canvas'), w, h }
      s.canvas.width = w; s.canvas.height = h
      map.set(key, s)
    }
    return s
  }, [])

  const buildCompositeInto = useCallback((canvas: HTMLCanvasElement, frameId: string): void => {
    const st = useEditorStore.getState()
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const layer of st.doc.layers) {
      if (!layer.visible) continue
      const cel = layer.cels[frameId]
      if (!cel) continue
      const cache = getCache(layerCacheRef.current, layer.id, st.doc.width, st.doc.height)
      const lctx = cache.canvas.getContext('2d')!
      const img = lctx.createImageData(st.doc.width, st.doc.height)
      img.data.set(cel)
      lctx.putImageData(img, 0, 0)
      ctx.globalAlpha = layer.opacity
      ctx.drawImage(cache.canvas, 0, 0)
    }
    ctx.globalAlpha = 1
  }, [getCache])

  // ---------- render ----------
  const render = useCallback(() => {
    rafRef.current = null
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const st = useEditorStore.getState()
    const { doc, view: v, gridVisible: grid, onionSkin: onion, selection: sel, floating: fl, previewCel } = st
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const cw = container.clientWidth, ch = container.clientHeight
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr)
      canvas.height = Math.round(ch * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = false

    // workspace background
    ctx.fillStyle = '#131316'
    ctx.fillRect(0, 0, cw, ch)

    const dx = v.panX, dy = v.panY
    const dw = doc.width * v.zoom, dh = doc.height * v.zoom

    // canvas backdrop
    if (doc.background === 'dark') {
      ctx.fillStyle = '#18181b'
      ctx.fillRect(dx, dy, dw, dh)
    } else if (doc.background === 'light') {
      ctx.fillStyle = '#e9e9ea'
      ctx.fillRect(dx, dy, dw, dh)
    } else {
      if (!checkerPatternRef.current) {
        const p = document.createElement('canvas')
        p.width = 16; p.height = 16
        const pctx = p.getContext('2d')!
        pctx.fillStyle = '#3a3a41'
        pctx.fillRect(0, 0, 16, 16)
        pctx.fillStyle = '#2c2c31'
        pctx.fillRect(0, 0, 8, 8)
        pctx.fillRect(8, 8, 8, 8)
        checkerPatternRef.current = ctx.createPattern(p, 'repeat')
      }
      if (checkerPatternRef.current) {
        ctx.save()
        ctx.translate(dx % 16, dy % 16)
        ctx.fillStyle = checkerPatternRef.current
        ctx.fillRect(dx - (dx % 16) - 16, dy - (dy % 16) - 16, dw + 32, dh + 32)
        ctx.restore()
      }
    }

    // composite
    const comp = getCompCanvas(doc.width, doc.height)
    const compCtx = comp.getContext('2d')!
    compCtx.clearRect(0, 0, doc.width, doc.height)

    if (onion && !st.playing && doc.frames.length > 1) {
      const idx = doc.frames.findIndex((f) => f.id === st.activeFrameId)
      const prev = doc.frames[idx - 1]
      const next = doc.frames[idx + 1]
      if (prev) {
        const c = getCache(null, '', doc.width, doc.height, onionPrevRef)
        buildCompositeInto(c.canvas, prev.id)
        compCtx.globalAlpha = 0.22
        compCtx.drawImage(c.canvas, 0, 0)
      }
      if (next) {
        const c = getCache(null, '', doc.width, doc.height, onionNextRef)
        buildCompositeInto(c.canvas, next.id)
        compCtx.globalAlpha = 0.22
        compCtx.drawImage(c.canvas, 0, 0)
      }
      compCtx.globalAlpha = 1
    }

    buildCompositeInto(comp, st.activeFrameId)

    // shape preview
    if (previewCel) {
      const pc = getCache(null, '', doc.width, doc.height, previewCacheRef)
      const pctx = pc.canvas.getContext('2d')!
      const pimg = pctx.createImageData(doc.width, doc.height)
      pimg.data.set(previewCel)
      pctx.putImageData(pimg, 0, 0)
      compCtx.drawImage(pc.canvas, 0, 0)
    }

    // floating selection pixels
    if (fl) {
      const fc = getCache(null, '', fl.w, fl.h, floatCacheRef)
      const fctx = fc.canvas.getContext('2d')!
      const fimg = fctx.createImageData(fl.w, fl.h)
      fimg.data.set(fl.data)
      fctx.putImageData(fimg, 0, 0)
      compCtx.drawImage(fc.canvas, fl.x, fl.y)
    }

    // blit composite scaled
    ctx.drawImage(comp, dx, dy, dw, dh)

    // border
    ctx.strokeStyle = '#52525b'
    ctx.lineWidth = 1
    ctx.strokeRect(dx - 0.5, dy - 0.5, dw + 1, dh + 1)

    // pixel grid
    if (grid && v.zoom >= 4) {
      ctx.beginPath()
      for (let x = 0; x <= doc.width; x++) {
        const px = Math.round(dx + x * v.zoom) + 0.5
        ctx.moveTo(px, dy)
        ctx.lineTo(px, dy + dh)
      }
      for (let y = 0; y <= doc.height; y++) {
        const py = Math.round(dy + y * v.zoom) + 0.5
        ctx.moveTo(dx, py)
        ctx.lineTo(dx + dw, py)
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // selection marching ants
    const antsRect = fl ? { x: fl.x, y: fl.y, w: fl.w, h: fl.h } : sel
    if (antsRect) {
      const rx = dx + antsRect.x * v.zoom
      const ry = dy + antsRect.y * v.zoom
      const rw = antsRect.w * v.zoom
      const rh = antsRect.h * v.zoom
      const off = antsOffsetRef.current
      ctx.save()
      ctx.setLineDash([4, 4])
      ctx.lineDashOffset = -off
      ctx.strokeStyle = '#000000'
      ctx.strokeRect(rx - 0.5, ry - 0.5, rw + 1, rh + 1)
      ctx.lineDashOffset = -off + 4
      ctx.strokeStyle = '#ffffff'
      ctx.strokeRect(rx - 0.5, ry - 0.5, rw + 1, rh + 1)
      ctx.restore()
    }
  }, [buildCompositeInto, getCache, getCompCanvas])

  const scheduleRender = useCallback(() => {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(render)
  }, [render])

  // repaint on any relevant change
  useEffect(() => { scheduleRender() }, [pixelVersion, structureVersion, view, gridVisible, onionSkin, selection, floating, docW, docH, playing, scheduleRender])

  // marching ants animation
  useEffect(() => {
    const hasAnts = !!selection || !!floating
    if (!hasAnts) return
    let alive = true
    const tick = () => {
      if (!alive) return
      antsOffsetRef.current = (antsOffsetRef.current + 0.5) % 8
      scheduleRender()
      antsRafRef.current = requestAnimationFrame(tick)
    }
    antsRafRef.current = requestAnimationFrame(tick)
    return () => { alive = false; if (antsRafRef.current) cancelAnimationFrame(antsRafRef.current) }
  }, [selection, floating, scheduleRender])

  // viewport registration + initial fit
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const register = () => {
      useEditorStore.getState().setViewport(el.clientWidth, el.clientHeight)
      scheduleRender()
    }
    register()
    const ro = new ResizeObserver(register)
    ro.observe(el)
    return () => ro.disconnect()
  }, [scheduleRender])

  useEffect(() => {
    // fit once viewport is measured
    const t = setTimeout(() => useEditorStore.getState().fitToViewport(), 60)
    return () => clearTimeout(t)
  }, [])

  // ---------- coordinate helpers ----------
  const toDoc = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const v = useEditorStore.getState().view
    return {
      x: Math.floor((clientX - rect.left - v.panX) / v.zoom),
      y: Math.floor((clientY - rect.top - v.panY) / v.zoom),
    }
  }, [])

  // ---------- pointer handling ----------
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const st = useEditorStore.getState()
    ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
    const panning = e.button === 1 || spaceRef.current || st.tool === 'pan'
    if (panning) {
      panRef.current = { sx: e.clientX, sy: e.clientY, panX: st.view.panX, panY: st.view.panY }
      return
    }
    if (e.button !== 0 && e.button !== 2) return
    const { x, y } = toDoc(e.clientX, e.clientY)
    const ok = st.strokeBegin(x, y, e.button, e.shiftKey)
    if (!ok) {
      const layer = st.doc.layers.find((l) => l.id === st.activeLayerId)
      if (layer && (layer.locked || !layer.visible)) {
        warn(layer.locked ? 'The active layer is locked.' : 'The active layer is hidden.')
      }
      strokeRef.current = false
      return
    }
    strokeRef.current = true
  }, [toDoc, warn])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const st = useEditorStore.getState()
    const { x, y } = toDoc(e.clientX, e.clientY)
    const inside = x >= 0 && y >= 0 && x < st.doc.width && y < st.doc.height
    useHudStore.getState().setCursor(inside ? { x, y } : null)

    if (panRef.current) {
      const p = panRef.current
      st.panBy(e.clientX - p.sx, e.clientY - p.sy)
      return
    }
    if (strokeRef.current && st.strokeActive) {
      st.strokeMove(x, y, e.shiftKey)
    }
  }, [toDoc])

  const endPointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const st = useEditorStore.getState()
    if (panRef.current) {
      panRef.current = null
      return
    }
    if (strokeRef.current) {
      strokeRef.current = false
      st.strokeEnd(e.shiftKey)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const st = useEditorStore.getState()
      const rect = canvas.getBoundingClientRect()
      st.zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, { x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const onCtx = (e: Event) => e.preventDefault()
    const canvas = canvasRef.current
    canvas?.addEventListener('contextmenu', onCtx)
    return () => canvas?.removeEventListener('contextmenu', onCtx)
  }, [])

  // ---------- image import: drag & drop ----------
  // Attached to the stage container; never touches canvas pointer/pan/stroke logic.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let depth = 0 // guards against dragenter/dragleave child flicker

    const onDragEnter = (e: DragEvent) => {
      e.preventDefault()
      if (!dragHasFiles(e)) return // highlight file drags only
      depth += 1
      setDropActive(true)
    }
    const onDragOver = (e: DragEvent) => {
      e.preventDefault() // required so 'drop' can fire
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDragLeave = () => {
      depth -= 1
      if (depth <= 0) {
        depth = 0
        setDropActive(false)
      }
    }
    const onDrop = (e: DragEvent) => {
      e.preventDefault() // never let the browser navigate, for any drop
      depth = 0
      setDropActive(false)
      const file = firstImageFile(e.dataTransfer)
      if (!file) return // non-image drops are ignored
      window.dispatchEvent(new CustomEvent(IMPORT_FILE_EVENT, { detail: { file } }))
    }

    el.addEventListener('dragenter', onDragEnter)
    el.addEventListener('dragover', onDragOver)
    el.addEventListener('dragleave', onDragLeave)
    el.addEventListener('drop', onDrop)
    return () => {
      el.removeEventListener('dragenter', onDragEnter)
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('dragleave', onDragLeave)
      el.removeEventListener('drop', onDrop)
    }
  }, [])

  // ---------- image import: clipboard paste ----------
  // Window-level 'paste' listener. Mirrors useShortcuts.ts guards: never swallows
  // normal text paste into editable targets or inside open dialogs, and only
  // preventDefault()s when an image File is actually present.
  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false
      return (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      )
    }
    const isDialogOpen = (): boolean =>
      typeof document !== 'undefined' && document.querySelector('[role="dialog"]') !== null

    const onPaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target) || isDialogOpen()) return
      const dt = e.clipboardData
      if (!dt) return
      let file: File | null = null
      for (let i = 0; i < dt.items.length; i++) {
        const item = dt.items[i]
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const f = item.getAsFile()
          if (f) {
            file = f
            break
          }
        }
      }
      if (!file) return // plain text/HTML paste flows through untouched
      e.preventDefault()
      window.dispatchEvent(new CustomEvent(IMPORT_FILE_EVENT, { detail: { file } }))
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  // space-to-pan
  useEffect(() => {
    const isTyping = (): boolean => {
      const el = document.activeElement
      if (!el) return false
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement).isContentEditable
    }
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping()) {
        spaceRef.current = true
        setSpaceHeld(true)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceRef.current = false
        setSpaceHeld(false)
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  // cancel stroke on Escape handled in shortcuts; also safety on unmount
  useEffect(() => () => {
    if (strokeRef.current) useEditorStore.getState().cancelStroke()
  }, [])

  const cursor = spaceHeld || tool === 'pan' ? 'grab' : tool === 'move' ? 'move' : 'crosshair'

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-[#131316]"
      role="application"
      aria-label="Pixel canvas workspace"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none select-none"
        style={{ cursor, imageRendering: 'pixelated' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={() => useHudStore.getState().setCursor(null)}
      />
      <div className="pointer-events-none absolute left-3 top-3 rounded bg-zinc-900/80 px-2 py-1 text-[11px] text-zinc-400">
        {docW}×{docH} · Space+drag / middle mouse to pan · wheel to zoom · drop or paste an image to import
      </div>
      {dropActive && (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-violet-500/70 bg-violet-600/10"
          aria-hidden="true"
        >
          <span className="rounded bg-zinc-900/90 px-3 py-1.5 text-xs font-medium text-violet-300 shadow-lg">
            Drop image to import
          </span>
        </div>
      )}
    </div>
  )
}
