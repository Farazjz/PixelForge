import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

/** GET /api/projects — recent projects (metadata only, no full data). */
export async function GET() {
  try {
    const projects = await db.project.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: { id: true, name: true, width: true, height: true, thumb: true, updatedAt: true },
    })
    return NextResponse.json({ projects })
  } catch (e) {
    return NextResponse.json({ error: `Failed to list projects: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 })
  }
}

/** POST /api/projects — create a project. Body: {name,width,height,data|dataJson,thumb} */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { name?: string; width?: number; height?: number; data?: string; dataJson?: string; thumb?: string }
    const data = body.data ?? body.dataJson
    if (!data || typeof data !== 'string') {
      return NextResponse.json({ error: 'Project data is required' }, { status: 400 })
    }
    if (data.length > 80 * 1024 * 1024) {
      return NextResponse.json({ error: 'Project is too large to save (80MB limit)' }, { status: 413 })
    }
    const project = await db.project.create({
      data: {
        name: (body.name ?? 'Untitled').slice(0, 120),
        width: Math.max(1, Math.min(4096, Math.floor(body.width ?? 32))),
        height: Math.max(1, Math.min(4096, Math.floor(body.height ?? 32))),
        data,
        thumb: typeof body.thumb === 'string' ? body.thumb.slice(0, 500_000) : null,
      },
      select: { id: true, updatedAt: true },
    })
    return NextResponse.json({ id: project.id, updatedAt: project.updatedAt })
  } catch (e) {
    return NextResponse.json({ error: `Failed to save project: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 })
  }
}
