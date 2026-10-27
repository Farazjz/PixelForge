import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { callCustomProvider, extractChatText, ProviderError } from '@/lib/ai/custom-provider'

export const runtime = 'nodejs'
export const maxDuration = 300

interface ChatBody {
  messages?: { role: 'system' | 'user' | 'assistant'; content: string }[]
  provider?: 'builtin' | 'custom'
  profile?: {
    baseUrl?: string
    apiKey?: string
    textModel?: string
    timeoutMs?: number
    maxRetries?: number
    headers?: string
  }
}

const DATA_URL_RE = /data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+/g

export async function POST(req: NextRequest) {
  let body: ChatBody
  try {
    body = (await req.json()) as ChatBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const messages = body.messages
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages[] is required' }, { status: 400 })
  }

  // Pull embedded data URLs out of message content so we can adapt per provider capability.
  let imageDataUrl: string | null = null
  const cleaned = messages.map((m) => {
    const urls = m.content.match(DATA_URL_RE)
    if (urls && urls.length > 0) {
      imageDataUrl = urls[0]
      return { ...m, content: m.content.replace(DATA_URL_RE, '[reference image attached]') }
    }
    return m
  })

  try {
    if (body.provider === 'custom') {
      const model = body.profile?.textModel
      if (!model) {
        return NextResponse.json({ error: 'No text model configured for this provider. Open Settings → AI Providers.' }, { status: 400 })
      }
      // Build OpenAI-style content; attach the image as a vision part when present.
      const outMessages = cleaned.map((m) => {
        if (imageDataUrl && m.role === 'user' && m.content.includes('[reference image attached]')) {
          const [textPart] = m.content.split('[reference image attached]')
          return {
            role: m.role,
            content: [
              { type: 'text', text: (textPart ?? '').trim() },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          }
        }
        return m
      })
      const { json } = await callCustomProvider({
        profile: { ...(body.profile ?? {}) },
        path: '/chat/completions',
        body: { model, messages: outMessages },
      })
      return NextResponse.json({ text: extractChatText(json), provider: model })
    }

    // ---- builtin (Z.ai sandbox) ----
    const zai = await ZAI.create()
    if (imageDataUrl) {
      // Vision-capable model for image-aware guided editing.
      const visionMessages = cleaned.map((m) => {
        if (m.role === 'user' && m.content.includes('[reference image attached]')) {
          const [textPart] = m.content.split('[reference image attached]')
          return {
            role: 'user' as const,
            content: [
              { type: 'text', text: (textPart ?? '').trim() },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          }
        }
        return m
      })
      const res = await zai.chat.completions.createVision({
        model: 'glm-4.5v',
        messages: visionMessages as never,
      })
      const text = typeof res?.choices?.[0]?.message?.content === 'string'
        ? res.choices[0].message.content
        : String(res?.choices?.[0]?.message?.content ?? '')
      if (!text) return NextResponse.json({ error: 'The assistant returned an empty response.' }, { status: 502 })
      return NextResponse.json({ text, provider: 'Built-in AI (vision)' })
    }
    const res = await zai.chat.completions.create({ messages: cleaned })
    const text = typeof res?.choices?.[0]?.message?.content === 'string'
      ? res.choices[0].message.content
      : String(res?.choices?.[0]?.message?.content ?? '')
    if (!text) return NextResponse.json({ error: 'The assistant returned an empty response.' }, { status: 502 })
    return NextResponse.json({ text, provider: 'Built-in AI' })
  } catch (e) {
    if (e instanceof ProviderError) {
      return NextResponse.json({ error: e.message }, { status: e.status >= 400 && e.status < 600 ? e.status : 502 })
    }
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: `AI request failed: ${msg}` }, { status: 502 })
  }
}
