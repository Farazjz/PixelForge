import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import {
  callCustomProvider, extractImage, closestBuiltinSize, ProviderError,
} from '@/lib/ai/custom-provider'

export const runtime = 'nodejs'
export const maxDuration = 300

interface EditBody {
  prompt?: string
  imageDataUrl?: string
  provider?: 'builtin' | 'custom'
  profile?: {
    baseUrl?: string
    apiKey?: string
    editModel?: string
    imageModel?: string
    timeoutMs?: number
    maxRetries?: number
    headers?: string
  }
}

export async function POST(req: NextRequest) {
  let body: EditBody
  try {
    body = (await req.json()) as EditBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const prompt = body.prompt?.trim()
  if (!prompt) return NextResponse.json({ error: 'Editing instruction is required' }, { status: 400 })
  if (!body.imageDataUrl?.startsWith('data:image/')) {
    return NextResponse.json({ error: 'A source image (data URL) is required' }, { status: 400 })
  }

  const parts = body.imageDataUrl.split(',')
  const base64Image = parts[1]
  if (!base64Image) return NextResponse.json({ error: 'Malformed image data URL' }, { status: 400 })

  try {
    if (body.provider === 'custom') {
      const model = body.profile?.editModel || body.profile?.imageModel
      if (!model) {
        return NextResponse.json({ error: 'No edit/image model configured for this provider. Open Settings → AI Providers.' }, { status: 400 })
      }
      // Prefer multipart /images/edits (OpenAI style); fall back to JSON with image payload.
      let json: Record<string, unknown>
      try {
        const blob = Buffer.from(base64Image, 'base64')
        const form = new FormData()
        form.append('image', new Blob([new Uint8Array(blob)], { type: 'image/png' }), 'image.png')
        form.append('prompt', prompt)
        form.append('model', model)
        form.append('response_format', 'b64_json')
        ;({ json } = await callCustomProvider({ profile: { ...(body.profile ?? {}) }, path: '/images/edits', form }))
      } catch (e) {
        if (e instanceof ProviderError && (e.status === 404 || e.status === 400)) {
          ;({ json } = await callCustomProvider({
            profile: { ...(body.profile ?? {}) },
            path: '/images/generations',
            body: { model, prompt, image: body.imageDataUrl, response_format: 'b64_json' },
          }))
        } else throw e
      }
      const image = await extractImage(json)
      return NextResponse.json({ image, provider: model })
    }

    // ---- builtin (Z.ai sandbox): supports image-to-image editing ----
    const zai = await ZAI.create()
    const res = await zai.images.generations.edit({
      prompt: `${prompt}. Keep the pixel-art style, crisp pixels, limited palette.`,
      image: body.imageDataUrl,
      size: '1024x1024',
    })
    const b64 = res?.data?.[0]?.base64
    if (!b64) {
      return NextResponse.json({ error: 'The edit service returned no image data. Try again or use Guided mode.' }, { status: 502 })
    }
    void closestBuiltinSize
    return NextResponse.json({ image: `data:image/png;base64,${b64}`, provider: 'Built-in AI (image edit)' })
  } catch (e) {
    if (e instanceof ProviderError) {
      return NextResponse.json({ error: e.message }, { status: e.status >= 400 && e.status < 600 ? e.status : 502 })
    }
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: `Image edit failed: ${msg}` }, { status: 502 })
  }
}
