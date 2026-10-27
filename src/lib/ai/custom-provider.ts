// PixelForge AI — Server-side helpers for user-configured OpenAI-compatible providers.
// API keys arrive per-request from the user's own settings and are used ONLY for that request.
// Keys are never logged and never persisted server-side.

import type { AIProfile } from '@/lib/pixelforge/types'

export interface CustomCallOptions {
  profile: Partial<AIProfile>
  /** path appended to baseUrl, e.g. '/images/generations' */
  path: string
  body?: Record<string, unknown>
  method?: 'GET' | 'POST'
  /** extra multipart form (used by /images/edits) */
  form?: FormData
}

export class ProviderError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.status = status
    this.name = 'ProviderError'
  }
}

export function sanitizeBaseUrl(baseUrl: string | undefined): string {
  if (!baseUrl) throw new ProviderError('No API base URL configured. Open Settings → AI Providers.', 400)
  const url = baseUrl.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(url)) throw new ProviderError('Base URL must start with http:// or https://', 400)
  return url
}

function parseHeaders(raw: string | undefined): Record<string, string> {
  if (!raw || !raw.trim()) return {}
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(obj)) if (typeof v === 'string') out[k] = v
    return out
  } catch {
    throw new ProviderError('Custom headers must be valid JSON', 400)
  }
}

export function mapHttpError(status: number, text: string): ProviderError {
  const snippet = text.slice(0, 300)
  if (status === 401 || status === 403) return new ProviderError(`Authentication failed (HTTP ${status}). Check your API key. ${snippet}`, status)
  if (status === 404) return new ProviderError(`Endpoint not found (HTTP 404). Verify the base URL and model. ${snippet}`, status)
  if (status === 429) return new ProviderError(`Rate limit reached (HTTP 429). Slow down or check your provider quota. ${snippet}`, status)
  if (status >= 500) return new ProviderError(`Provider server error (HTTP ${status}). ${snippet}`, status)
  return new ProviderError(`Provider returned HTTP ${status}. ${snippet}`, status)
}

/** POST/GET to a custom provider with timeout + retries. Returns parsed JSON. */
export async function callCustomProvider(opts: CustomCallOptions): Promise<{ json: Record<string, unknown>; status: number }> {
  const { profile } = opts
  const base = sanitizeBaseUrl(profile.baseUrl)
  const url = base + opts.path
  const timeoutMs = Math.max(5000, Math.min(300000, profile.timeoutMs ?? 90000))
  const maxRetries = Math.max(0, Math.min(5, profile.maxRetries ?? 0))
  const extraHeaders = parseHeaders(profile.headers)

  let lastError: ProviderError | null = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const headers: Record<string, string> = { ...extraHeaders }
      if (profile.apiKey) headers['Authorization'] = `Bearer ${profile.apiKey}`
      let res: Response
      if (opts.form) {
        res = await fetch(url, { method: 'POST', headers, body: opts.form, signal: controller.signal })
      } else {
        headers['Content-Type'] = 'application/json'
        res = await fetch(url, {
          method: opts.method ?? 'POST',
          headers,
          body: opts.method === 'GET' ? undefined : JSON.stringify(opts.body ?? {}),
          signal: controller.signal,
        })
      }
      clearTimeout(timer)
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        const err = mapHttpError(res.status, text)
        // Retry only on transient errors
        if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
          lastError = err
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
          continue
        }
        throw err
      }
      const json = (await res.json()) as Record<string, unknown>
      return { json, status: res.status }
    } catch (e) {
      clearTimeout(timer)
      if (e instanceof ProviderError) {
        if (attempt < maxRetries && (e.status === 429 || e.status >= 500)) { lastError = e; continue }
        throw e
      }
      if (e instanceof Error && e.name === 'AbortError') {
        lastError = new ProviderError(`Request timed out after ${timeoutMs / 1000}s`, 504)
      } else {
        lastError = new ProviderError(`Network error: cannot reach ${url}. ${e instanceof Error ? e.message : String(e)}`, 502)
      }
      if (attempt >= maxRetries) throw lastError
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
    }
  }
  throw lastError ?? new ProviderError('Unknown provider error')
}

/** Extract a PNG data URL from an OpenAI-style image response (b64_json or url). */
export async function extractImage(json: Record<string, unknown>): Promise<string> {
  const data = json['data']
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0] as Record<string, unknown>
    if (typeof first['b64_json'] === 'string' && first['b64_json'].length > 0) {
      return `data:image/png;base64,${first['b64_json']}`
    }
    if (typeof first['base64'] === 'string' && first['base64'].length > 0) {
      return `data:image/png;base64,${first['base64']}`
    }
    if (typeof first['url'] === 'string') {
      const res = await fetch(first['url']).catch(() => null)
      if (res && res.ok) {
        const buf = Buffer.from(await res.arrayBuffer())
        const mime = res.headers.get('content-type') ?? 'image/png'
        return `data:${mime};base64,${buf.toString('base64')}`
      }
      throw new ProviderError('Could not download the image URL returned by the provider', 502)
    }
  }
  if (typeof json['image'] === 'string' && json['image'].startsWith('data:')) {
    return json['image']
  }
  throw new ProviderError('Malformed provider response: no image data found (expected data[0].b64_json or data[0].url)', 502)
}

export function extractChatText(json: Record<string, unknown>): string {
  const choices = json['choices']
  if (Array.isArray(choices) && choices.length > 0) {
    const msg = (choices[0] as Record<string, unknown>)['message'] as Record<string, unknown> | undefined
    if (msg && typeof msg['content'] === 'string') return msg['content']
  }
  if (typeof json['content'] === 'string') return json['content']
  throw new ProviderError('Malformed provider response: no chat text found', 502)
}

/** Pick the closest supported generation size for the builtin provider. */
const BUILTIN_SIZES: [number, number][] = [
  [1024, 1024], [768, 1344], [864, 1152], [1344, 768], [1152, 864], [1440, 720], [720, 1440],
]

export function closestBuiltinSize(w: number, h: number): string {
  const target = w / h
  let best = BUILTIN_SIZES[0]
  let bestDiff = Infinity
  for (const [sw, sh] of BUILTIN_SIZES) {
    const diff = Math.abs(sw / sh - target)
    if (diff < bestDiff) { bestDiff = diff; best = [sw, sh] }
  }
  return `${best[0]}x${best[1]}`
}
