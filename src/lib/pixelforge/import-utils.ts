// PixelForge AI — image import utilities.
// Pure browser-side helpers for the ImportDialog: file decoding (static images
// + animated GIF), sprite-sheet slicing and cel conversion.
// Framework-free (no 'use client'); uses only standard browser APIs.

import { decompressFrames, parseGIF } from 'gifuct-js'
import type { ParsedFrame } from 'gifuct-js'

import { imageToCel, loadImage } from './engine'

/** A single decoded animation frame (full-canvas RGBA, straight alpha). */
export interface GifFrame {
  data: Uint8ClampedArray
  w: number
  h: number
  delayMs: number
}

/** Result of decoding a static image file. */
export interface DecodedImage {
  img: HTMLImageElement
  w: number
  h: number
}

/** A rectangular cell cut out of a sprite sheet. */
export interface SlicedCell {
  data: Uint8ClampedArray
  w: number
  h: number
}

const SUPPORTED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp', 'image/gif'])
const SUPPORTED_EXT = /\.(png|jpe?g|webp|bmp|gif)$/i

/**
 * Decode a static image file (PNG/JPEG/WebP/BMP/GIF) into an HTMLImageElement.
 * Rejects with a friendly message for unsupported types or corrupt files.
 */
export async function decodeImageFile(file: File): Promise<DecodedImage> {
  const mime = (file.type || '').toLowerCase()
  if (!SUPPORTED_MIME.has(mime) && !SUPPORTED_EXT.test(file.name)) {
    throw new Error(
      `Unsupported file type (${file.type || file.name}). Use PNG, JPEG, WebP, BMP or GIF — or a .pfa project file.`,
    )
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    return {
      img,
      w: img.naturalWidth || img.width,
      h: img.naturalHeight || img.height,
    }
  } catch {
    throw new Error(`Could not decode “${file.name}”. The file may be corrupt or not a real image.`)
  } finally {
    // Safe to revoke: the <img> has fully decoded its bitmap at this point.
    URL.revokeObjectURL(url)
  }
}

/**
 * Decode an animated GIF into full-canvas RGBA frames.
 *
 * gifuct's patches are per-frame diffs over a sub-rectangle; we composite them
 * cumulatively the way a browser does: start from a fully transparent buffer,
 * draw each patch (transparent patch pixels keep the previous content), then
 * apply the frame's disposal: 2 = clear patch rect to transparent, 3 = restore
 * the buffer captured before the frame was drawn.
 */
export async function decodeGifFile(file: File): Promise<GifFrame[]> {
  let buffer: ArrayBuffer
  try {
    buffer = await file.arrayBuffer()
  } catch {
    throw new Error(`Could not read “${file.name}”.`)
  }

  let frames: ParsedFrame[]
  let w: number
  let h: number
  try {
    const gif = parseGIF(buffer)
    frames = decompressFrames(gif, true)
    w = gif.lsd.width
    h = gif.lsd.height
  } catch {
    throw new Error(`Could not parse “${file.name}” as a GIF.`)
  }
  if (w < 1 || h < 1 || frames.length === 0) {
    throw new Error(`“${file.name}” contains no drawable GIF frames.`)
  }

  const full = new Uint8ClampedArray(w * h * 4) // persistent composite buffer
  const out: GifFrame[] = []

  for (const frame of frames) {
    // Disposal 3 restores the state from *before* this frame was drawn.
    const saved = frame.disposalType === 3 ? new Uint8ClampedArray(full) : null

    const { width: pw, height: ph, top, left } = frame.dims
    const patch = frame.patch
    for (let y = 0; y < ph; y++) {
      const fy = top + y
      if (fy < 0 || fy >= h) continue
      for (let x = 0; x < pw; x++) {
        const fx = left + x
        if (fx < 0 || fx >= w) continue
        const si = (y * pw + x) * 4
        // gifuct patch alpha is binary: 0 = keep previous content, 255 = opaque.
        if (patch[si + 3] === 0) continue
        const di = (fy * w + fx) * 4
        full[di] = patch[si]
        full[di + 1] = patch[si + 1]
        full[di + 2] = patch[si + 2]
        full[di + 3] = patch[si + 3]
      }
    }

    out.push({
      data: new Uint8ClampedArray(full),
      w,
      h,
      // gifuct-js already converts the GCE delay to milliseconds (delay * 10);
      // clamp to a sane >= 20ms floor like browsers do.
      delayMs: Math.max(20, Number.isFinite(frame.delay) ? frame.delay : 0),
    })

    if (frame.disposalType === 2) {
      // Restore to background: clear the patch rectangle to transparent.
      for (let y = 0; y < ph; y++) {
        const fy = top + y
        if (fy < 0 || fy >= h) continue
        for (let x = 0; x < pw; x++) {
          const fx = left + x
          if (fx < 0 || fx >= w) continue
          const di = (fy * w + fx) * 4
          full[di] = 0
          full[di + 1] = 0
          full[di + 2] = 0
          full[di + 3] = 0
        }
      }
    } else if (frame.disposalType === 3 && saved) {
      full.set(saved)
    }
  }

  if (out.length === 0) {
    throw new Error(`“${file.name}” contains no drawable GIF frames.`)
  }
  return out
}

/**
 * Slice an RGBA buffer into cols×rows cells (row-major order).
 * Cell sizes are floored to whole pixels (min 1px); edge cells that fall
 * outside the source stay transparent.
 */
export function sliceSheet(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  cols: number,
  rows: number,
): SlicedCell[] {
  const cCols = Math.max(1, Math.floor(cols))
  const cRows = Math.max(1, Math.floor(rows))
  const cw = Math.max(1, Math.floor(w / cCols))
  const ch = Math.max(1, Math.floor(h / cRows))
  const cells: SlicedCell[] = []
  for (let r = 0; r < cRows; r++) {
    for (let c = 0; c < cCols; c++) {
      const cell = new Uint8ClampedArray(cw * ch * 4)
      for (let y = 0; y < ch; y++) {
        const sy = r * ch + y
        if (sy >= h) break
        for (let x = 0; x < cw; x++) {
          const sx = c * cw + x
          if (sx >= w) break
          const si = (sy * w + sx) * 4
          const di = (y * cw + x) * 4
          cell[di] = data[si]
          cell[di + 1] = data[si + 1]
          cell[di + 2] = data[si + 2]
          cell[di + 3] = data[si + 3]
        }
      }
      cells.push({ data: cell, w: cw, h: ch })
    }
  }
  return cells
}

/**
 * Rasterize an HTMLImageElement into a cel at the target size
 * (nearest-neighbor — thin wrapper over the engine helper).
 */
export function celFromImageData(img: HTMLImageElement, tw: number, th: number): Uint8ClampedArray {
  return imageToCel(img, tw, th)
}
