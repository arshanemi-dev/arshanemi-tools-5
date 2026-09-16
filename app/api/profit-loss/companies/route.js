import { NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { proxyAdminCall, authHeaderFrom } from '@/lib/connect'

export const runtime = 'nodejs'

// Per-user Marketplace x Brand -> Company list. Thin proxy to the hub's
// market_place_companies table, same idiom as ./settings/route.js.

export async function GET(req) {
  const payload = await getAuthPayload(req)
  if (!payload?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { status, data } = await proxyAdminCall('/api/profit-loss/companies', { authHeader: authHeaderFrom(req) })
    return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Persistence service unavailable' }, { status: 503 })
  }
}

export async function POST(req) {
  const payload = await getAuthPayload(req)
  if (!payload?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (!body.marketplace || !body.brand) {
    return NextResponse.json({ error: 'marketplace and brand are required' }, { status: 400 })
  }
  try {
    const { status, data } = await proxyAdminCall('/api/profit-loss/companies', {
      method: 'POST',
      body: { marketplace: body.marketplace, brand: body.brand },
      authHeader: authHeaderFrom(req),
    })
    return NextResponse.json(data, { status })
  } catch {
    return NextResponse.json({ error: 'Persistence service unavailable' }, { status: 503 })
  }
}
