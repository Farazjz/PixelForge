// Minimal ambient type declarations for the 'gifenc' package (v1.0.3).
// gifenc ships JavaScript only (no .d.ts), so we declare exactly the API
// surface used by PixelForge's export-utils — no `any` anywhere.

declare module 'gifenc' {
  /** Color quantization format used by quantize()/applyPalette(). */
  export type GifencFormat = 'rgb565' | 'rgb444' | 'rgba4444'

  export interface GIFEncoderWriteFrameOptions {
    /** Color table for this frame. Required for the first frame (becomes the global color table); optional afterwards (local color table). */
    palette?: number[][]
    /** Non-auto mode only: write the Logical Screen Descriptor + Global Color Table with this frame. Ignored in auto mode. */
    first?: boolean
    /** Enable 1-bit transparency for this frame. */
    transparent?: boolean
    /** Palette index treated as fully transparent when `transparent` is enabled (default 0). */
    transparentIndex?: number
    /** Frame delay in milliseconds. */
    delay?: number
    /** Loop count written with the first frame: -1 = play once, 0 = loop forever, n = repeat n times. */
    repeat?: number
    /** GIF disposal method override (-1 = use default). 2 = restore to background (correct for transparent frames). */
    dispose?: number
    /** Color table bit depth (1..8); derived from the palette length when omitted. */
    colorDepth?: number
  }

  export interface GIFEncoderOptions {
    /** Auto mode (default true) writes the GIF header + first-frame metadata upon the first writeFrame call. */
    auto?: boolean
    /** Initial internal buffer capacity in bytes (default 4096). */
    initialCapacity?: number
  }

  export interface GIFEncoderInstance {
    /** Write one indexed-color frame (1 byte per pixel) with optional per-frame options. */
    writeFrame(index: Uint8Array, width: number, height: number, opts?: GIFEncoderWriteFrameOptions): void
    /** Write the GIF end-of-stream trailer. Required after the last frame. */
    finish(): void
    /** A copy of the encoded GIF bytes (safe to hand to Blob). */
    bytes(): Uint8Array
    /** Direct view into the internal stream buffer (no copy — handle with care). */
    bytesView(): Uint8Array
    /** Manually write the GIF header (only needed with `{ auto: false }`). */
    writeHeader(): void
    /** Reset the stream cursor so subsequent writes replace previous data. */
    reset(): void
    /** The currently backed ArrayBuffer (may be replaced as the buffer grows). */
    readonly buffer: ArrayBuffer
  }

  export interface QuantizeOptions {
    /** Color format: 'rgb565' (default), 'rgb444', or 'rgba4444' (alpha-aware). */
    format?: GifencFormat
    /** With an alpha format: snap quantized alpha to 0/0xFF using threshold 127 (or a custom number). */
    oneBitAlpha?: boolean | number
    /** With an alpha format: clear the RGB channels of (near-)transparent colors (default true). */
    clearAlpha?: boolean
    clearAlphaThreshold?: number
    clearAlphaColor?: number
  }

  export function GIFEncoder(opts?: GIFEncoderOptions): GIFEncoderInstance

  /** Quantize flat RGBA pixel data to a palette of at most `maxColors` [r,g,b] / [r,g,b,a] entries. */
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: QuantizeOptions,
  ): number[][]

  /** Map each RGBA pixel to the index of its nearest palette color (1 byte per pixel). */
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: number[][],
    format?: GifencFormat,
  ): Uint8Array
}
