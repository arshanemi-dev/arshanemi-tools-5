import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { getAuthPayload } from '@/lib/auth'
import { proxyAdminCall, authHeaderFrom } from '@/lib/connect'
import { runServerBillingGate } from '@/lib/serverBilling'

export const runtime = 'nodejs'

const TOOL_SLUG = 'profit-loss'
const SAVE_FEATURE = 'pl-save-history'

// GET — list this user's saved runs (paginated, newest first).
export async function GET(req) {
  const payload = await getAuthPayload(req)
  if (!payload?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const forward = new URLSearchParams()
  for (const key of ['limit', 'cursor']) {
    const v = sp.get(key)
    if (v) forward.set(key, v)
  }
  const qs = forward.toString()
  try {
    const { status, data } = await proxyAdminCall(`/api/profit-loss/history${qs ? `?${qs}` : ''}`, {
      authHeader: authHeaderFrom(req),
    })
    return NextResponse.json(data, { status })
  } catch {
    return NextResponse.json({ error: 'Persistence service unavailable' }, { status: 503 })
  }
}

// POST — SAVE a run. Billing gate is here: 1 coin per 100 parsed rows.
export async function POST(req) {
  const payload = await getAuthPayload(req)
  if (!payload?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (
    typeof body.summary !== 'object' || body.summary == null ||
    !Array.isArray(body.skuRows) ||
    !Array.isArray(body.platforms) ||
    !Number.isFinite(Number(body.rowCount)) || Number(body.rowCount) < 0
  ) {
    return NextResponse.json({ error: 'summary{}, skuRows[], platforms[] and rowCount are required' }, { status: 400 })
  }

  const rowCount = Math.floor(Number(body.rowCount))
  const quantity = Math.max(1, Math.ceil(rowCount / 100))
  const idempotencyKey = createHash('sha1')
    .update([payload.userId, (body.platforms || []).join(','), body.dateFrom, body.dateTo, rowCount].join('|'))
    .digest('hex')

  const gate = await runServerBillingGate(req, {
    toolSlug: TOOL_SLUG,
    featureApiIdentifier: SAVE_FEATURE,
    quantity,
    idempotencyKey,
  })
  if (gate.status === 'blocked') {
    return NextResponse.json(gate, { status: 402 })
  }

  const coinsCharged = gate.data?.coinsCost ?? quantity

  try {
    const { status, data } = await proxyAdminCall('/api/profit-loss/history', {
      method: 'POST',
      body: {
        label: body.label ? String(body.label).slice(0, 255) : null,
        platforms: body.platforms,
        dateFrom: body.dateFrom || null,
        dateTo: body.dateTo || null,
        adsMode: body.adsMode || null,
        adsValue: body.adsValue ?? null,
        rowCount,
        coinsCharged,
        summary: body.summary,
        skuRows: body.skuRows,
        sourceFiles: Array.isArray(body.sourceFiles) ? body.sourceFiles : [],
      },
      authHeader: authHeaderFrom(req),
    })
    return NextResponse.json({ ...data, coinsCharged }, { status: status === 200 ? 201 : status })
  } catch (err) {
    console.error('profit-loss history save failed:', err)
    return NextResponse.json({ error: 'Failed to save history' }, { status: 500 })
  }
}
