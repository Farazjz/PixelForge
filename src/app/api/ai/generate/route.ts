import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import {
  callCustomProvider, extractImage, closestBuiltinSize, ProviderError, sanitizeBaseUrl,
} from '@/lib/ai/custom-provider'

export const runtime = 'nodejs'
export const maxDuration = 300

interface GenerateBody {
  prompt?: string
  negativePrompt?: string
  width?: number
  height?: number
  style?: string
  paletteSize?: number
  transparentBg?: boolean
  outline?: boolean
  detail?: string
  seed?: number
  provider?: 'builtin' | 'custom'
  profile?: {
    baseUrl?: string
    apiKey?: string
    imageModel?: string
    timeoutMs?: number
    maxRetries?: number
    headers?: string
  }
}

function buildPrompt(b: GenerateBody): string {
  const parts: string[] = [b.prompt?.trim() ?? '']
  if (b.style && b.style !== 'none') parts.push(`${b.style} style`)
  const detail = b.detail === 'low' ? 'simple shapes, minimal detail, bold readable silhouette'
    : b.detail === 'high' ? 'rich shading and texture while staying readable at small size' : undefined
  if (detail) parts.push(detail)
  parts.push('pixel art, crisp hard-edged pixels, clean limited palette, no anti-aliasing, no motion blur, centered subject, plain background')
  let p = parts.filter(Boolean).join(', ')
  if (b.negativePrompt?.trim()) p += `. Avoid: ${b.negativePrompt.trim()}`
  if (b.transparentBg) p += '. Isolated subject on a fully plain solid white background for easy cutout'
  return p
}

export async function POST(req: NextRequest) {
  let body: GenerateBody
  try {
    body = (await req.json()) as GenerateBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const prompt = body.prompt?.trim()
  if (!prompt) return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
  const width = Math.max(8, Math.min(1024, Math.floor(body.width ?? 32)))
  const height = Math.max(8, Math.min(1024, Math.floor(body.height ?? 32)))

  try {
    if (body.provider === 'custom') {
      const imageModel = body.profile?.imageModel
      if (!imageModel) {
        return NextResponse.json({ error: 'No image model configured for this provider. Open Settings → AI Providers and set the image-generation model.' }, { status: 400 })
      }
      const fullPrompt = buildPrompt(body)
      // Try the requested size; some providers only accept fixed sizes, so fall back to 1024x1024.
      let json: Record<string, unknown>
      let warning: string | undefined
      try {
        ({ json } = await callCustomProvider({
          profile: { ...(body.profile ?? {}), imageModel },
          path: '/images/generations',
          body: {
            model: imageModel,
            prompt: fullPrompt,
            size: `${width}x${height}`,
            ...(body.seed !== undefined && Number.isFinite(body.seed) ? { seed: body.seed } : {}),
          },
        }))
      } catch (e) {
        if (e instanceof ProviderError && e.status === 404) {
          ({ json } = await callCustomProvider({
            profile: { ...(body.profile ?? {}), imageModel },
            path: '/images/generations',
            body: { model: imageModel, prompt: fullPrompt, size: '1024x1024' },
          }))
          warning = `Provider rejected ${width}x${height}; generated at 1024x1024 instead — it will be resampled to your canvas.`
        } else throw e
      }
      const image = await extractImage(json)
      return NextResponse.json({ images: [image], provider: imageModel, warning })
    }

    // ---- builtin provider (Z.ai sandbox) ----
    const zai = await ZAI.create()
    const size = closestBuiltinSize(width, height)
    const fullPrompt = buildPrompt(body)
    const res = await zai.images.generations.create({ prompt: fullPrompt, size: size as '1024x1024' })
    const b64 = res?.data?.[0]?.base64
    if (!b64) {
      return NextResponse.json({ error: 'The image service returned no image data. Try again or configure a custom provider.' }, { status: 502 })
    }
    const warning = (size !== `${width}x${height}`)
      ? `Generated at ${size} (closest supported) — it will be resampled to ${width}×${height} with nearest-neighbor.`
      : undefined
    return NextResponse.json({ images: [`data:image/png;base64,${b64}`], provider: 'Built-in AI', warning })
  } catch (e) {
    if (e instanceof ProviderError) {
      return NextResponse.json({ error: e.message }, { status: e.status >= 400 && e.status < 600 ? e.status : 502 })
    }
    const msg = e instanceof Error ? e.message : 'Unknown error'
    if (/timeout|abort/i.test(msg)) return NextResponse.json({ error: `Generation timed out. ${msg}` }, { status: 504 })
    return NextResponse.json({ error: `Generation failed: ${msg}` }, { status: 502 })
  }
}

// keep import used
void sanitizeBaseUrl
