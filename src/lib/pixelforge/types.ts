// PixelForge AI — Core type definitions
// Pixel data is stored as flat RGBA Uint8ClampedArray (w * h * 4), straight (non-premultiplied) alpha.

export type ToolId =
  | 'pencil'
  | 'eraser'
  | 'bucket'
  | 'replace'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'eyedropper'
  | 'select'
  | 'move'
  | 'pan'
  | 'text'

export type ToolPattern = 'solid' | 'dither50' | 'dither25' | 'dither75'

export type CanvasBackground = 'checker' | 'dark' | 'light'

export interface Frame {
  id: string
  durationMs: number
}

export interface Layer {
  id: string
  name: string
  visible: boolean
  locked: boolean
  opacity: number // 0..1
  /** cel per frame — null means empty/transparent */
  cels: Record<string, Uint8ClampedArray | null>
}

export interface PFDocument {
  name: string
  width: number
  height: number
  /** playback order */
  frames: Frame[]
  /** bottom -> top order (index 0 = bottom layer) */
  layers: Layer[]
  /** document palette (hex strings) */
  palette: string[]
  background: CanvasBackground
  metadata: {
    createdAt: string
    updatedAt: string
  }
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface FloatingSelection {
  data: Uint8ClampedArray
  w: number
  h: number
  x: number
  y: number
  /** pixel snapshot of the layer taken when the floating was lifted/pasted (for undo) */
  originBefore: Uint8ClampedArray
  frameId: string
  layerId: string
}

export interface ToolOptions {
  pattern: ToolPattern
  shapeFilled: boolean
  tolerance: number // 0..255 flood/replace tolerance
  text: string
  textSize: number
  textFont: 'monospace' | 'sans-serif' | 'serif'
  symmetryH: boolean
  symmetryV: boolean
}

export interface View {
  zoom: number // scale factor: 1 = 100%, max 32 (3200%)
  panX: number
  panY: number
}

export interface ClipboardData {
  data: Uint8ClampedArray
  w: number
  h: number
}

export type HistoryEntry =
  | {
      kind: 'pixels'
      label: string
      frameId: string
      layerId: string
      before: Uint8ClampedArray
      after: Uint8ClampedArray
    }
  | {
      kind: 'doc'
      label: string
      before: PFDocument
      after: PFDocument
    }

export interface LayerSummary {
  id: string
  name: string
  visible: boolean
  locked: boolean
  opacity: number
  isEmpty: boolean
}

// ---------- AI provider contracts (bring-your-own-AI) ----------

export interface AIProfile {
  id: string
  name: string
  kind: 'builtin' | 'custom'
  baseUrl?: string
  apiKey?: string
  textModel?: string
  imageModel?: string
  editModel?: string
  timeoutMs?: number
  maxRetries?: number
  /** raw JSON string of extra headers */
  headers?: string
}

export interface AIProfileStore {
  profiles: AIProfile[]
  activeProfileId: string
  autosaveEnabled: boolean
  defaultGridVisible: boolean
  defaultOnionSkin: boolean
}

export interface GeneratedImage {
  /** png data URL */
  dataUrl: string
  prompt: string
  provider: string
  createdAt: number
  width: number
  height: number
}

export interface GuidedEditSuggestion {
  summary: string
  steps: string[]
  colorMap: { from: string; to: string }[]
}

// ---------- .pfa project file ----------

export interface PFAFile {
  format: 'pixelforge-ai'
  version: 1
  name: string
  width: number
  height: number
  background: CanvasBackground
  frames: Frame[]
  layers: {
    id: string
    name: string
    visible: boolean
    locked: boolean
    opacity: number
    cels: Record<string, string> // frameId -> base64 raw RGBA
  }[]
  palette: string[]
  metadata: PFDocument['metadata']
}
