import { NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { proxyAdminCall, authHeaderFrom } from '@/lib/connect'

export const runtime = 'nodejs'

// Catch-all thin proxy for every authed sub-path of /api/marketplace-templates:
//   /[id]  ·  /[id]/versions  ·  /[id]/versions/[vid]  ·
//   /[id]/versions/[vid]/publish  ·  /[id]/logs  ·  /access/me
// (/api/marketplace-templates itself and /live have their own route files.)
// Auth is checked here (401); the hub owns ownership + the build grant (403).

async function forward(req, params, method) {
  const payload = await getAuthPayload(req)
  if (!payload?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { path } = await params
  const segs = Array.isArray(path) ? path.map(encodeURIComponent).join('/') : ''
  const target = `/api/marketplace-templates/${segs}${req.nextUrl.search}`
  const body = method === 'GET' || method === 'DELETE' ? undefined : await req.json().catch(() => ({}))

  try {
    const { status, data } = await proxyAdminCall(target, {
      method,
      body,
      authHeader: authHeaderFrom(req),
    })
    return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Template service unavailable' }, { status: 503 })
  }
}

export const GET = (req, ctx) => forward(req, ctx.params, 'GET')
export const POST = (req, ctx) => forward(req, ctx.params, 'POST')
export const PUT = (req, ctx) => forward(req, ctx.params, 'PUT')
export const PATCH = (req, ctx) => forward(req, ctx.params, 'PATCH')
export const DELETE = (req, ctx) => forward(req, ctx.params, 'DELETE')
