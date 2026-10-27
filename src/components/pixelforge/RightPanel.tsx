'use client'

// PixelForge AI — Right sidebar: switchable work panels (Layers / Palette / AI Studio / Animation / Tool props)

import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Layers, Palette, Sparkles, Film, SlidersHorizontal } from 'lucide-react'
import LayersPanel from './LayersPanel'
import PalettePanel from './PalettePanel'
import AIStudioPanel from './AIStudioPanel'
import AnimationPanel from './AnimationPanel'
import ToolProperties from './ToolProperties'

export default function RightPanel() {
  const [tab, setTab] = useState('layers')

  useEffect(() => {
    const open = () => setTab('ai')
    window.addEventListener('pf:open-ai-studio', open)
    return () => window.removeEventListener('pf:open-ai-studio', open)
  }, [])

  const triggers = [
    { id: 'layers', icon: Layers, label: 'Layers', component: <LayersPanel /> },
    { id: 'palette', icon: Palette, label: 'Palette', component: <PalettePanel /> },
    { id: 'ai', icon: Sparkles, label: 'AI Studio', component: <AIStudioPanel /> },
    { id: 'animation', icon: Film, label: 'Animation', component: <AnimationPanel /> },
    { id: 'tool', icon: SlidersHorizontal, label: 'Tool properties', component: <ToolProperties /> },
  ]

  return (
    <TooltipProvider delayDuration={300}>
      <Tabs value={tab} onValueChange={setTab} className="flex h-full flex-col bg-zinc-900">
        <TabsList className="mx-2 mt-2 grid grid-cols-5 gap-1 rounded-md bg-zinc-800/60 p-1">
          {triggers.map(({ id, icon: Icon, label }) => (
            <Tooltip key={id}>
              <TooltipTrigger asChild>
                <TabsTrigger
                  value={id}
                  aria-label={label}
                  className="h-8 rounded px-0 py-0 data-[state=active]:bg-violet-600 data-[state=active]:text-white"
                >
                  <Icon className="size-4" />
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">{label}</TooltipContent>
            </Tooltip>
          ))}
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {triggers.map(({ id, component }) => (
            <TabsContent key={id} value={id} className="mt-0 h-full">
              {component}
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </TooltipProvider>
  )
}
