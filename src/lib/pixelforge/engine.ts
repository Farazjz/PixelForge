// PixelForge AI — Pixel engine: pure functions over RGBA cels.
// A "cel" is a flat Uint8ClampedArray of length w*h*4 (straight alpha).

import type { PFDocument, Rect } from './types'

export type RGBA = [number, number, number, number]

export const createCel = (w: number, h: number): Uint8ClampedArray => new Uint8ClampedArray(w * h * 4)
export const cloneCel = (c: Uint8ClampedArray): Uint8ClampedArray => new Uint8ClampedArray(c)

export function hexToRgba(hex: string): RGBA {
  let s = hex.trim().replace('#', '')
  if (s.length === 3) s = s.split('').map((c) => c + c).join('')
  if (s.length === 8) {
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), parseInt(s.slice(6, 8), 16)]
  }
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), 255]
}

export function rgbaToHex(r: number, g: number, b: number, a = 255, keepAlpha = false): string {
  const h = (n: number) => n.toString(16).padStart(2, '0').toUpperCase()
  return `#${h(r)}${h(g)}${h(b)}${keepAlpha ? h(a) : ''}`
}

export function getPixel(cel: Uint8ClampedArray, w: number, x: number, y: number, out: RGBA): RGBA {
  const i = (y * w + x) * 4
  out[0] = cel[i]; out[1] = cel[i + 1]; out[2] = cel[i + 2]; out[3] = cel[i + 3]
  return out
}

export function isOpaque(cel: Uint8ClampedArray, w: number, h: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= w || y >= h) return false
  return cel[(y * w + x) * 4 + 3] > 0
}

// ---------------- primitives ----------------

export interface PaintOpts {
  pattern?: 'solid' | 'dither50' | 'dither25' | 'dither75'
  clip?: Rect | null
}

export function patternAllows(pattern: string | undefined, x: number, y: number): boolean {
  switch (pattern) {
    case 'dither50': return (x + y) % 2 === 0
    case 'dither25': return x % 2 === 0 && y % 2 === 0
    case 'dither75': return !(x % 2 === 0 && y % 2 === 0)
    default: return true
  }
}

/** Core pixel writer honoring pattern + optional selection clip. Returns true if written. */
export function writePixel(
  cel: Uint8ClampedArray, w: number, h: number, x: number, y: number, rgba: RGBA, opts?: PaintOpts
): boolean {
  if (x < 0 || y < 0 || x >= w || y >= h) return false
  const clip = opts?.clip
  if (clip && (x < clip.x || y < clip.y || x >= clip.x + clip.w || y >= clip.y + clip.h)) return false
  if (!patternAllows(opts?.pattern, x, y)) return false
  const i = (y * w + x) * 4
  cel[i] = rgba[0]; cel[i + 1] = rgba[1]; cel[i + 2] = rgba[2]; cel[i + 3] = rgba[3]
  return true
}

/** Bresenham line, calls set(x,y) for each pixel. */
export function linePoints(x0: number, y0: number, x1: number, y1: number, set: (x: number, y: number) => void): void {
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  let x = x0, y = y0
  for (;;) {
    set(x, y)
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 > -dy) { err -= dy; x += sx }
    if (e2 < dx) { err += dx; y += sy }
  }
}

export function drawLine(
  cel: Uint8ClampedArray, w: number, h: number,
  x0: number, y0: number, x1: number, y1: number, rgba: RGBA, opts?: PaintOpts
): void {
  linePoints(x0, y0, x1, y1, (x, y) => writePixel(cel, w, h, x, y, rgba, opts))
}

export function drawRect(
  cel: Uint8ClampedArray, w: number, h: number,
  x0: number, y0: number, x1: number, y1: number, rgba: RGBA, filled: boolean, opts?: PaintOpts
): void {
  const lx = Math.min(x0, x1), rx = Math.max(x0, x1)
  const ty = Math.min(y0, y1), by = Math.max(y0, y1)
  if (filled) {
    for (let y = ty; y <= by; y++) for (let x = lx; x <= rx; x++) writePixel(cel, w, h, x, y, rgba, opts)
  } else {
    for (let x = lx; x <= rx; x++) { writePixel(cel, w, h, x, ty, rgba, opts); writePixel(cel, w, h, x, by, rgba, opts) }
    for (let y = ty; y <= by; y++) { writePixel(cel, w, h, lx, y, rgba, opts); writePixel(cel, w, h, rx, y, rgba, opts) }
  }
}

function inEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number): boolean {
  const nx = (x - cx) / rx, ny = (y - cy) / ry
  return nx * nx + ny * ny <= 1
}

export function drawEllipse(
  cel: Uint8ClampedArray, w: number, h: number,
  x0: number, y0: number, x1: number, y1: number, rgba: RGBA, filled: boolean, opts?: PaintOpts
): void {
  const lx = Math.min(x0, x1), rx = Math.max(x0, x1)
  const ty = Math.min(y0, y1), by = Math.max(y0, y1)
  const cx = (lx + rx) / 2, cy = (ty + by) / 2
  const radx = (rx - lx) / 2, rady = (by - ty) / 2
  if (radx <= 0 || rady <= 0) { drawRect(cel, w, h, x0, y0, x1, y1, rgba, filled, opts); return }
  for (let y = ty; y <= by; y++) {
    for (let x = lx; x <= rx; x++) {
      if (!inEllipse(x, y, cx, cy, radx, rady)) continue
      if (filled) { writePixel(cel, w, h, x, y, rgba, opts); continue }
      const edge = !inEllipse(x - 1, y, cx, cy, radx, rady) || !inEllipse(x + 1, y, cx, cy, radx, rady) ||
        !inEllipse(x, y - 1, cx, cy, radx, rady) || !inEllipse(x, y + 1, cx, cy, radx, rady)
      if (edge) writePixel(cel, w, h, x, y, rgba, opts)
    }
  }
}

/** Flood fill (4-connected). match/maxDiff per channel. */
export function floodFill(
  cel: Uint8ClampedArray, w: number, h: number,
  sx: number, sy: number, rgba: RGBA, tolerance = 0, clip?: Rect | null
): number {
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return 0
  const start = (sy * w + sx) * 4
  const target: RGBA = [cel[start], cel[start + 1], cel[start + 2], cel[start + 3]]
  if (colorsEqual(target, rgba) && tolerance === 0) return 0
  const match = (x: number, y: number): boolean => {
    const i = (y * w + x) * 4
    return Math.abs(cel[i] - target[0]) <= tolerance &&
      Math.abs(cel[i + 1] - target[1]) <= tolerance &&
      Math.abs(cel[i + 2] - target[2]) <= tolerance &&
      Math.abs(cel[i + 3] - target[3]) <= tolerance
  }
  let count = 0
  const stack: number[] = [sx, sy]
  const inClip = (x: number, y: number): boolean => {
    if (!clip) return true
    return x >= clip.x && y >= clip.y && x < clip.x + clip.w && y < clip.y + clip.h
  }
  const visited = new Uint8Array(w * h)
  while (stack.length) {
    const y = stack.pop() as number
    const x = stack.pop() as number
    if (x < 0 || y < 0 || x >= w || y >= h) continue
    const vi = y * w + x
    if (visited[vi]) continue
    if (!match(x, y)) continue
    if (!inClip(x, y)) continue
    visited[vi] = 1
    const i = vi * 4
    cel[i] = rgba[0]; cel[i + 1] = rgba[1]; cel[i + 2] = rgba[2]; cel[i + 3] = rgba[3]
    count++
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1)
  }
  return count
}

/** Replace all pixels matching `from` with `to` across the cel. */
export function replaceColor(
  cel: Uint8ClampedArray, w: number, h: number, from: RGBA, to: RGBA, tolerance = 0, clip?: Rect | null
): number {
  let count = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (clip && (x < clip.x || y < clip.y || x >= clip.x + clip.w || y >= clip.y + clip.h)) continue
      const i = (y * w + x) * 4
      if (Math.abs(cel[i] - from[0]) <= tolerance && Math.abs(cel[i + 1] - from[1]) <= tolerance &&
        Math.abs(cel[i + 2] - from[2]) <= tolerance && Math.abs(cel[i + 3] - from[3]) <= tolerance) {
        cel[i] = to[0]; cel[i + 1] = to[1]; cel[i + 2] = to[2]; cel[i + 3] = to[3]
        count++
      }
    }
  }
  return count
}

export function colorsEqual(a: RGBA, b: RGBA): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]
}

// ---------------- transforms ----------------

export function flipH(cel: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = createCel(w, h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = (y * w + x) * 4, di = (y * w + (w - 1 - x)) * 4
    out[di] = cel[si]; out[di + 1] = cel[si + 1]; out[di + 2] = cel[si + 2]; out[di + 3] = cel[si + 3]
  }
  return out
}

export function flipV(cel: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = createCel(w, h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = (y * w + x) * 4, di = ((h - 1 - y) * w + x) * 4
    out[di] = cel[si]; out[di + 1] = cel[si + 1]; out[di + 2] = cel[si + 2]; out[di + 3] = cel[si + 3]
  }
  return out
}

export function rotate90CW(cel: Uint8ClampedArray, w: number, h: number): { data: Uint8ClampedArray; w: number; h: number } {
  const out = createCel(h, w)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = (y * w + x) * 4, di = (x * h + (h - 1 - y)) * 4
    out[di] = cel[si]; out[di + 1] = cel[si + 1]; out[di + 2] = cel[si + 2]; out[di + 3] = cel[si + 3]
  }
  return { data: out, w: h, h: w }
}

/** Extract sub-region as a new cel. */
export function extractRegion(cel: Uint8ClampedArray, w: number, h: number, r: Rect): Uint8ClampedArray {
  const out = createCel(r.w, r.h)
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const sx = r.x + x, sy = r.y + y
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue
      const si = (sy * w + sx) * 4, di = (y * r.w + x) * 4
      out[di] = cel[si]; out[di + 1] = cel[si + 1]; out[di + 2] = cel[si + 2]; out[di + 3] = cel[si + 3]
    }
  }
  return out
}

export function clearRegion(cel: Uint8ClampedArray, w: number, h: number, r: Rect): void {
  for (let y = Math.max(0, r.y); y < Math.min(h, r.y + r.h); y++) {
    for (let x = Math.max(0, r.x); x < Math.min(w, r.x + r.w); x++) {
      const i = (y * w + x) * 4
      cel[i] = 0; cel[i + 1] = 0; cel[i + 2] = 0; cel[i + 3] = 0
    }
  }
}

export function computeBBox(cel: Uint8ClampedArray, w: number, h: number): Rect | null {
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (cel[(y * w + x) * 4 + 3] > 0) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/** 1px outline around opaque pixels using `color`. Only fills transparent neighbors of opaque pixels. */
export function outlineCel(cel: Uint8ClampedArray, w: number, h: number, color: RGBA): void {
  const marks: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (cel[i + 3] > 0) continue
      const neighborOpaque =
        isOpaque(cel, w, h, x - 1, y) || isOpaque(cel, w, h, x + 1, y) ||
        isOpaque(cel, w, h, x, y - 1) || isOpaque(cel, w, h, x, y + 1)
      if (neighborOpaque) marks.push(i)
    }
  }
  for (const i of marks) { cel[i] = color[0]; cel[i + 1] = color[1]; cel[i + 2] = color[2]; cel[i + 3] = 255 }
}

// ---------------- compositing ----------------

/** Composite all visible layers of a frame into one RGBA buffer. */
export function compositeFrame(doc: PFDocument, frameId: string): Uint8ClampedArray {
  const { width: w, height: h } = doc
  const out = createCel(w, h)
  for (const layer of doc.layers) {
    if (!layer.visible) continue
    const cel = layer.cels[frameId]
    if (!cel) continue
    const alpha = layer.opacity
    for (let i = 0; i < out.length; i += 4) {
      const sa = (cel[i + 3] / 255) * alpha
      if (sa <= 0) continue
      const da = out[i + 3] / 255
      const ao = sa + da * (1 - sa)
      if (ao <= 0) { out[i] = out[i + 1] = out[i + 2] = out[i + 3] = 0; continue }
      out[i] = (cel[i] * sa + out[i] * da * (1 - sa)) / ao
      out[i + 1] = (cel[i + 1] * sa + out[i + 1] * da * (1 - sa)) / ao
      out[i + 2] = (cel[i + 2] * sa + out[i + 2] * da * (1 - sa)) / ao
      out[i + 3] = ao * 255
    }
  }
  return out
}

/** Render a composite/cel onto a canvas element (used for thumbnails & exports). */
export function celToCanvas(data: Uint8ClampedArray, w: number, h: number, canvas?: HTMLCanvasElement): HTMLCanvasElement {
  const c = canvas ?? document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')!
  const img = new ImageData(new Uint8ClampedArray(data), w, h)
  ctx.putImageData(img, 0, 0)
  return c
}

export function renderCompositeToCanvas(doc: PFDocument, frameId: string, canvas: HTMLCanvasElement): void {
  canvas.width = doc.width; canvas.height = doc.height
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, doc.width, doc.height)
  for (const layer of doc.layers) {
    if (!layer.visible) continue
    const cel = layer.cels[frameId]
    if (!cel) continue
    const tmp = celToCanvas(cel, doc.width, doc.height)
    ctx.globalAlpha = layer.opacity
    ctx.drawImage(tmp, 0, 0)
  }
  ctx.globalAlpha = 1
}

// ---------------- scaling ----------------

/** Nearest-neighbor scale by integer factor. */
export function nearestScale(cel: Uint8ClampedArray, w: number, h: number, factor: number): { data: Uint8ClampedArray; w: number; h: number } {
  const ow = Math.max(1, Math.round(w * factor)), oh = Math.max(1, Math.round(h * factor))
  return nearestResizeTo(cel, w, h, ow, oh)
}

/** Nearest-neighbor resize to arbitrary dimensions. */
export function nearestResizeTo(cel: Uint8ClampedArray, w: number, h: number, tw: number, th: number): { data: Uint8ClampedArray; w: number; h: number } {
  const out = createCel(tw, th)
  for (let y = 0; y < th; y++) {
    const sy = Math.min(h - 1, Math.floor((y * h) / th))
    for (let x = 0; x < tw; x++) {
      const sx = Math.min(w - 1, Math.floor((x * w) / tw))
      const si = (sy * w + sx) * 4, di = (y * tw + x) * 4
      out[di] = cel[si]; out[di + 1] = cel[si + 1]; out[di + 2] = cel[si + 2]; out[di + 3] = cel[si + 3]
    }
  }
  return { data: out, w: tw, h: th }
}

// ---------------- color processing (AI pipeline) ----------------

interface Box { pixels: number[][]; }

function boxSplit(box: Box): [Box, Box] | null {
  if (box.pixels.length < 2) return null
  // widest channel
  let min = [255, 255, 255], max = [0, 0, 0]
  for (const p of box.pixels) for (let c = 0; c < 3; c++) { if (p[c] < min[c]) min[c] = p[c]; if (p[c] > max[c]) max[c] = p[c] }
  const ranges = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
  const ch = ranges.indexOf(Math.max(...ranges))
  if (ranges[ch] === 0) return null
  const sorted = [...box.pixels].sort((a, b) => a[ch] - b[ch])
  const mid = Math.floor(sorted.length / 2)
  return [{ pixels: sorted.slice(0, mid) }, { pixels: sorted.slice(mid) }]
}

function boxAverage(pixels: number[][]): [number, number, number] {
  let r = 0, g = 0, b = 0
  for (const p of pixels) { r += p[0]; g += p[1]; b += p[2] }
  const n = pixels.length
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
}

/** Median-cut quantization to at most `n` colors. Returns new cel + extracted palette (hex). */
export function quantize(cel: Uint8ClampedArray, n: number): { data: Uint8ClampedArray; palette: string[] } {
  const pixels: number[][] = []
  for (let i = 0; i < cel.length; i += 4) {
    if (cel[i + 3] > 8) pixels.push([cel[i], cel[i + 1], cel[i + 2]])
  }
  if (pixels.length === 0) return { data: cloneCel(cel), palette: [] }
  let boxes: Box[] = [{ pixels }]
  while (boxes.length < n) {
    // split the largest box
    boxes.sort((a, b) => b.pixels.length - a.pixels.length)
    let splitDone = false
    for (let bi = 0; bi < boxes.length && !splitDone; bi++) {
      const parts = boxSplit(boxes[bi])
      if (parts) { boxes.splice(bi, 1, parts[0], parts[1]); splitDone = true }
    }
    if (!splitDone) break
  }
  const paletteRGB = boxes.filter((b) => b.pixels.length > 0).map((b) => boxAverage(b.pixels))
  const palette = paletteRGB.map(([r, g, b]) => rgbaToHex(r, g, b))
  const data = cloneCel(cel)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] <= 8) { data[i + 3] = 0; continue }
    let best = 0, bestDist = Infinity
    for (let pi = 0; pi < paletteRGB.length; pi++) {
      const [r, g, b] = paletteRGB[pi]
      const d = (data[i] - r) ** 2 + (data[i + 1] - g) ** 2 + (data[i + 2] - b) ** 2
      if (d < bestDist) { bestDist = d; best = pi }
    }
    const [r, g, b] = paletteRGB[best]
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255
  }
  return { data, palette }
}

/** Remove background: flood transparent from borders over colors similar to border/corner colors. */
export function removeBackground(cel: Uint8ClampedArray, w: number, h: number, tolerance = 32): void {
  if (w === 0 || h === 0) return
  const corners: RGBA[] = []
  const cs = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]
  for (const [cx, cy] of cs) {
    const i = (cy * w + cx) * 4
    corners.push([cel[i], cel[i + 1], cel[i + 2], cel[i + 3]])
  }
  const matchesCorner = (i: number): boolean => {
    for (const c of corners) {
      if (Math.abs(cel[i] - c[0]) <= tolerance && Math.abs(cel[i + 1] - c[1]) <= tolerance &&
        Math.abs(cel[i + 2] - c[2]) <= tolerance && Math.abs(cel[i + 3] - c[3]) <= tolerance) return true
    }
    return false
  }
  const visited = new Uint8Array(w * h)
  const stack: number[] = []
  for (let x = 0; x < w; x++) { stack.push(x, 0, x, h - 1) }
  for (let y = 0; y < h; y++) { stack.push(0, y, w - 1, y) }
  while (stack.length) {
    const y = stack.pop() as number, x = stack.pop() as number
    if (x < 0 || y < 0 || x >= w || y >= h) continue
    const vi = y * w + x
    if (visited[vi]) continue
    const i = vi * 4
    if (cel[i + 3] === 0) { visited[vi] = 1; continue }
    if (!matchesCorner(i)) continue
    visited[vi] = 1
    cel[i] = 0; cel[i + 1] = 0; cel[i + 2] = 0; cel[i + 3] = 0
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1)
  }
}

/** Apply from->to color replacements. */
export function applyColorMap(cel: Uint8ClampedArray, map: { from: string; to: string }[]): void {
  if (map.length === 0) return
  const froms = map.map((m) => hexToRgba(m.from))
  const tos = map.map((m) => hexToRgba(m.to))
  for (let i = 0; i < cel.length; i += 4) {
    for (let k = 0; k < froms.length; k++) {
      const f = froms[k]
      if (cel[i] === f[0] && cel[i + 1] === f[1] && cel[i + 2] === f[2] && (f[3] === 255 ? cel[i + 3] === 255 : true)) {
        const t = tos[k]
        cel[i] = t[0]; cel[i + 1] = t[1]; cel[i + 2] = t[2]; cel[i + 3] = t[3]
        break
      }
    }
  }
}

/** Rasterize text (hard alpha threshold, no antialiasing gradient) into a cel. */
export function rasterizeText(
  w: number, h: number, text: string, font: string, sizePx: number, x: number, y: number, rgba: RGBA
): { data: Uint8ClampedArray; bbox: Rect | null } {
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const ctx = cv.getContext('2d')!
  ctx.font = `${sizePx}px ${font}`
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'top'
  ctx.fillText(text, x, y)
  const img = ctx.getImageData(0, 0, w, h)
  const out = createCel(w, h)
  for (let i = 0; i < out.length; i += 4) {
    if (img.data[i + 3] >= 128) { out[i] = rgba[0]; out[i + 1] = rgba[1]; out[i + 2] = rgba[2]; out[i + 3] = 255 }
  }
  return { data: out, bbox: computeBBox(out, w, h) }
}

// ---------------- canvas helpers ----------------

export function canvasToCel(canvas: HTMLCanvasElement): { data: Uint8ClampedArray; w: number; h: number } {
  const ctx = canvas.getContext('2d')!
  const { width: w, height: h } = canvas
  return { data: ctx.getImageData(0, 0, w, h).data, w, h }
}

/** Load an image from a data URL / object URL. Rejects on failure. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to decode image'))
    img.src = src
  })
}

/** Draw image into a canvas of given size using nearest-neighbor scaling. */
export function imageToCel(img: HTMLImageElement, tw: number, th: number): Uint8ClampedArray {
  const cv = document.createElement('canvas')
  cv.width = tw; cv.height = th
  const ctx = cv.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, 0, 0, tw, th)
  return ctx.getImageData(0, 0, tw, th).data
}

// ---------------- .pfa serialization ----------------

const MAX_DIM = 2048

function bytesToBase64(bytes: Uint8ClampedArray): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as unknown as number[])
  }
  return btoa(binary)
}

function base64ToBytes(b64: string): Uint8ClampedArray {
  const bin = atob(b64)
  const out = new Uint8ClampedArray(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function serializeDoc(doc: PFDocument): string {
  const payload = {
    format: 'pixelforge-ai' as const,
    version: 1 as const,
    name: doc.name,
    width: doc.width,
    height: doc.height,
    background: doc.background,
    frames: doc.frames,
    layers: doc.layers.map((l) => ({
      id: l.id, name: l.name, visible: l.visible, locked: l.locked, opacity: l.opacity,
      cels: Object.fromEntries(
        Object.entries(l.cels).map(([fid, cel]) => [fid, cel ? bytesToBase64(cel) : ''])
      ),
    })),
    palette: doc.palette,
    metadata: doc.metadata,
  }
  return JSON.stringify(payload)
}

export function deserializeDoc(json: string): PFDocument {
  const raw = JSON.parse(json) as {
    format?: string; version?: number; name?: string; width?: number; height?: number
    background?: PFDocument['background']; frames?: PFDocument['frames']
    layers?: { id: string; name: string; visible: boolean; locked: boolean; opacity: number; cels: Record<string, string> }[]
    palette?: string[]; metadata?: PFDocument['metadata']
  }
  if (!raw || (raw.format && raw.format !== 'pixelforge-ai')) throw new Error('Not a PixelForge project file')
  const width = Math.floor(Number(raw.width)), height = Math.floor(Number(raw.height))
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > MAX_DIM || height > MAX_DIM) {
    throw new Error(`Invalid canvas dimensions ${raw.width}x${raw.height} (allowed 1..${MAX_DIM})`)
  }
  const frames = (raw.frames && raw.frames.length > 0 ? raw.frames : [{ id: 'f1', durationMs: 100 }]).map((f) => ({
    id: String(f.id), durationMs: Math.max(10, Math.min(10000, Math.floor(Number(f.durationMs) || 100))),
  }))
  const frameIds = new Set(frames.map((f) => f.id))
  const layers = (raw.layers && raw.layers.length > 0 ? raw.layers : []).map((l) => ({
    id: String(l.id), name: String(l.name || 'Layer'), visible: l.visible !== false, locked: !!l.locked,
    opacity: Math.max(0, Math.min(1, Number(l.opacity) || 0)),
    cels: Object.fromEntries(
      Object.entries(l.cels || {})
        .filter(([fid]) => frameIds.has(fid))
        .map(([fid, b64]) => {
          if (!b64) return [fid, null] as [string, null]
          const bytes = base64ToBytes(b64)
          if (bytes.length !== width * height * 4) throw new Error(`Corrupt layer data in "${l.name}" (size mismatch)`)
          return [fid, bytes] as [string, Uint8ClampedArray]
        })
    ),
  }))
  if (layers.length === 0) {
    layers.push({ id: 'l1', name: 'Background', visible: true, locked: false, opacity: 1, cels: Object.fromEntries(frames.map((f) => [f.id, createCel(width, height)])) })
  }
  return {
    name: String(raw.name || 'Untitled'),
    width, height,
    frames: frames as PFDocument['frames'],
    layers,
    palette: Array.isArray(raw.palette) ? raw.palette.filter((c) => typeof c === 'string').slice(0, 256) : [],
    background: raw.background === 'dark' || raw.background === 'light' ? raw.background : 'checker',
    metadata: raw.metadata || { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  }
}

export const MAX_CANVAS_DIM = MAX_DIM
