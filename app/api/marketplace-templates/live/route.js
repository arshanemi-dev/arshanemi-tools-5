import { NextResponse } from 'next/server'
import { proxyAdminCall, hubUnreachable } from '@/lib/connect'

export const runtime = 'nodejs'

// PUBLIC — no auth. The dashboard (works fully signed-out) reads this on mount
// to populate the Market Place picker + the sidebar with every live,
// sidebar-visible template and its config structure. proxy.js lets this
// through (not under /api/admin or /api/profit-loss). A hub that can't be
// reached is a 503 with the reason — NOT an empty list, which the dashboard
// would show as "No marketplaces yet" while marketplaces do exist.
export async function GET() {
  try {
    const { status, data } = await proxyAdminCall('/api/marketplace-templates/live')
    return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return NextResponse.json({ error: hubUnreachable(err, '/api/marketplace-templates/live') }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
