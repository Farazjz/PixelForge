// PixelForge AI — Pure browser-side export helpers: BMP encoder, animated GIF
// encoder (gifenc), frames-as-ZIP (jszip). These functions are store-free and
// side-effect-free (they only turn pixels/blobs into blobs).

import { GIFEncoder, quantize, applyPalette } from 'gifenc'
import JSZip from 'jszip'

// ---------------- BMP (32-bit BI_RGB, bottom-up BGRA) ----------------

/**
 * Encode a flat 32-bit uncompressed BMP from straight-alpha RGBA pixel data.
 *
 * Layout: 14-byte BITMAPFILEHEADER + 40-byte BITMAPINFOHEADER (54-byte pixel
 * offset), 32 bpp BI_RGB, BGRA byte order, rows stored bottom-up (positive
 * height). No row padding is required at 32 bpp (rows are already 4-byte
 * aligned).
 *
 * Alpha handling: when `backgroundColor` is provided, every pixel with
 * alpha < 255 is blended over that color and written with an alpha byte of
 * 0xFF (fully flat image, like JPEG). Without a background color the pixel's
 * own alpha byte is preserved — 32-bit BMP alpha is honored by most viewers.
 */
export function encodeBMP(
  cel: Uint8ClampedArray,
  w: number,
  h: number,
  backgroundColor?: [number, number, number] | null,
): Blob {
  const width = Math.max(1, Math.floor(w))
  const height = Math.max(1, Math.floor(h))
  const rowBytes = width * 4 // 32 bpp → rows are 4-byte aligned, no padding
  const pixelBytes = rowBytes * height
  const fileSize = 54 + pixelBytes
  const bg = backgroundColor ?? null

  const buffer = new ArrayBuffer(fileSize)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  // ---- BITMAPFILEHEADER (14 bytes) ----
  bytes[0] = 0x42 // 'B'
  bytes[1] = 0x4d // 'M'
  view.setUint32(2, fileSize, true) // file size
  view.setUint32(6, 0, true) // reserved
  view.setUint32(10, 54, true) // offset to pixel data

  // ---- BITMAPINFOHEADER (40 bytes) ----
  view.setUint32(14, 40, true) // header size
  view.setInt32(18, width, true)
  view.setInt32(22, height, true) // positive → bottom-up rows
  view.setUint16(26, 1, true) // color planes
  view.setUint16(28, 32, true) // bits per pixel
  view.setUint32(30, 0, true) // BI_RGB (no compression)
  view.setUint32(34, pixelBytes, true) // image size
  view.setInt32(38, 2835, true) // 72 DPI
  view.setInt32(42, 2835, true)
  view.setUint32(46, 0, true) // colors used
  view.setUint32(50, 0, true) // important colors

  // ---- Pixel data: BGRA, bottom-up ----
  for (let y = 0; y < height; y++) {
    const srcRow = height - 1 - y
    let di = 54 + y * rowBytes
    for (let x = 0; x < width; x++, di += 4) {
      const si = (srcRow * width + x) * 4
      const r = cel[si]
      const g = cel[si + 1]
      const b = cel[si + 2]
      const a = cel[si + 3]
      let pr = r
      let pg = g
      let pb = b
      let pa: number
      if (bg) {
        if (a < 255) {
          const t = a / 255
          pr = Math.round(r * t + bg[0] * (1 - t))
          pg = Math.round(g * t + bg[1] * (1 - t))
          pb = Math.round(b * t + bg[2] * (1 - t))
        }
        pa = 0xff
      } else {
        pa = a
      }
      bytes[di] = pb
      bytes[di + 1] = pg
      bytes[di + 2] = pr
      bytes[di + 3] = pa
    }
  }

  return new Blob([buffer], { type: 'image/bmp' })
}

// ---------------- Animated GIF (gifenc, rgba4444 + 1-bit transparency) ----------------

/**
 * Encode an infinitely-looping animated GIF from straight-alpha RGBA frames.
 *
 * Per frame: quantize with gifenc's rgba4444 format (alpha-aware, ≤ `colors`
 * entries, default 256) and map pixels to palette indices; write with
 * dispose=2 (restore-to-background) so transparent regions never smear across
 * frames, and 1-bit transparency at the palette index whose alpha is 0 (fully
 * opaque frames simply skip the transparent flag). Delays are clamped to a
 * 20 ms minimum (GIF timing granularity); the first frame carries repeat=0
 * (loop forever). Uses rgba4444 uniformly for every frame, opaque or not.
 */
export function encodeAnimatedGIF(
  frames: { data: Uint8ClampedArray; delayMs: number }[],
  w: number,
  h: number,
  opts?: { colors?: number },
): Blob {
  if (frames.length === 0) throw new Error('No frames to encode')
  const colors = Math.min(256, Math.max(2, Math.floor(opts?.colors ?? 256)))
  const gif = GIFEncoder()

  frames.forEach((frame, i) => {
    const palette = quantize(frame.data, colors, { format: 'rgba4444' })
    const index = applyPalette(frame.data, palette, 'rgba4444')
    const transparentIndex = palette.findIndex((c) => c.length > 3 && c[3] === 0)
    gif.writeFrame(index, w, h, {
      palette,
      delay: Math.max(20, Math.round(frame.delayMs)),
      transparent: transparentIndex >= 0,
      transparentIndex: transparentIndex >= 0 ? transparentIndex : 0,
      dispose: 2,
      ...(i === 0 ? { repeat: 0 } : {}),
    })
  })

  gif.finish()
  // bytes() already returns a copy; re-wrap so the buffer is typed ArrayBuffer (BlobPart-safe).
  const out = new Uint8Array(gif.bytes())
  return new Blob([out], { type: 'image/gif' })
}

// ---------------- ZIP (jszip, DEFLATE) ----------------

/**
 * Bundle named blobs into a single DEFLATE-compressed ZIP archive.
 */
export async function zipBlobs(files: { name: string; blob: Blob }[]): Promise<Blob> {
  const zip = new JSZip()
  for (const file of files) {
    zip.file(file.name, file.blob)
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

// ---------------- Canvas → PNG blob ----------------

/**
 * Promise wrapper around canvas.toBlob('image/png') — rejects when the
 * browser fails to encode (null blob).
 */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Canvas PNG encoding failed'))
    }, 'image/png')
  })
}
