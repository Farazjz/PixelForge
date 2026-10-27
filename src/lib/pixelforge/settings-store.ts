'use client'

// PixelForge AI — Settings store: AI provider profiles & preferences.
// API keys are stored ONLY in the user's browser localStorage and never sent anywhere
// except to the exact endpoint the user configured (proxied through their own backend route).

import { create } from 'zustand'
import type { AIProfile, AIProfileStore } from './types'

const STORAGE_KEY = 'pixelforge.settings.v1'

export const BUILTIN_PROFILE_ID = 'builtin'

const DEFAULT_SETTINGS: AIProfileStore = {
  profiles: [
    {
      id: BUILTIN_PROFILE_ID,
      name: 'Built-in AI (Z.ai sandbox)',
      kind: 'builtin',
      timeoutMs: 120000,
    },
  ],
  activeProfileId: BUILTIN_PROFILE_ID,
  autosaveEnabled: true,
  defaultGridVisible: true,
  defaultOnionSkin: false,
}

function loadSettings(): AIProfileStore {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<AIProfileStore>
    const profiles = Array.isArray(parsed.profiles) && parsed.profiles.length > 0
      ? parsed.profiles
      : DEFAULT_SETTINGS.profiles
    // Ensure builtin profile always exists
    if (!profiles.find((p) => p.id === BUILTIN_PROFILE_ID)) {
      profiles.unshift(DEFAULT_SETTINGS.profiles[0])
    }
    return {
      profiles,
      activeProfileId: parsed.activeProfileId || BUILTIN_PROFILE_ID,
      autosaveEnabled: parsed.autosaveEnabled !== false,
      defaultGridVisible: parsed.defaultGridVisible !== false,
      defaultOnionSkin: !!parsed.defaultOnionSkin,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function persist(s: AIProfileStore) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // storage full / disabled — settings stay in memory
  }
}

export interface SettingsState extends AIProfileStore {
  loaded: boolean
  hydrate: () => void
  upsertProfile: (profile: AIProfile) => void
  deleteProfile: (id: string) => void
  setActiveProfile: (id: string) => void
  set: (patch: Partial<AIProfileStore>) => void
  getActiveProfile: () => AIProfile
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  loaded: false,
  hydrate: () => {
    const s = loadSettings()
    set({ ...s, loaded: true })
  },
  upsertProfile: (profile) => {
    const profiles = [...get().profiles]
    const idx = profiles.findIndex((p) => p.id === profile.id)
    if (idx >= 0) profiles[idx] = profile
    else profiles.push(profile)
    const next = { ...get(), profiles }
    persist(next)
    set({ profiles })
  },
  deleteProfile: (id) => {
    if (id === BUILTIN_PROFILE_ID) return
    const profiles = get().profiles.filter((p) => p.id !== id)
    const activeProfileId = get().activeProfileId === id ? BUILTIN_PROFILE_ID : get().activeProfileId
    const next = { ...get(), profiles, activeProfileId }
    persist(next)
    set({ profiles, activeProfileId })
  },
  setActiveProfile: (id) => {
    const next = { ...get(), activeProfileId: id }
    persist(next)
    set({ activeProfileId: id })
  },
  set: (patch) => {
    const next = { ...get(), ...patch }
    persist(next)
    set(patch)
  },
  getActiveProfile: () => {
    const s = get()
    return s.profiles.find((p) => p.id === s.activeProfileId) ?? s.profiles[0]
  },
}))

// ---------- HUD store (high-frequency cursor/coords, kept separate to avoid re-renders) ----------

export interface HudState {
  cursor: { x: number; y: number } | null
  setCursor: (c: { x: number; y: number } | null) => void
}

export const useHudStore = create<HudState>((set) => ({
  cursor: null,
  setCursor: (c) => set({ cursor: c }),
}))
