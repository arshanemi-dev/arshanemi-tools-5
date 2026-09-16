import { NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { proxyAdminCall, authHeaderFrom } from '@/lib/connect'

export const runtime = 'nodejs'

// Automatic (free, unmetered) per-row persistence — thin proxy to the hub's
// profit_loss_extracted_rows table. Distinct from ./history/route.js, which
// stays the deliberate, coin-metered "Save to History" snapshot.

export async function GET(req) {
  const payload = await getAuthPayload(req)
  if (!payload?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const qs = new URLSearchParams()
  for (const key of ['page', 'limit']) {
    const v = sp.get(key)
    if (v) qs.set(key, v)
  }
  try {
    const { status, data } = await proxyAdminCall(`/api/profit-loss/rows?${qs}`, { authHeader: authHeaderFrom(req) })
    return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Persistence service unavailable' }, { status: 503 })
  }
}

export async function POST(req) {
  const payload = await getAuthPayload(req)
  if (!payload?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (!Array.isArray(body.rows) || !body.rows.length) {
    return NextResponse.json({ error: 'rows[] is required' }, { status: 400 })
  }
  try {
    const { status, data } = await proxyAdminCall('/api/profit-loss/rows', {
      method: 'POST',
      body: { rows: body.rows },
      authHeader: authHeaderFrom(req),
    })
    return NextResponse.json(data, { status })
  } catch {
    return NextResponse.json({ error: 'Persistence service unavailable' }, { status: 503 })
  }
}

// DELETE — debug-only: wipes every saved row for the caller. See the Sheet
// Debugger's "Delete All Saved Data" button.
export async function DELETE(req) {
  const payload = await getAuthPayload(req)
  if (!payload?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { status, data } = await proxyAdminCall('/api/profit-loss/rows', {
      method: 'DELETE',
      authHeader: authHeaderFrom(req),
    })
    return NextResponse.json(data, { status })
  } catch {
    return NextResponse.json({ error: 'Persistence service unavailable' }, { status: 503 })
  }
}
