import { NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/lib/auth'
import { proxyAdminCall, authHeaderFrom } from '@/lib/connect'

export const runtime = 'nodejs'

// master_admin only — powers TemplateAccessPanel's per-user list. Proxies to
// the hub's own /api/admin/users rather than duplicating a user directory.
export async function GET(req) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { status, data } = await proxyAdminCall('/api/admin/users', { authHeader: authHeaderFrom(req) })
  return NextResponse.json(data, { status })
}
