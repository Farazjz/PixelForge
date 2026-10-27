import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/projects/[id] — full project incl. serialized data. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  try {
    const project = await db.project.findUnique({ where: { id } })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
        width: project.width,
        height: project.height,
        thumb: project.thumb,
        updatedAt: project.updatedAt,
        dataJson: project.data,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: `Failed to load project: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 })
  }
}

/** PUT /api/projects/[id] — overwrite project. Body: {name,width,height,data|dataJson,thumb} */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  try {
    const body = (await req.json()) as { name?: string; width?: number; height?: number; data?: string; dataJson?: string; thumb?: string }
    const data = body.data ?? body.dataJson
    if (!data || typeof data !== 'string') {
      return NextResponse.json({ error: 'Project data is required' }, { status: 400 })
    }
    if (data.length > 80 * 1024 * 1024) {
      return NextResponse.json({ error: 'Project is too large to save (80MB limit)' }, { status: 413 })
    }
    const existing = await db.project.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const project = await db.project.update({
      where: { id },
      data: {
        name: (body.name ?? 'Untitled').slice(0, 120),
        width: Math.max(1, Math.min(4096, Math.floor(body.width ?? 32))),
        height: Math.max(1, Math.min(4096, Math.floor(body.height ?? 32))),
        data,
        thumb: typeof body.thumb === 'string' ? body.thumb.slice(0, 500_000) : undefined,
      },
      select: { id: true, updatedAt: true },
    })
    return NextResponse.json({ id: project.id, updatedAt: project.updatedAt })
  } catch (e) {
    return NextResponse.json({ error: `Failed to update project: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 })
  }
}

/** DELETE /api/projects/[id] */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  try {
    await db.project.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: `Failed to delete project: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 })
  }
}
