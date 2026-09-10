import { NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/lib/auth'
import { proxyAdminCall, authHeaderFrom } from '@/lib/connect'

export const runtime = 'nodejs'

// master_admin only, both verbs — powers TemplateAccessPanel. The per-user
// grant lives on the hub; this forwards the caller's own token and lets the
// hub re-check + persist. Mirrors tools-4's admin/listing-template-access.
export async function GET(req) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { status, data } = await proxyAdminCall('/api/admin/marketplace-template-access', {
    authHeader: authHeaderFrom(req),
  })
  return NextResponse.json(data, { status })
}

// Body: { [userId]: boolean }
export async function PUT(req) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const { status, data } = await proxyAdminCall('/api/admin/marketplace-template-access', {
    method: 'PUT',
    body,
    authHeader: authHeaderFrom(req),
  })
  return NextResponse.json(data, { status })
}
