import { NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { proxyAdminCall, authHeaderFrom } from '@/lib/connect'
import { KNOWN_REASONS } from '@/lib/serverBilling'

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

// POST — SAVE a run. The hub charges for it (1 coin per 100 parsed rows)
// inside the same route that stores it, so the charge can't be skipped by
// calling the hub directly; this route only forwards the run and turns a
// billing refusal into the shape BillingGateModal renders.
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
        rowCount: Math.floor(Number(body.rowCount)),
        summary: body.summary,
        skuRows: body.skuRows,
        sourceFiles: Array.isArray(body.sourceFiles) ? body.sourceFiles : [],
      },
      authHeader: authHeaderFrom(req),
    })

    if (data?.billing || data?.error === 'access_denied') {
      const reason = KNOWN_REASONS.includes(data.error) ? data.error : 'error'
      return NextResponse.json(
        { status: 'blocked', reason, data: { ...data, message: data.error, toolSlug: TOOL_SLUG, featureApiIdentifier: SAVE_FEATURE } },
        { status: 402 },
      )
    }
    return NextResponse.json(data, { status: status === 200 ? 201 : status })
  } catch (err) {
    console.error('profit-loss history save failed:', err)
    return NextResponse.json({ error: 'Failed to save history' }, { status: 500 })
  }
}
