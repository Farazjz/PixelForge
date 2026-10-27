'use client'

// PixelForge AI — desktop (Tauri static-export) fallbacks.
//
// The web build ships Next.js API routes (/api/ai/*, /api/projects). The desktop
// build is a static export with no server, so backend-backed features degrade
// gracefully here:
//   • AI generation / chat / connection-test → called DIRECTLY against the
//     user's own OpenAI-compatible endpoint (bring-your-own provider). The
//     built-in sandbox provider is web-only and says so honestly.
//   • AI image-to-image edit → web-only (provider edit APIs are multipart and
//     non-uniform); guided suggestions (chat) still work.
//   • Cloud project save/load → a local library persisted in localStorage.
//
// DESKTOP is baked at build time via NEXT_PUBLIC_DESKTOP=1 (see
// scripts/prepare-desktop.cjs) and additionally verified at runtime.

import type { AIProfile } from './types'

export const DESKTOP = process.env.NEXT_PUBLIC_DESKTOP === '1'

export function isDesktopRuntime(): boolean {
  if (DESKTOP) return true
  if (typeof window === 'undefined') return false
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window
}

// ---------------------------------------------------------------------------
// Shared provider plumbing
// ---------------------------------------------------------------------------

export interface ProviderCreds {
  baseUrl: string
  apiKey: string
  imageModel?: string
  textModel?: string
  timeoutMs?: number
  headers?: Record<string, string>
}

export function requireCustomCreds(
  profile: AIProfile,
  model: 'imageModel' | 'textModel',
): ProviderCreds {
  if (profile.kind !== 'custom') {
    throw new Error(
      'The built-in provider runs on the web version only. In the desktop version, open Settings → AI Providers and add your own OpenAI-compatible endpoint (for example OpenAI, OpenRouter, or a local Ollama / LM Studio server).',
    )
  }
  const baseUrl = (profile.baseUrl || '').trim().replace(/\/+$/, '')
  if (!baseUrl) throw new Error('Your provider profile has no base URL. Open Settings → AI Providers and set it.')
  if (!profile.apiKey) throw new Error('Your provider profile has no API key. Open Settings → AI Providers and set it.')
  const modelValue = model === 'imageModel' ? profile.imageModel : profile.textModel
  if (!modelValue || !modelValue.trim()) {
    throw new Error(
      `Your provider profile has no ${model === 'imageModel' ? 'image' : 'text'} model set. Open Settings → AI Providers and configure it.`,
    )
  }
  let extra: Record<string, string> = {}
  if (profile.headers && profile.headers.trim()) {
    try {
      const parsed: unknown = JSON.parse(profile.headers)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        extra = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      }
    } catch {
      // invalid JSON in extra headers — ignore, base settings still work
    }
  }
  return {
    baseUrl,
    apiKey: profile.apiKey,
    imageModel: profile.imageModel,
    textModel: profile.textModel,
    timeoutMs: profile.timeoutMs ?? 120000,
    headers: {
      Authorization: `Bearer ${profile.apiKey}`,
      'Content-Type': 'application/json',
      ...extra,
    },
  }
}

async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  // Link external abort with our timeout
  const external = init.signal
  if (external) {
    if (external.aborted) controller.abort()
    else external.addEventListener('abort', () => controller.abort(), { once: true })
  }
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    const text = await res.text()
    let json: unknown = null
    try {
      json = JSON.parse(text) as unknown
    } catch {
      json = null
    }
    if (!res.ok) {
      const msg =
        !!json && typeof json === 'object' && 'error' in json
          ? (() => {
              const err = (json as { error: unknown }).error
              if (typeof err === 'string') return err
              if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string')
                return (err as { message: string }).message
              return null
            })()
          : null
      throw new Error(msg || `Provider request failed (HTTP ${res.status})`)
    }
    return json
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Desktop AI calls (direct to the user's provider, same response shapes as the
// web API routes so UI code stays identical)
// ---------------------------------------------------------------------------

export interface DesktopGenerateBody {
  prompt: string
  negativePrompt: string
  width: number
  height: number
  seed?: number
}

export interface GenerateResponse {
  images: string[]
  provider: string
  warning?: string
}

export async function desktopGenerate(
  body: DesktopGenerateBody,
  profile: AIProfile,
  signal?: AbortSignal,
): Promise<GenerateResponse> {
  const creds = requireCustomCreds(profile, 'imageModel')
  const model = creds.imageModel as string
  const prompt = body.negativePrompt.trim()
    ? `${body.prompt}\n\nAvoid: ${body.negativePrompt.trim()}`
    : body.prompt

  const json = (await fetchJson(
    `${creds.baseUrl}/images/generations`,
    {
      method: 'POST',
      headers: creds.headers,
      signal,
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size: `${body.width}x${body.height}`,
        response_format: 'b64_json',
        ...(body.seed !== undefined ? { seed: body.seed } : {}),
      }),
    },
    creds.timeoutMs ?? 120000,
  )) as {
    data?: { b64_json?: string; url?: string }[]
  }

  const items = Array.isArray(json?.data) ? json.data : []
  if (items.length === 0) throw new Error('Provider returned no images. Check the image model name in Settings.')

  const images: string[] = []
  for (const item of items) {
    if (item.b64_json) {
      images.push(`data:image/png;base64,${item.b64_json}`)
    } else if (item.url) {
      const blobRes = await fetch(item.url, { signal })
      if (!blobRes.ok) throw new Error(`Could not download generated image (HTTP ${blobRes.status}).`)
      const blob = await blobRes.blob()
      images.push(await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('Could not read generated image.'))
        reader.readAsDataURL(blob)
      }))
    }
  }
  if (images.length === 0) throw new Error('Provider returned no usable image data.')

  return {
    images,
    provider: model,
    warning:
      'Generated directly by your own provider. Note: some endpoints ignore exact pixel sizes or the seed — the result is converted to pixel art locally.',
  }
}

export interface ChatMessage {
  role: 'user' | 'system' | 'assistant'
  content: string
}

export interface ChatResponse {
  text: string
  provider: string
}

export async function desktopChat(
  messages: ChatMessage[],
  profile: AIProfile,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  const creds = requireCustomCreds(profile, 'textModel')
  const json = (await fetchJson(
    `${creds.baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: creds.headers,
      signal,
      body: JSON.stringify({ model: creds.textModel, messages, temperature: 0.2 }),
    },
    creds.timeoutMs ?? 120000,
  )) as { choices?: { message?: { content?: string } }[] }

  const text = json?.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Provider returned no text. Check the text model name in Settings.')
  }
  return { text, provider: creds.textModel as string }
}

export async function desktopTestConnection(
  profile: AIProfile,
): Promise<{ ok: true; modelCount: number } | { ok: false; error: string }> {
  try {
    const creds = requireCustomCreds(profile, 'imageModel')
    const json = (await fetchJson(
      `${creds.baseUrl}/models`,
      { method: 'GET', headers: creds.headers },
      Math.min(creds.timeoutMs ?? 120000, 30000),
    )) as { data?: unknown[] }
    const count = Array.isArray(json?.data) ? json.data.length : 0
    return { ok: true, modelCount: count }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Connection failed.' }
  }
}

// ---------------------------------------------------------------------------
// Local project library (desktop replacement for /api/projects)
// ---------------------------------------------------------------------------

export interface LibraryEntry {
  id: string
  name: string
  width: number
  height: number
  thumb: string | null
  dataJson: string
  updatedAt: string
}

const LIBRARY_KEY = 'pixelforge.library.v1'
const LIBRARY_LIMIT = 60

export function listLibrary(): LibraryEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(LIBRARY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is LibraryEntry =>
        !!e && typeof e === 'object' && typeof (e as LibraryEntry).id === 'string' && typeof (e as LibraryEntry).dataJson === 'string',
    )
  } catch {
    return []
  }
}

function persistLibrary(entries: LibraryEntry[]) {
  window.localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries.slice(0, LIBRARY_LIMIT)))
}

export function saveToLibrary(entry: Omit<LibraryEntry, 'id' | 'updatedAt'>): LibraryEntry {
  const full: LibraryEntry = {
    ...entry,
    id: crypto.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    updatedAt: new Date().toISOString(),
  }
  const entries = listLibrary()
  persistLibrary([full, ...entries])
  return full
}

export function updateLibraryEntry(id: string, entry: Omit<LibraryEntry, 'id' | 'updatedAt'>): LibraryEntry {
  const updated: LibraryEntry = {
    ...entry,
    id,
    updatedAt: new Date().toISOString(),
  }
  const entries = listLibrary().filter((e) => e.id !== id)
  persistLibrary([updated, ...entries])
  return updated
}

export function deleteFromLibrary(id: string) {
  persistLibrary(listLibrary().filter((e) => e.id !== id))
}

export function getLibraryEntry(id: string): LibraryEntry | null {
  return listLibrary().find((e) => e.id === id) ?? null
}
