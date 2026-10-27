'use client'

// PixelForge AI — Editor store (Zustand)
// Pixel data mutates in place for performance; pixelVersion/structureVersion signal repaints.

import { create } from 'zustand'
import {
  type ClipboardData, type Frame, type FloatingSelection, type HistoryEntry, type Layer,
  type PFDocument, type Rect, type ToolId, type ToolOptions, type View,
} from './types'
import {
  cloneCel, compositeFrame, createCel, drawEllipse, drawLine, drawRect, extractRegion, clearRegion,
  floodFill, flipH, flipV, rotate90CW, hexToRgba, computeBBox, outlineCel, rasterizeText,
  replaceColor, nearestScale, type RGBA,
} from './engine'
import { DEFAULT_PALETTE } from './palettes'

const uid = (p: string) => `${p}${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`

export function makeLayer(name: string, w: number, h: number, frameIds: string[], fill = true): Layer {
  return {
    id: uid('l'),
    name,
    visible: true,
    locked: false,
    opacity: 1,
    cels: Object.fromEntries(frameIds.map((f) => [f, fill ? createCel(w, h) : null])),
  }
}

export function makeFrame(durationMs = 120): Frame {
  return { id: uid('f'), durationMs }
}

export function createDocument(w: number, h: number, name = 'Untitled'): PFDocument {
  const frame = makeFrame(120)
  const layer = makeLayer('Background', w, h, [frame.id])
  return {
    name, width: w, height: h,
    frames: [frame],
    layers: [layer],
    palette: [...DEFAULT_PALETTE],
    background: 'checker',
    metadata: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  }
}

function cloneDoc(doc: PFDocument): PFDocument {
  return {
    ...doc,
    frames: doc.frames.map((f) => ({ ...f })),
    layers: doc.layers.map((l) => ({
      ...l,
      cels: Object.fromEntries(Object.entries(l.cels).map(([k, v]) => [k, v ? cloneCel(v) : null])),
    })),
    palette: [...doc.palette],
    metadata: { ...doc.metadata },
  }
}

const HISTORY_MAX_BYTES = 96 * 1024 * 1024
const HISTORY_MAX_ENTRIES = 48

export const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  pattern: 'solid',
  shapeFilled: false,
  tolerance: 0,
  text: 'PIXEL',
  textSize: 8,
  textFont: 'monospace',
  symmetryH: false,
  symmetryV: false,
}

export interface EditorState {
  doc: PFDocument
  activeFrameId: string
  activeLayerId: string
  tool: ToolId
  toolOptions: ToolOptions
  primary: string
  secondary: string
  recentColors: string[]
  selection: Rect | null
  floating: FloatingSelection | null
  clipboard: ClipboardData | null
  view: View
  viewport: { w: number; h: number }
  gridVisible: boolean
  onionSkin: boolean
  playing: boolean
  pixelVersion: number
  structureVersion: number
  dirty: boolean
  projectId: string | null
  // stroke internals
  strokeActive: boolean
  strokeButton: number
  strokeAnchor: { x: number; y: number } | null
  strokeBefore: Uint8ClampedArray | null
  strokeLabel: string
  lastPoint: { x: number; y: number } | null
  previewCel: Uint8ClampedArray | null
  undoStack: HistoryEntry[]
  redoStack: HistoryEntry[]
  historyBytes: number

  // ---------- document ----------
  newDoc: (w: number, h: number, name?: string) => void
  loadDoc: (doc: PFDocument, projectId?: string | null) => void
  setDocName: (name: string) => void
  markSaved: (projectId?: string | null) => void
  resizeCanvas: (w: number, h: number, anchor?: string) => void
  scaleArtwork: (factor: number) => void
  cropToContent: () => void
  cropToSelection: () => void
  setBackground: (bg: PFDocument['background']) => void

  // ---------- view ----------
  setZoom: (zoom: number, focus?: { x: number; y: number }) => void
  zoomBy: (factor: number, focus?: { x: number; y: number }) => void
  panBy: (dx: number, dy: number) => void
  setPan: (x: number, y: number) => void
  setViewport: (w: number, h: number) => void
  fitToViewport: () => void
  actualSize: () => void
  centerCanvas: () => void
  setGridVisible: (v: boolean) => void
  setOnionSkin: (v: boolean) => void
  setPlaying: (v: boolean) => void

  // ---------- tools ----------
  setTool: (t: ToolId) => void
  setToolOptions: (o: Partial<ToolOptions>) => void
  setPrimary: (hex: string, pushRecent?: boolean) => void
  setSecondary: (hex: string) => void
  swapColors: () => void
  resetColors: () => void

  // ---------- strokes ----------
  canPaint: () => boolean
  strokeBegin: (x: number, y: number, button: number, shift: boolean) => boolean
  strokeMove: (x: number, y: number, shift: boolean) => void
  strokeEnd: (shift: boolean) => void
  cancelStroke: () => void

  // ---------- selection / floating ----------
  setSelection: (r: Rect | null) => void
  selectAll: () => void
  deselect: () => void
  moveFloating: (dx: number, dy: number) => void
  commitFloating: () => void
  cutSelection: () => void
  copySelection: () => void
  pasteClipboard: () => void
  deleteSelection: () => void

  // ---------- layers ----------
  setActiveLayer: (id: string) => void
  addLayer: () => void
  deleteLayer: (id: string) => void
  duplicateLayer: (id: string) => void
  mergeDown: (id: string) => void
  moveLayer: (id: string, dir: -1 | 1) => void
  updateLayer: (id: string, patch: Partial<Pick<Layer, 'name' | 'visible' | 'locked' | 'opacity'>>) => void
  clearLayer: () => void

  // ---------- frames ----------
  setActiveFrame: (id: string) => void
  addFrame: (copyContent: boolean) => void
  deleteFrame: (id: string) => void
  moveFrame: (id: string, dir: -1 | 1) => void
  updateFrame: (id: string, patch: Partial<Pick<Frame, 'durationMs'>>) => void

  // ---------- transforms & ops ----------
  flip: (horizontal: boolean) => void
  rotate: () => void
  addOutline: () => void
  quantizeActiveLayer: (n: number) => void
  importImageIntoDoc: (data: Uint8ClampedArray, w: number, h: number, mode: 'new-layer' | 'replace-layer') => void

  // ---------- palette ----------
  setDocPalette: (colors: string[]) => void
  addPaletteColor: (hex: string) => void
  removePaletteColor: (hex: string) => void

  // ---------- history ----------
  undo: () => void
  redo: () => void
  pushHistory: (entry: HistoryEntry) => void
}

function snapDoc(label: string, mutate: (d: PFDocument) => void) {
  const get = () => useEditorStore.getState()
  const set = useEditorStore.setState
  const { doc } = get()
  const before = cloneDoc(doc)
  const after = cloneDoc(doc)
  mutate(after)
  after.metadata.updatedAt = new Date().toISOString()
  get().pushHistory({ kind: 'doc', label, before, after })
  set({ doc: after, dirty: true, structureVersion: get().structureVersion + 1, pixelVersion: get().pixelVersion + 1 })
}

let setStore: (partial: Partial<EditorState> | ((s: EditorState) => Partial<EditorState>)) => void
let getStore: () => EditorState

export const useEditorStore = create<EditorState>((set, get) => {
  setStore = set
  getStore = get
  const doc0 = createDocument(32, 32)
  return {
    doc: doc0,
    activeFrameId: doc0.frames[0].id,
    activeLayerId: doc0.layers[0].id,
    tool: 'pencil',
    toolOptions: { ...DEFAULT_TOOL_OPTIONS },
    primary: '#000000',
    secondary: '#FFFFFF',
    recentColors: [],
    selection: null,
    floating: null,
    clipboard: null,
    view: { zoom: 8, panX: 0, panY: 0 },
    viewport: { w: 800, h: 600 },
    gridVisible: true,
    onionSkin: false,
    playing: false,
    pixelVersion: 1,
    structureVersion: 1,
    dirty: false,
    projectId: null,
    strokeActive: false,
    strokeButton: 0,
    strokeAnchor: null,
    strokeBefore: null,
    strokeLabel: '',
    lastPoint: null,
    previewCel: null,
    undoStack: [],
    redoStack: [],
    historyBytes: 0,

    // ================= document =================
    newDoc: (w, h, name) => {
      const d = createDocument(w, h, name)
      set({
        doc: d, activeFrameId: d.frames[0].id, activeLayerId: d.layers[0].id,
        selection: null, floating: null, previewCel: null, dirty: false, projectId: null,
        undoStack: [], redoStack: [], historyBytes: 0, playing: false,
        structureVersion: get().structureVersion + 1, pixelVersion: get().pixelVersion + 1,
      })
      get().fitToViewport()
    },

    loadDoc: (d, projectId) => {
      set({
        doc: d, activeFrameId: d.frames[0].id, activeLayerId: d.layers[d.layers.length - 1].id,
        selection: null, floating: null, previewCel: null, dirty: false,
        projectId: projectId ?? null, undoStack: [], redoStack: [], historyBytes: 0, playing: false,
        structureVersion: get().structureVersion + 1, pixelVersion: get().pixelVersion + 1,
      })
      get().fitToViewport()
    },

    setDocName: (name) => { set({ doc: { ...get().doc, name }, dirty: true, structureVersion: get().structureVersion + 1 }) },
    markSaved: (projectId) => set({ dirty: false, projectId: projectId ?? get().projectId }),
    setBackground: (bg) => snapDoc('Canvas background', (d) => { d.background = bg }),

    resizeCanvas: (w, h, anchor = 'center') => {
      snapDoc('Resize canvas', (d) => {
        const ow = d.width, oh = d.height
        const dx = anchor.includes('w') ? 0 : anchor.includes('e') ? w - ow : Math.floor((w - ow) / 2)
        const dy = anchor.includes('n') ? 0 : anchor.includes('s') ? h - oh : Math.floor((h - oh) / 2)
        d.width = w; d.height = h
        for (const layer of d.layers) {
          for (const fid of Object.keys(layer.cels)) {
            const cel = layer.cels[fid]
            if (!cel) continue
            const nc = createCel(w, h)
            for (let y = 0; y < oh; y++) {
              const ty = y + dy
              if (ty < 0 || ty >= h) continue
              for (let x = 0; x < ow; x++) {
                const tx = x + dx
                if (tx < 0 || tx >= w) continue
                const si = (y * ow + x) * 4, di = (ty * w + tx) * 4
                nc[di] = cel[si]; nc[di + 1] = cel[si + 1]; nc[di + 2] = cel[si + 2]; nc[di + 3] = cel[si + 3]
              }
            }
            layer.cels[fid] = nc
          }
        }
      })
      set({ selection: null, floating: null, previewCel: null })
      get().fitToViewport()
    },

    scaleArtwork: (factor) => {
      snapDoc('Resize artwork', (d) => {
        const nw = Math.max(1, Math.round(d.width * factor))
        const nh = Math.max(1, Math.round(d.height * factor))
        for (const layer of d.layers) {
          for (const fid of Object.keys(layer.cels)) {
            const cel = layer.cels[fid]
            if (!cel) continue
            const sc = nearestScale(cel, d.width, d.height, factor)
            layer.cels[fid] = sc.data
          }
        }
        d.width = nw; d.height = nh
      })
      set({ selection: null, floating: null, previewCel: null })
      get().fitToViewport()
    },

    cropToContent: () => {
      const { doc, activeFrameId } = get()
      const comp = compositeFrame(doc, activeFrameId)
      const bbox = computeBBox(comp, doc.width, doc.height)
      if (!bbox) return
      snapDoc('Trim', (d) => {
        const { x, y, w, h } = bbox
        for (const layer of d.layers) {
          for (const fid of Object.keys(layer.cels)) {
            const cel = layer.cels[fid]
            if (!cel) continue
            layer.cels[fid] = extractRegion(cel, d.width, d.height, { x, y, w, h })
          }
        }
        d.width = w; d.height = h
      })
      set({ selection: null, floating: null })
      get().fitToViewport()
    },

    cropToSelection: () => {
      const sel = get().selection
      if (!sel) return
      snapDoc('Crop to selection', (d) => {
        for (const layer of d.layers) {
          for (const fid of Object.keys(layer.cels)) {
            const cel = layer.cels[fid]
            if (!cel) continue
            layer.cels[fid] = extractRegion(cel, d.width, d.height, sel)
          }
        }
        d.width = sel.w; d.height = sel.h
      })
      set({ selection: null, floating: null })
      get().fitToViewport()
    },

    // ================= view =================
    setZoom: (zoom, focus) => {
      const z = Math.max(0.25, Math.min(32, zoom))
      const { view } = get()
      if (focus) {
        const rx = (focus.x - view.panX) / view.zoom
        const ry = (focus.y - view.panY) / view.zoom
        set({ view: { zoom: z, panX: focus.x - rx * z, panY: focus.y - ry * z } })
      } else {
        set({ view: { ...view, zoom: z } })
      }
    },
    zoomBy: (factor, focus) => get().setZoom(get().view.zoom * factor, focus),
    panBy: (dx, dy) => set({ view: { ...get().view, panX: get().view.panX + dx, panY: get().view.panY + dy } }),
    setPan: (x, y) => set({ view: { ...get().view, panX: x, panY: y } }),
    setViewport: (w, h) => {
      const changed = w !== get().viewport.w || h !== get().viewport.h
      set({ viewport: { w, h } })
      if (changed && get().view.zoom === get().view.zoom) {
        // keep canvas visible if it is out of view
        const { view, doc } = get()
        const cw = doc.width * view.zoom, ch = doc.height * view.zoom
        if (view.panX + cw < 0 || view.panY + ch < 0 || view.panX > w || view.panY > h) get().fitToViewport()
      }
    },
    fitToViewport: () => {
      const { viewport, doc } = get()
      if (viewport.w < 10 || viewport.h < 10) return
      const z = Math.max(0.25, Math.min(32, Math.min((viewport.w - 48) / doc.width, (viewport.h - 48) / doc.height)))
      const snapped = z >= 1 ? Math.max(1, Math.floor(z * 2) / 2) : z
      set({
        view: {
          zoom: snapped,
          panX: Math.round((viewport.w - doc.width * snapped) / 2),
          panY: Math.round((viewport.h - doc.height * snapped) / 2),
        },
      })
    },
    actualSize: () => {
      const { viewport, doc } = get()
      set({
        view: {
          zoom: 1,
          panX: Math.round((viewport.w - doc.width) / 2),
          panY: Math.round((viewport.h - doc.height) / 2),
        },
      })
    },
    centerCanvas: () => {
      const { viewport, doc, view } = get()
      set({ view: { ...view, panX: Math.round((viewport.w - doc.width * view.zoom) / 2), panY: Math.round((viewport.h - doc.height * view.zoom) / 2) } })
    },
    setGridVisible: (v) => set({ gridVisible: v }),
    setOnionSkin: (v) => set({ onionSkin: v, pixelVersion: get().pixelVersion + 1 }),
    setPlaying: (v) => set({ playing: v }),

    // ================= tools =================
    setTool: (t) => {
      if (get().floating) get().commitFloating()
      set({ tool: t, previewCel: null, strokeActive: false })
    },
    setToolOptions: (o) => set({ toolOptions: { ...get().toolOptions, ...o } }),
    setPrimary: (hex, pushRecent = true) => {
      const clean = hex.toUpperCase()
      if (!pushRecent) { set({ primary: clean }); return }
      const rec = [clean, ...get().recentColors.filter((c) => c !== clean)].slice(0, 24)
      set({ primary: clean, recentColors: rec })
    },
    setSecondary: (hex) => set({ secondary: hex.toUpperCase() }),
    swapColors: () => set({ primary: get().secondary, secondary: get().primary }),
    resetColors: () => set({ primary: '#000000', secondary: '#FFFFFF' }),

    // ================= strokes =================
    canPaint: () => {
      const { doc, activeLayerId } = get()
      const layer = doc.layers.find((l) => l.id === activeLayerId)
      return !!layer && layer.visible && !layer.locked
    },

    strokeBegin: (x, y, button, _shift) => {
      const s = get()
      if (x < 0 || y < 0 || x >= s.doc.width || y >= s.doc.height) return false
      if (s.floating) s.commitFloating()
      const layer = s.doc.layers.find((l) => l.id === s.activeLayerId)
      if (!layer || !layer.visible || layer.locked) return false
      const beforeCel = layer.cels[s.activeFrameId] ?? createCel(s.doc.width, s.doc.height)
      const before = cloneCel(beforeCel)
      const opts = { pattern: s.toolOptions.pattern, clip: s.selection }
      const sym = s.toolOptions

      set({
        strokeActive: true,
        strokeButton: button,
        strokeAnchor: { x, y },
        strokeBefore: before,
        lastPoint: { x, y },
        strokeLabel: s.tool,
      })

      const cel = layer.cels[s.activeFrameId] ?? createCel(s.doc.width, s.doc.height)
      layer.cels[s.activeFrameId] = cel

      switch (s.tool) {
        case 'pencil': {
          const colRgba = hexToRgba(button === 2 ? s.secondary : s.primary)
          const w = s.doc.width, h = s.doc.height
          const paintPt = (px: number, py: number) => {
            const pts: [number, number][] = [[px, py]]
            if (sym.symmetryH) pts.push([w - 1 - px, py])
            if (sym.symmetryV) pts.push([px, h - 1 - py])
            if (sym.symmetryH && sym.symmetryV) pts.push([w - 1 - px, h - 1 - py])
            for (const [ax, ay] of pts) {
              const i = (ay * w + ax) * 4
              if (ax < 0 || ay < 0 || ax >= w || ay >= h) continue
              if (opts.clip && (ax < opts.clip.x || ay < opts.clip.y || ax >= opts.clip.x + opts.clip.w || ay >= opts.clip.y + opts.clip.h)) continue
              if (!patternOk(s.toolOptions.pattern, ax, ay)) continue
              cel[i] = colRgba[0]; cel[i + 1] = colRgba[1]; cel[i + 2] = colRgba[2]; cel[i + 3] = colRgba[3]
            }
          }
          paintPt(x, y)
          set({ pixelVersion: get().pixelVersion + 1 })
          return true
        }
        case 'eraser': {
          const w = s.doc.width, h = s.doc.height
          const paintPt = (px: number, py: number) => {
            const pts: [number, number][] = [[px, py]]
            if (sym.symmetryH) pts.push([w - 1 - px, py])
            if (sym.symmetryV) pts.push([px, h - 1 - py])
            if (sym.symmetryH && sym.symmetryV) pts.push([w - 1 - px, h - 1 - py])
            for (const [ax, ay] of pts) {
              const i = (ay * w + ax) * 4
              if (ax < 0 || ay < 0 || ax >= w || ay >= h) continue
              if (opts.clip && (ax < opts.clip.x || ay < opts.clip.y || ax >= opts.clip.x + opts.clip.w || ay >= opts.clip.y + opts.clip.h)) continue
              cel[i] = 0; cel[i + 1] = 0; cel[i + 2] = 0; cel[i + 3] = 0
            }
          }
          paintPt(x, y)
          set({ pixelVersion: get().pixelVersion + 1 })
          return true
        }
        case 'bucket': {
          const col = hexToRgba(button === 2 ? s.secondary : s.primary)
          floodFill(cel, s.doc.width, s.doc.height, x, y, col, s.toolOptions.tolerance, s.selection)
          set({ pixelVersion: get().pixelVersion + 1 })
          return true
        }
        case 'replace': {
          const w = s.doc.width, h = s.doc.height
          const i = (y * w + x) * 4
          const from: RGBA = [cel[i], cel[i + 1], cel[i + 2], cel[i + 3]]
          const to = hexToRgba(button === 2 ? s.secondary : s.primary)
          replaceColor(cel, w, h, from, to, s.toolOptions.tolerance, s.selection)
          set({ pixelVersion: get().pixelVersion + 1 })
          return true
        }
        case 'line': case 'rect': case 'ellipse': {
          const preview = createCel(s.doc.width, s.doc.height)
          set({ previewCel: preview })
          return true
        }
        case 'eyedropper': {
          const comp = compositeFrame(s.doc, s.activeFrameId)
          const i = (y * s.doc.width + x) * 4
          const hex = '#' + [comp[i], comp[i + 1], comp[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()
          if (button === 2) s.setSecondary(hex); else s.setPrimary(hex)
          set({ strokeActive: false })
          return true
        }
        case 'text': {
          const t = s.toolOptions
          if (!t.text.trim()) { set({ strokeActive: false }); return false }
          const res = rasterizeText(s.doc.width, s.doc.height, t.text, t.textFont, t.textSize, x, y, hexToRgba(s.primary))
          layer.cels[s.activeFrameId] = res.data
          set({ pixelVersion: get().pixelVersion + 1, strokeActive: false })
          get().pushHistory({
            kind: 'pixels', label: 'Text', frameId: s.activeFrameId, layerId: s.activeLayerId,
            before, after: cloneCel(res.data),
          })
          return false
        }
        case 'select': {
          set({ previewCel: null })
          return true
        }
        case 'move': {
          const sel = s.selection
          if (sel) {
            const data = extractRegion(cel, s.doc.width, s.doc.height, sel)
            clearRegion(cel, s.doc.width, s.doc.height, sel)
            set({
              floating: { data, w: sel.w, h: sel.h, x: sel.x, y: sel.y, originBefore: before, frameId: s.activeFrameId, layerId: s.activeLayerId },
              pixelVersion: get().pixelVersion + 1,
            })
            return true
          }
          return false
        }
        default:
          return false
      }
    },

    strokeMove: (x, y, shift) => {
      const s = get()
      if (!s.strokeActive) return
      const dx = x - (s.lastPoint?.x ?? x), dy = y - (s.lastPoint?.y ?? y)
      set({ lastPoint: { x, y } })
      const layer = s.doc.layers.find((l) => l.id === s.activeLayerId)
      const w = s.doc.width, h = s.doc.height
      const opts = { pattern: s.toolOptions.pattern, clip: s.selection }

      if (s.tool === 'move' && s.floating) {
        set({ floating: { ...s.floating, x: s.floating.x + dx, y: s.floating.y + dy }, pixelVersion: s.pixelVersion + 1 })
        return
      }
      if (s.tool === 'select' && s.strokeAnchor) {
        const a = s.strokeAnchor
        set({
          selection: {
            x: Math.min(a.x, x), y: Math.min(a.y, y),
            w: Math.abs(x - a.x) + 1, h: Math.abs(y - a.y) + 1,
          },
        })
        return
      }
      if (!layer) return
      const cel = layer.cels[s.activeFrameId]
      if (!cel) return

      if (s.tool === 'pencil' || s.tool === 'eraser') {
        const prev = s.lastPoint
        const colRgba = s.tool === 'eraser' ? ([0, 0, 0, 0] as RGBA) : hexToRgba(s.strokeButton === 2 ? s.secondary : s.primary)
        if (prev) {
          drawLine(cel, w, h, prev.x, prev.y, x, y, colRgba, opts)
        }
        set({ pixelVersion: s.pixelVersion + 1 })
        return
      }
      if ((s.tool === 'line' || s.tool === 'rect' || s.tool === 'ellipse') && s.strokeAnchor && s.previewCel) {
        const a = s.strokeAnchor
        let ex = x, ey = y
        if (shift && s.tool === 'line') {
          const ddx = x - a.x, ddy = y - a.y
          if (Math.abs(ddx) > Math.abs(ddy) * 2) ey = a.y
          else if (Math.abs(ddy) > Math.abs(ddx) * 2) ex = a.x
          else { const m = Math.min(Math.abs(ddx), Math.abs(ddy)); ex = a.x + Math.sign(ddx) * m; ey = a.y + Math.sign(ddy) * m }
        }
        const colRgba = hexToRgba(s.strokeButton === 2 ? s.secondary : s.primary)
        const p = s.previewCel
        p.fill(0)
        if (s.tool === 'line') drawLine(p, w, h, a.x, a.y, ex, ey, colRgba, { clip: s.selection })
        else if (s.tool === 'rect') drawRect(p, w, h, a.x, a.y, ex, ey, colRgba, s.toolOptions.shapeFilled, { clip: s.selection })
        else drawEllipse(p, w, h, a.x, a.y, ex, ey, colRgba, s.toolOptions.shapeFilled, { clip: s.selection })
        set({ pixelVersion: s.pixelVersion + 1 })
      }
    },

    strokeEnd: (_shift) => {
      const s = get()
      if (!s.strokeActive) return
      const layer = s.doc.layers.find((l) => l.id === s.activeLayerId)
      const before = s.strokeBefore
      set({ strokeActive: false, previewCel: null })
      if (!layer || !before) return
      const after = layer.cels[s.activeFrameId]
      if (!after) return

      if (s.tool === 'select') {
        if (!s.selection || (s.selection.w <= 0 && s.selection.h <= 0)) set({ selection: null })
        return
      }
      if (s.tool === 'eyedropper' || s.tool === 'pan') return
      if (s.tool === 'move') return // floating continues to live until commit
      if (s.tool === 'text') return // already pushed

      let changed = false
      for (let i = 0; i < before.length; i += 4) {
        if (before[i] !== after[i] || before[i + 1] !== after[i + 1] || before[i + 2] !== after[i + 2] || before[i + 3] !== after[i + 3]) { changed = true; break }
      }
      if (!changed) { set({ strokeBefore: null }); return }
      get().pushHistory({
        kind: 'pixels',
        label: s.tool === 'pencil' ? 'Pencil stroke' : s.tool === 'eraser' ? 'Erase' : s.tool,
        frameId: s.activeFrameId,
        layerId: s.activeLayerId,
        before,
        after: cloneCel(after),
      })
      set({ strokeBefore: null, dirty: true })
    },

    cancelStroke: () => {
      const s = get()
      if (s.strokeBefore) {
        const layer = s.doc.layers.find((l) => l.id === s.activeLayerId)
        if (layer) layer.cels[s.activeFrameId] = s.strokeBefore
      }
      set({ strokeActive: false, previewCel: null, strokeBefore: null, pixelVersion: s.pixelVersion + 1 })
    },

    // ================= selection / floating =================
    setSelection: (r) => set({ selection: r }),
    selectAll: () => set({ selection: { x: 0, y: 0, w: get().doc.width, h: get().doc.height } }),
    deselect: () => {
      const s = get()
      if (s.floating) s.commitFloating()
      set({ selection: null })
    },
    moveFloating: (dx, dy) => {
      const f = get().floating
      if (!f) return
      set({ floating: { ...f, x: f.x + dx, y: f.y + dy }, pixelVersion: get().pixelVersion + 1 })
    },
    commitFloating: () => {
      const s = get()
      const f = s.floating
      if (!f) return
      const layer = s.doc.layers.find((l) => l.id === f.layerId)
      if (layer) {
        const cel = layer.cels[f.frameId] ?? createCel(s.doc.width, s.doc.height)
        layer.cels[f.frameId] = cel
        for (let y = 0; y < f.h; y++) {
          const ty = f.y + y
          if (ty < 0 || ty >= s.doc.height) continue
          for (let x = 0; x < f.w; x++) {
            const tx = f.x + x
            if (tx < 0 || tx >= s.doc.width) continue
            const si = (y * f.w + x) * 4
            if (f.data[si + 3] > 0) {
              const di = (ty * s.doc.width + tx) * 4
              cel[di] = f.data[si]; cel[di + 1] = f.data[si + 1]; cel[di + 2] = f.data[si + 2]; cel[di + 3] = f.data[si + 3]
            }
          }
        }
        const after = cloneCel(cel)
        let changed = false
        for (let i = 0; i < after.length; i += 4) {
          if (f.originBefore[i] !== after[i] || f.originBefore[i + 1] !== after[i + 1] || f.originBefore[i + 2] !== after[i + 2] || f.originBefore[i + 3] !== after[i + 3]) { changed = true; break }
        }
        if (changed) {
          get().pushHistory({ kind: 'pixels', label: 'Move', frameId: f.frameId, layerId: f.layerId, before: f.originBefore, after })
        }
      }
      set({ floating: null, pixelVersion: get().pixelVersion + 1, dirty: true })
    },
    cutSelection: () => {
      const s = get()
      const sel = s.selection
      if (!sel) return
      if (s.floating) {
        set({ clipboard: { data: cloneCel(s.floating.data), w: s.floating.w, h: s.floating.h }, floating: null, pixelVersion: s.pixelVersion + 1 })
        return
      }
      const layer = s.doc.layers.find((l) => l.id === s.activeLayerId)
      const cel = layer?.cels[s.activeFrameId]
      if (!layer || !cel || layer.locked) return
      set({ clipboard: { data: extractRegion(cel, s.doc.width, s.doc.height, sel), w: sel.w, h: sel.h } })
      const before = cloneCel(cel)
      clearRegion(cel, s.doc.width, s.doc.height, sel)
      get().pushHistory({ kind: 'pixels', label: 'Cut', frameId: s.activeFrameId, layerId: s.activeLayerId, before, after: cloneCel(cel) })
      set({ pixelVersion: s.pixelVersion + 1, dirty: true })
    },
    copySelection: () => {
      const s = get()
      const sel = s.selection
      if (!sel) return
      if (s.floating) {
        set({ clipboard: { data: cloneCel(s.floating.data), w: s.floating.w, h: s.floating.h } })
        return
      }
      const layer = s.doc.layers.find((l) => l.id === s.activeLayerId)
      const cel = layer?.cels[s.activeFrameId]
      if (!cel) return
      set({ clipboard: { data: extractRegion(cel, s.doc.width, s.doc.height, sel), w: sel.w, h: sel.h } })
    },
    pasteClipboard: () => {
      const s = get()
      const cb = s.clipboard
      if (!cb) return
      const layer = s.doc.layers.find((l) => l.id === s.activeLayerId)
      if (!layer || layer.locked || !layer.visible) return
      const cel = layer.cels[s.activeFrameId] ?? createCel(s.doc.width, s.doc.height)
      layer.cels[s.activeFrameId] = cel
      const x = s.selection?.x ?? Math.floor((s.doc.width - cb.w) / 2)
      const y = s.selection?.y ?? Math.floor((s.doc.height - cb.h) / 2)
      set({
        floating: { data: cloneCel(cb.data), w: cb.w, h: cb.h, x, y, originBefore: cloneCel(cel), frameId: s.activeFrameId, layerId: s.activeLayerId },
        selection: { x, y, w: cb.w, h: cb.h },
        pixelVersion: s.pixelVersion + 1,
      })
    },
    deleteSelection: () => {
      const s = get()
      if (s.floating) {
        set({ floating: null, pixelVersion: s.pixelVersion + 1 })
        return
      }
      const sel = s.selection
      if (!sel) return
      const layer = s.doc.layers.find((l) => l.id === s.activeLayerId)
      const cel = layer?.cels[s.activeFrameId]
      if (!layer || !cel || layer.locked) return
      const before = cloneCel(cel)
      clearRegion(cel, s.doc.width, s.doc.height, sel)
      get().pushHistory({ kind: 'pixels', label: 'Clear', frameId: s.activeFrameId, layerId: s.activeLayerId, before, after: cloneCel(cel) })
      set({ pixelVersion: s.pixelVersion + 1, dirty: true })
    },

    // ================= layers =================
    setActiveLayer: (id) => set({ activeLayerId: id }),
    addLayer: () => {
      const s = get()
      const layer = makeLayer(`Layer ${s.doc.layers.length + 1}`, s.doc.width, s.doc.height, s.doc.frames.map((f) => f.id))
      const idx = s.doc.layers.findIndex((l) => l.id === s.activeLayerId)
      const layers = [...s.doc.layers]
      layers.splice(idx + 1, 0, layer)
      set({ doc: { ...s.doc, layers }, activeLayerId: layer.id, structureVersion: s.structureVersion + 1, dirty: true })
    },
    deleteLayer: (id) => {
      const s = get()
      if (s.doc.layers.length <= 1) return
      snapDoc('Delete layer', (d) => {
        d.layers = d.layers.filter((l) => l.id !== id)
      })
      const st = get()
      if (!st.doc.layers.find((l) => l.id === st.activeLayerId)) {
        set({ activeLayerId: st.doc.layers[st.doc.layers.length - 1].id })
      }
    },
    duplicateLayer: (id) => {
      const s = get()
      const layer = s.doc.layers.find((l) => l.id === id)
      if (!layer) return
      const copy: Layer = {
        ...layer, id: uid('l'), name: `${layer.name} copy`,
        cels: Object.fromEntries(Object.entries(layer.cels).map(([k, v]) => [k, v ? cloneCel(v) : null])),
      }
      const idx = s.doc.layers.findIndex((l) => l.id === id)
      const layers = [...s.doc.layers]
      layers.splice(idx + 1, 0, copy)
      set({ doc: { ...s.doc, layers }, activeLayerId: copy.id, structureVersion: s.structureVersion + 1, dirty: true })
    },
    mergeDown: (id) => {
      const s = get()
      const idx = s.doc.layers.findIndex((l) => l.id === id)
      if (idx <= 0) return
      const top = s.doc.layers[idx], bottom = s.doc.layers[idx - 1]
      snapDoc('Merge down', (d) => {
        const t = d.layers[idx], b = d.layers[idx - 1]
        for (const f of d.frames) {
          const tc = t.cels[f.id]
          const bc = b.cels[f.id] ?? createCel(d.width, d.height)
          if (tc) {
            for (let i = 0; i < bc.length; i += 4) {
              const sa = (tc[i + 3] / 255) * t.opacity
              if (sa <= 0) continue
              const da = bc[i + 3] / 255
              const ao = sa + da * (1 - sa)
              if (ao <= 0) { bc[i] = bc[i + 1] = bc[i + 2] = bc[i + 3] = 0; continue }
              bc[i] = (tc[i] * sa + bc[i] * da * (1 - sa)) / ao
              bc[i + 1] = (tc[i + 1] * sa + bc[i + 1] * da * (1 - sa)) / ao
              bc[i + 2] = (tc[i + 2] * sa + bc[i + 2] * da * (1 - sa)) / ao
              bc[i + 3] = ao * 255
            }
          }
          b.cels[f.id] = bc
        }
        b.visible = bottom.visible || top.visible
        d.layers = d.layers.filter((l) => l.id !== id)
      })
      set({ activeLayerId: get().doc.layers[Math.max(0, idx - 1)].id })
    },
    moveLayer: (id, dir) => {
      const s = get()
      const idx = s.doc.layers.findIndex((l) => l.id === id)
      const to = idx + dir
      if (idx < 0 || to < 0 || to >= s.doc.layers.length) return
      const layers = [...s.doc.layers]
      const [l] = layers.splice(idx, 1)
      layers.splice(to, 0, l)
      set({ doc: { ...s.doc, layers }, structureVersion: s.structureVersion + 1, dirty: true })
    },
    updateLayer: (id, patch) => {
      const s = get()
      const layers = s.doc.layers.map((l) => (l.id === id ? { ...l, ...patch } : l))
      const affectsComposite = patch.opacity !== undefined || patch.visible !== undefined
      set({
        doc: { ...s.doc, layers },
        structureVersion: s.structureVersion + 1,
        pixelVersion: affectsComposite ? s.pixelVersion + 1 : s.pixelVersion,
        dirty: true,
      })
    },
    clearLayer: () => {
      const s = get()
      const layer = s.doc.layers.find((l) => l.id === s.activeLayerId)
      if (!layer || layer.locked) return
      const cel = layer.cels[s.activeFrameId]
      if (!cel) return
      const before = cloneCel(cel)
      layer.cels[s.activeFrameId] = createCel(s.doc.width, s.doc.height)
      get().pushHistory({ kind: 'pixels', label: 'Clear layer', frameId: s.activeFrameId, layerId: s.activeLayerId, before, after: createCel(s.doc.width, s.doc.height) })
      set({ pixelVersion: s.pixelVersion + 1, dirty: true })
    },

    // ================= frames =================
    setActiveFrame: (id) => {
      if (get().floating) get().commitFloating()
      set({ activeFrameId: id, pixelVersion: get().pixelVersion + 1 })
    },
    addFrame: (copyContent) => {
      const s = get()
      snapDoc('New frame', (d) => {
        const idx = d.frames.findIndex((f) => f.id === s.activeFrameId)
        const f = makeFrame(s.doc.frames[idx]?.durationMs ?? 120)
        d.frames.splice(idx + 1, 0, f)
        for (const l of d.layers) {
          const src = l.cels[s.activeFrameId]
          l.cels[f.id] = copyContent && src ? cloneCel(src) : null
        }
        set({ activeFrameId: f.id })
      })
    },
    deleteFrame: (id) => {
      const s = get()
      if (s.doc.frames.length <= 1) return
      snapDoc('Delete frame', (d) => {
        d.frames = d.frames.filter((f) => f.id !== id)
        for (const l of d.layers) delete l.cels[id]
      })
      if (!get().doc.frames.find((f) => f.id === get().activeFrameId)) {
        set({ activeFrameId: get().doc.frames[0].id })
      }
    },
    moveFrame: (id, dir) => {
      const s = get()
      const idx = s.doc.frames.findIndex((f) => f.id === id)
      const to = idx + dir
      if (idx < 0 || to < 0 || to >= s.doc.frames.length) return
      const frames = [...s.doc.frames]
      const [f] = frames.splice(idx, 1)
      frames.splice(to, 0, f)
      set({ doc: { ...s.doc, frames }, structureVersion: s.structureVersion + 1, dirty: true })
    },
    updateFrame: (id, patch) => {
      const s = get()
      set({ doc: { ...s.doc, frames: s.doc.frames.map((f) => (f.id === id ? { ...f, ...patch } : f)) }, structureVersion: s.structureVersion + 1, dirty: true })
    },

    // ================= transforms & ops =================
    flip: (horizontal) => {
      const s = get()
      if (s.floating) {
        const f = s.floating
        const data = horizontal ? flipH(f.data, f.w, f.h) : flipV(f.data, f.w, f.h)
        set({ floating: { ...f, data }, pixelVersion: s.pixelVersion + 1 })
        return
      }
      const layer = s.doc.layers.find((l) => l.id === s.activeLayerId)
      const cel = layer?.cels[s.activeFrameId]
      if (!layer || !cel || layer.locked) return
      const before = cloneCel(cel)
      const sel = s.selection
      if (sel) {
        const region = extractRegion(cel, s.doc.width, s.doc.height, sel)
        const flipped = horizontal ? flipH(region, sel.w, sel.h) : flipV(region, sel.w, sel.h)
        clearRegion(cel, s.doc.width, s.doc.height, sel)
        for (let y = 0; y < sel.h; y++) for (let x = 0; x < sel.w; x++) {
          const si = (y * sel.w + x) * 4, di = ((sel.y + y) * s.doc.width + (sel.x + x)) * 4
          cel[di] = flipped[si]; cel[di + 1] = flipped[si + 1]; cel[di + 2] = flipped[si + 2]; cel[di + 3] = flipped[si + 3]
        }
      } else {
        layer.cels[s.activeFrameId] = horizontal ? flipH(cel, s.doc.width, s.doc.height) : flipV(cel, s.doc.width, s.doc.height)
      }
      get().pushHistory({
        kind: 'pixels', label: horizontal ? 'Flip H' : 'Flip V', frameId: s.activeFrameId, layerId: s.activeLayerId,
        before, after: cloneCel(layer.cels[s.activeFrameId] as Uint8ClampedArray),
      })
      set({ pixelVersion: s.pixelVersion + 1, dirty: true })
    },

    rotate: () => {
      const s = get()
      if (s.floating) {
        const f = s.floating
        const r = rotate90CW(f.data, f.w, f.h)
        set({ floating: { ...f, data: r.data, w: r.w, h: r.h }, pixelVersion: s.pixelVersion + 1 })
        return
      }
      if (s.selection) {
        const layer = s.doc.layers.find((l) => l.id === s.activeLayerId)
        const cel = layer?.cels[s.activeFrameId]
        if (!layer || !cel || layer.locked) return
        const sel = s.selection
        const before = cloneCel(cel)
        const region = extractRegion(cel, s.doc.width, s.doc.height, sel)
        const r = rotate90CW(region, sel.w, sel.h)
        clearRegion(cel, s.doc.width, s.doc.height, sel)
        const newX = Math.max(0, Math.min(s.doc.width - r.w, sel.x))
        const newY = Math.max(0, Math.min(s.doc.height - r.h, sel.y))
        for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
          const si = (y * r.w + x) * 4, di = ((newY + y) * s.doc.width + (newX + x)) * 4
          cel[di] = r.data[si]; cel[di + 1] = r.data[si + 1]; cel[di + 2] = r.data[si + 2]; cel[di + 3] = r.data[si + 3]
        }
        get().pushHistory({ kind: 'pixels', label: 'Rotate 90°', frameId: s.activeFrameId, layerId: s.activeLayerId, before, after: cloneCel(cel) })
        set({ pixelVersion: s.pixelVersion + 1, dirty: true })
        return
      }
      // rotate whole document
      snapDoc('Rotate 90°', (d) => {
        const ow = d.width, oh = d.height
        for (const layer of d.layers) {
          for (const fid of Object.keys(layer.cels)) {
            const cel = layer.cels[fid]
            if (!cel) continue
            const rr = rotate90CW(cel, ow, oh)
            layer.cels[fid] = rr.data
          }
        }
        d.width = oh; d.height = ow
      })
      get().fitToViewport()
    },

    addOutline: () => {
      const s = get()
      const layer = s.doc.layers.find((l) => l.id === s.activeLayerId)
      const cel = layer?.cels[s.activeFrameId]
      if (!layer || !cel || layer.locked) return
      const before = cloneCel(cel)
      outlineCel(cel, s.doc.width, s.doc.height, hexToRgba(s.primary))
      get().pushHistory({ kind: 'pixels', label: 'Outline', frameId: s.activeFrameId, layerId: s.activeLayerId, before, after: cloneCel(cel) })
      set({ pixelVersion: s.pixelVersion + 1, dirty: true })
    },

    quantizeActiveLayer: (n) => {
      const s = get()
      const layer = s.doc.layers.find((l) => l.id === s.activeLayerId)
      const cel = layer?.cels[s.activeFrameId]
      if (!layer || !cel || layer.locked) return
      const before = cloneCel(cel)
      const q = quantizeLocal(cel, n)
      layer.cels[s.activeFrameId] = q.data
      get().pushHistory({ kind: 'pixels', label: `Reduce to ${n} colors`, frameId: s.activeFrameId, layerId: s.activeLayerId, before, after: cloneCel(q.data) })
      if (q.palette.length > 0) {
        const merged = [...new Set([...q.palette, ...s.doc.palette])]
        set({ doc: { ...get().doc, palette: merged.slice(0, 256) }, structureVersion: get().structureVersion + 1 })
      }
      set({ pixelVersion: get().pixelVersion + 1, dirty: true })
    },

    importImageIntoDoc: (data, w, h, mode) => {
      const s = get()
      if (mode === 'replace-layer') {
        const layer = s.doc.layers.find((l) => l.id === s.activeLayerId)
        if (!layer || layer.locked) return
        const cel = layer.cels[s.activeFrameId] ?? createCel(s.doc.width, s.doc.height)
        const before = cloneCel(cel)
        const nw = Math.min(s.doc.width, w), nh = Math.min(s.doc.height, h)
        for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
          const si = (y * w + x) * 4, di = (y * s.doc.width + x) * 4
          cel[di] = data[si]; cel[di + 1] = data[si + 1]; cel[di + 2] = data[si + 2]; cel[di + 3] = data[si + 3]
        }
        get().pushHistory({ kind: 'pixels', label: 'Import image', frameId: s.activeFrameId, layerId: s.activeLayerId, before, after: cloneCel(cel) })
        set({ pixelVersion: s.pixelVersion + 1, dirty: true })
        return
      }
      // new layer sized to doc, image drawn centered/fit
      const layer = makeLayer(`Imported ${new Date().toLocaleTimeString()}`, s.doc.width, s.doc.height, [s.activeFrameId])
      const cel = createCel(s.doc.width, s.doc.height)
      const scale = Math.min(s.doc.width / w, s.doc.height / h, 1)
      const dw = Math.max(1, Math.round(w * scale)), dh = Math.max(1, Math.round(h * scale))
      const ox = Math.floor((s.doc.width - dw) / 2), oy = Math.floor((s.doc.height - dh) / 2)
      for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
        const sx = Math.floor(x / scale), sy = Math.floor(y / scale)
        const si = (sy * w + sx) * 4, di = ((oy + y) * s.doc.width + (ox + x)) * 4
        cel[di] = data[si]; cel[di + 1] = data[si + 1]; cel[di + 2] = data[si + 2]; cel[di + 3] = data[si + 3]
      }
      layer.cels[s.activeFrameId] = cel
      const idx = s.doc.layers.findIndex((l) => l.id === s.activeLayerId)
      const layers = [...s.doc.layers]
      layers.splice(idx + 1, 0, layer)
      set({ doc: { ...s.doc, layers }, activeLayerId: layer.id, structureVersion: s.structureVersion + 1, pixelVersion: s.pixelVersion + 1, dirty: true })
    },

    // ================= palette =================
    setDocPalette: (colors) => {
      set({ doc: { ...get().doc, palette: colors.slice(0, 256) }, structureVersion: get().structureVersion + 1, dirty: true })
    },
    addPaletteColor: (hex) => {
      const s = get()
      const c = hex.toUpperCase()
      if (s.doc.palette.includes(c) || s.doc.palette.length >= 256) return
      set({ doc: { ...s.doc, palette: [...s.doc.palette, c] }, structureVersion: s.structureVersion + 1, dirty: true })
    },
    removePaletteColor: (hex) => {
      const s = get()
      set({ doc: { ...s.doc, palette: s.doc.palette.filter((c) => c !== hex.toUpperCase()) }, structureVersion: s.structureVersion + 1, dirty: true })
    },

    // ================= history =================
    undo: () => {
      const s = get()
      const entry = s.undoStack[s.undoStack.length - 1]
      if (!entry) return
      const undoStack = s.undoStack.slice(0, -1)
      if (entry.kind === 'pixels') {
        const layer = s.doc.layers.find((l) => l.id === entry.layerId)
        if (layer) layer.cels[entry.frameId] = cloneCel(entry.before)
        set({ undoStack, redoStack: [...s.redoStack, entry], pixelVersion: s.pixelVersion + 1, dirty: true })
      } else {
        const d = cloneDoc(entry.before)
        const activeLayerOk = d.layers.find((l) => l.id === s.activeLayerId)
        const activeFrameOk = d.frames.find((f) => f.id === s.activeFrameId)
        set({
          doc: d, undoStack, redoStack: [...s.redoStack, entry],
          activeLayerId: activeLayerOk ? s.activeLayerId : d.layers[d.layers.length - 1].id,
          activeFrameId: activeFrameOk ? s.activeFrameId : d.frames[0].id,
          structureVersion: s.structureVersion + 1, pixelVersion: s.pixelVersion + 1, dirty: true,
          selection: null, floating: null,
        })
      }
    },

    redo: () => {
      const s = get()
      const entry = s.redoStack[s.redoStack.length - 1]
      if (!entry) return
      const redoStack = s.redoStack.slice(0, -1)
      if (entry.kind === 'pixels') {
        const layer = s.doc.layers.find((l) => l.id === entry.layerId)
        if (layer) layer.cels[entry.frameId] = cloneCel(entry.after)
        set({ redoStack, undoStack: [...s.undoStack, entry], pixelVersion: s.pixelVersion + 1, dirty: true })
      } else {
        const d = cloneDoc(entry.after)
        const activeLayerOk = d.layers.find((l) => l.id === s.activeLayerId)
        const activeFrameOk = d.frames.find((f) => f.id === s.activeFrameId)
        set({
          doc: d, redoStack, undoStack: [...s.undoStack, entry],
          activeLayerId: activeLayerOk ? s.activeLayerId : d.layers[d.layers.length - 1].id,
          activeFrameId: activeFrameOk ? s.activeFrameId : d.frames[0].id,
          structureVersion: s.structureVersion + 1, pixelVersion: s.pixelVersion + 1, dirty: true,
          selection: null, floating: null,
        })
      }
    },

    pushHistory: (entry) => {
      const s = get()
      const bytes = entry.kind === 'pixels' ? entry.before.length * 2 : estimateDocBytes(entry.before)
      let undoStack = [...s.undoStack, entry]
      let historyBytes = s.historyBytes + bytes
      while (historyBytes > HISTORY_MAX_BYTES || undoStack.length > HISTORY_MAX_ENTRIES) {
        const removed = undoStack.shift()
        if (!removed) break
        historyBytes -= removed.kind === 'pixels' ? removed.before.length * 2 : estimateDocBytes(removed.before)
      }
      set({ undoStack, redoStack: [], historyBytes })
    },
  }
})

// local import to avoid circular usage noise
import { quantize as quantizeLocal } from './engine'

function estimateDocBytes(doc: PFDocument): number {
  let bytes = 0
  for (const l of doc.layers) for (const cel of Object.values(l.cels)) if (cel) bytes += cel.length
  return bytes
}

function patternOk(pattern: string, x: number, y: number): boolean {
  switch (pattern) {
    case 'dither50': return (x + y) % 2 === 0
    case 'dither25': return x % 2 === 0 && y % 2 === 0
    case 'dither75': return !(x % 2 === 0 && y % 2 === 0)
    default: return true
  }
}

export { setStore as _setEditorStore, getStore as _getEditorStore }
