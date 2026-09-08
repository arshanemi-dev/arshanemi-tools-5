import { NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { proxyAdminCall, authHeaderFrom } from '@/lib/connect'

export const runtime = 'nodejs'

// Per-user "My Details" — the saved column list + preferences. Thin proxy to
// the hub's profit_loss_settings table (same forward-the-caller's-own-token
// idiom as tools-4's /api/listing-tools/history).

export async function GET(req) {
  const payload = await getAuthPayload(req)
  if (!payload?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { status, data } = await proxyAdminCall('/api/profit-loss/settings', { authHeader: authHeaderFrom(req) })
    return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Persistence service unavailable' }, { status: 503 })
  }
}

export async function PUT(req) {
  const payload = await getAuthPayload(req)
  if (!payload?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (!Array.isArray(body.headers) || typeof body.preferences !== 'object' || body.preferences == null) {
    return NextResponse.json({ error: 'headers[] and preferences{} are required' }, { status: 400 })
  }
  try {
    const { status, data } = await proxyAdminCall('/api/profit-loss/settings', {
      method: 'PUT',
      body: { headers: body.headers, preferences: body.preferences },
      authHeader: authHeaderFrom(req),
    })
    return NextResponse.json(data, { status })
  } catch {
    return NextResponse.json({ error: 'Persistence service unavailable' }, { status: 503 })
  }
}
