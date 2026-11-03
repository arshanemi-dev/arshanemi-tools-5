import { NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { proxyAdminCall, authHeaderFrom } from '@/lib/connect'

export const runtime = 'nodejs'

// PATCH — rename a Marketplace x Brand entry (thin proxy to the hub).
// DELETE — remove it (thin proxy to the hub).

export async function PATCH(req, { params }) {
  const payload = await getAuthPayload(req)
  if (!payload?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  if (!body.marketplace || !body.brand) {
    return NextResponse.json({ error: 'marketplace and brand are required' }, { status: 400 })
  }
  try {
    const { status, data } = await proxyAdminCall(`/api/profit-loss/companies/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { marketplace: body.marketplace, brand: body.brand },
      authHeader: authHeaderFrom(req),
    })
    return NextResponse.json(data, { status })
  } catch {
    return NextResponse.json({ error: 'Persistence service unavailable' }, { status: 503 })
  }
}

export async function DELETE(req, { params }) {
  const payload = await getAuthPayload(req)
  if (!payload?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  try {
    const { status, data } = await proxyAdminCall(`/api/profit-loss/companies/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      authHeader: authHeaderFrom(req),
    })
    return NextResponse.json(data, { status })
  } catch {
    return NextResponse.json({ error: 'Persistence service unavailable' }, { status: 503 })
  }
}
