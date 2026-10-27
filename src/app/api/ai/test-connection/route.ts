import { NextRequest, NextResponse } from 'next/server'
import { sanitizeBaseUrl, ProviderError } from '@/lib/ai/custom-provider'

export const runtime = 'nodejs'

interface TestBody {
  baseUrl?: string
  apiKey?: string
  textModel?: string
}

/** Tests a user-configured OpenAI-compatible endpoint by calling GET /models. */
export async function POST(req: NextRequest) {
  let body: TestBody
  try {
    body = (await req.json()) as TestBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  try {
    const base = sanitizeBaseUrl(body.baseUrl)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12000)
    const headers: Record<string, string> = {}
    if (body.apiKey) headers['Authorization'] = `Bearer ${body.apiKey}`
    let res: Response
    try {
      res = await fetch(base + '/models', { headers, signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
    if (res.ok) {
      let modelCount: number | null = null
      let hasTextModel: boolean | null = null
      try {
        const json = (await res.json()) as { data?: unknown[]; models?: unknown[] }
        const list = Array.isArray(json.data) ? json.data : Array.isArray(json.models) ? json.models : null
        if (list) {
          modelCount = list.length
          if (body.textModel && list.length > 0) {
            hasTextModel = list.some((m) => {
              const id = typeof m === 'string' ? m : (m as { id?: string })?.id
              return id === body.textModel
            })
          }
        }
      } catch { /* body not JSON — endpoint still reachable */ }
      return NextResponse.json({
        ok: true,
        modelCount,
        note: hasTextModel === false
          ? `Reachable, but "${body.textModel}" was not found in the model list — verify the model id.`
          : 'Connection successful.',
        hasTextModel,
      })
    }
    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({ ok: false, error: `Authentication failed (HTTP ${res.status}). Check your API key.` })
    }
    if (res.status === 404) {
      // Some servers don't implement /models — the base URL itself resolved.
      return NextResponse.json({ ok: true, note: 'Endpoint reachable. /models is not implemented by this server (that is fine for image-only endpoints).' })
    }
    if (res.status === 429) {
      return NextResponse.json({ ok: false, error: 'Rate limited (HTTP 429) — the endpoint is reachable but is throttling you.' })
    }
    const text = await res.text().catch(() => '')
    return NextResponse.json({ ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` })
  } catch (e) {
    if (e instanceof ProviderError) return NextResponse.json({ ok: false, error: e.message })
    if (e instanceof Error && e.name === 'AbortError') {
      return NextResponse.json({ ok: false, error: 'Connection test timed out after 12s.' })
    }
    return NextResponse.json({ ok: false, error: `Network error: ${e instanceof Error ? e.message : String(e)}` })
  }
}
