import { NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/lib/auth'
import { proxyAdminCall, authHeaderFrom } from '@/lib/connect'

export const runtime = 'nodejs'

// master_admin only — lets TemplateAccessPanel show which company each user
// belongs to. Proxies to the hub's own /api/admin/companies.
export async function GET(req) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { status, data } = await proxyAdminCall('/api/admin/companies', { authHeader: authHeaderFrom(req) })
  return NextResponse.json(data, { status })
}
