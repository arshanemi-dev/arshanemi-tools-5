import { NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { proxyAdminCall, authHeaderFrom } from '@/lib/connect'

export const runtime = 'nodejs'

// Per-SKU default costs (COGS (Product Cost), Cost GST in, Final Product
// Cost, Other Expense (per order)). Thin proxy to the hub's
// profit_loss_sku_costs table, same idiom as ./settings/route.js. The hub
// validates every entry — this only checks there is something to forward.

export async function GET(req) {
  const payload = await getAuthPayload(req)
  if (!payload?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { status, data } = await proxyAdminCall('/api/profit-loss/sku-costs', { authHeader: authHeaderFrom(req) })
    return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Persistence service unavailable' }, { status: 503 })
  }
}

export async function PUT(req) {
  const payload = await getAuthPayload(req)
  if (!payload?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (!Array.isArray(body.costs) || !body.costs.length) {
    return NextResponse.json({ error: 'costs[] is required' }, { status: 400 })
  }
  try {
    const { status, data } = await proxyAdminCall('/api/profit-loss/sku-costs', {
      method: 'PUT',
      body: { costs: body.costs },
      authHeader: authHeaderFrom(req),
    })
    return NextResponse.json(data, { status })
  } catch {
    return NextResponse.json({ error: 'Persistence service unavailable' }, { status: 503 })
  }
}
