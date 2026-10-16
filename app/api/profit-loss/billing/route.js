import { NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { runServerBillingGate } from '@/lib/serverBilling'
import { PL_BILLING } from '@/data/billing'

export const runtime = 'nodejs'

// Coins for an upload — forwards one charge to the admin panel's own
// POST /api/wallet/deduct (lib/serverBilling.js, same as tools-4's export
// charge), which prices it from the Tools Catalog, cuts the coins and writes
// the coin history. The browser can't call the hub itself (another origin),
// so it comes through here. Only this tool's two upload features.
//
// POST { featureApiIdentifier, quantity, idempotencyKey }
//   → { ok: true, coinsCost, remainingCoins }
//   → 402 { status: 'blocked', reason, data } — BillingGateModal's shape
const FEATURES = [PL_BILLING.orderFeature, PL_BILLING.accountFeature]

export async function POST(req) {
  const payload = await getAuthPayload(req)
  if (!payload?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const quantity = Number(body.quantity)
  if (!FEATURES.includes(body.featureApiIdentifier) || !Number.isSafeInteger(quantity) || quantity < 1) {
    return NextResponse.json({ error: `featureApiIdentifier (${FEATURES.join(' / ')}) and a positive whole quantity are required` }, { status: 400 })
  }
  const idempotencyKey = typeof body.idempotencyKey === 'string' && body.idempotencyKey.length <= 255 ? body.idempotencyKey : undefined

  try {
    const gate = await runServerBillingGate(req, {
      toolSlug: PL_BILLING.toolSlug, featureApiIdentifier: body.featureApiIdentifier, quantity, idempotencyKey,
    })
    if (gate.status === 'proceed') return NextResponse.json({ ok: true, ...gate.data })
    return NextResponse.json({ status: 'blocked', reason: gate.reason, data: gate.data }, { status: 402 })
  } catch (err) {
    console.error('profit-loss upload charge failed:', err)
    return NextResponse.json({ error: 'Billing service unavailable' }, { status: 503 })
  }
}
