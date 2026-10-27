'use client'

// PixelForge AI — App shell: menu bar, tool rail, canvas, right panels, status bar.
// Also handles: settings hydration, autosave to localStorage, unsaved-changes guard.

import { useEffect, useRef } from 'react'
import { ResizablePanel as Panel, ResizablePanelGroup as PanelGroup, ResizableHandle as PanelResizeHandle } from '@/components/ui/resizable'
import { MenuBar } from './MenuBar'
import ToolRail from './ToolRail'
import CanvasStage from './CanvasStage'
import RightPanel from './RightPanel'
import StatusBar from './StatusBar'
import { useShortcuts } from './useShortcuts'
import { NewProjectDialog } from './dialogs/NewProjectDialog'
import { OpenProjectDialog } from './dialogs/OpenProjectDialog'
import { ExportDialog } from './dialogs/ExportDialog'
import { SettingsDialog } from './dialogs/SettingsDialog'
import { ResizeDialog } from './dialogs/ResizeDialog'
import { AboutDialog } from './dialogs/AboutDialog'
import { CloudSaveDialog } from './dialogs/CloudSaveDialog'
import { useEditorStore } from '@/lib/pixelforge/store'
import { useSettingsStore } from '@/lib/pixelforge/settings-store'
import { serializeDoc, deserializeDoc } from '@/lib/pixelforge/engine'
import { useToast } from '@/hooks/use-toast'

const AUTOSAVE_KEY = 'pixelforge.autosave.v1'

export default function PixelForgeApp() {
  const { toast } = useToast()
  const restoredRef = useRef(false)

  useShortcuts()

  // hydrate settings from localStorage
  useEffect(() => {
    useSettingsStore.getState().hydrate()
  }, [])

  // apply defaults (grid / onion) once settings exist
  useEffect(() => {
    const unsub = useSettingsStore.subscribe((s) => {
      if (!s.loaded) return
      const st = useEditorStore.getState()
      if (st.gridVisible !== s.defaultGridVisible) st.setGridVisible(s.defaultGridVisible)
    })
    return unsub
  }, [])

  // restore autosave once
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    try {
      const raw = window.localStorage.getItem(AUTOSAVE_KEY)
      if (!raw) return
      const doc = deserializeDoc(raw)
      useEditorStore.getState().loadDoc(doc)
      toast({ title: 'Session restored', description: `Recovered autosaved project "${doc.name}".` })
    } catch {
      // corrupt or absent autosave — start fresh silently
      try { window.localStorage.removeItem(AUTOSAVE_KEY) } catch { /* ignore */ }
    }
  }, [toast])

  // autosave every 30s when dirty
  useEffect(() => {
    const interval = setInterval(() => {
      const settings = useSettingsStore.getState()
      if (!settings.loaded || !settings.autosaveEnabled) return
      const st = useEditorStore.getState()
      if (!st.dirty) return
      try {
        const json = serializeDoc(st.doc)
        if (json.length > 4_400_000) return // localStorage quota safety
        window.localStorage.setItem(AUTOSAVE_KEY, json)
      } catch {
        // quota exceeded — skip this cycle
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  // warn on unload with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (useEditorStore.getState().dirty) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-zinc-950 text-zinc-200">
      <MenuBar />
      <main className="flex min-h-0 flex-1">
        <ToolRail />
        <PanelGroup direction="horizontal" className="min-h-0 flex-1">
          <Panel defaultSize={72} minSize={35}>
            <CanvasStage />
          </Panel>
          <PanelResizeHandle className="w-1 bg-zinc-800 transition-colors hover:bg-violet-600/60" />
          <Panel defaultSize={28} minSize={16} maxSize={45}>
            <RightPanel />
          </Panel>
        </PanelGroup>
      </main>
      <StatusBar />
      {/* global dialogs */}
      <NewProjectDialog />
      <OpenProjectDialog />
      <ExportDialog />
      <SettingsDialog />
      <ResizeDialog />
      <AboutDialog />
      <CloudSaveDialog />
    </div>
  )
}
