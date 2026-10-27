'use client'

import dynamic from 'next/dynamic'

// The editor is fully client-side (canvas, localStorage, window events, random doc ids).
const PixelForgeApp = dynamic(() => import('@/components/pixelforge/PixelForgeApp'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-zinc-950">
      <div className="flex flex-col items-center gap-4">
        <div className="grid size-10 grid-cols-2 gap-1">
          <span className="animate-pulse rounded-sm bg-violet-500" />
          <span className="animate-pulse rounded-sm bg-amber-400 [animation-delay:150ms]" />
          <span className="animate-pulse rounded-sm bg-emerald-400 [animation-delay:300ms]" />
          <span className="animate-pulse rounded-sm bg-rose-400 [animation-delay:450ms]" />
        </div>
        <p className="font-mono text-sm text-zinc-500">Forging pixels…</p>
      </div>
    </div>
  ),
})

export default function Home() {
  return <PixelForgeApp />
}
