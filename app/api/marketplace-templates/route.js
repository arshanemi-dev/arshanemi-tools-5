import { NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { proxyAdminCall, authHeaderFrom } from '@/lib/connect'

export const runtime = 'nodejs'

// Marketplace dashboard templates — thin proxy to the hub. Same
// forward-the-caller's-own-token idiom as /api/profit-loss/settings. The hub
// owns every rule (ownership, the build grant, version numbering, publish).
//
//   GET  /api/marketplace-templates[?scope=all]  → { templates }
//   POST /api/marketplace-templates              → { template, version }

export async function GET(req) {
  const payload = await getAuthPayload(req)
  if (!payload?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { status, data } = await proxyAdminCall(`/api/marketplace-templates${req.nextUrl.search}`, {
      authHeader: authHeaderFrom(req),
    })
    return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Template service unavailable' }, { status: 503 })
  }
}

export async function POST(req) {
  const payload = await getAuthPayload(req)
  if (!payload?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  try {
    const { status, data } = await proxyAdminCall('/api/marketplace-templates', {
      method: 'POST',
      body,
      authHeader: authHeaderFrom(req),
    })
    return NextResponse.json(data, { status })
  } catch {
    return NextResponse.json({ error: 'Template service unavailable' }, { status: 503 })
  }
}
