import { NextResponse } from 'next/server'
import { proxyAdminCall } from '@/lib/connect'

export const runtime = 'nodejs'

// PUBLIC — no auth. The dashboard (works fully signed-out) reads this on mount
// to populate the Market Place picker + the sidebar with every live,
// sidebar-visible template and its config structure. proxy.js lets this
// through (not under /api/admin or /api/profit-loss).
export async function GET() {
  try {
    const { status, data } = await proxyAdminCall('/api/marketplace-templates/live')
    return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ templates: [] }, { status: 200 })
  }
}
