import { NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { proxyAdminCall, authHeaderFrom } from '@/lib/connect'

export const runtime = 'nodejs'

export async function GET(req, { params }) {
  const payload = await getAuthPayload(req)
  if (!payload?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    const { status, data } = await proxyAdminCall(
      `/api/profit-loss/history/${encodeURIComponent(id)}`,
      { authHeader: authHeaderFrom(req) },
    )
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
    const { status, data } = await proxyAdminCall(
      `/api/profit-loss/history/${encodeURIComponent(id)}`,
      { method: 'DELETE', authHeader: authHeaderFrom(req) },
    )
    return NextResponse.json(data, { status })
  } catch {
    return NextResponse.json({ error: 'Persistence service unavailable' }, { status: 503 })
  }
}
