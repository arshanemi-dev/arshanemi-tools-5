import { NextResponse } from 'next/server'
import { hubUnreachable } from '@/lib/connect'
import { getLiveTemplates, LIVE_TEMPLATES_PATH } from '@/lib/liveTemplates'

export const runtime = 'nodejs'

// The browser may hold on to the answer but has to check it's still current
// before using it — the ETag below is what it checks with.
const CACHE_CONTROL = 'private, no-cache'

// If-None-Match can list several tags, and a compressing proxy may have
// turned ours into a weak one (W/"...").
function matches(header, etag) {
  return !!header && header.split(',').some((tag) => tag.trim().replace(/^W\//, '') === etag)
}

// PUBLIC — no auth. The dashboard (works fully signed-out) reads this on mount
// to populate the Market Place picker + the sidebar with every live,
// sidebar-visible template and its config structure. proxy.js lets this
// through (not under /api/admin or /api/profit-loss). Served from the cache
// in lib/liveTemplates.js; a caller that already holds the current copy
// (If-None-Match) gets an empty 304 back instead of the whole config again.
// X-Cache says where the answer came from — 'stale' means the hub couldn't be
// reached and this is the last copy that was cached. With no copy to fall
// back on, a hub that can't be reached is a 503 with the reason — NOT an
// empty list, which the dashboard would show as "No marketplaces yet" while
// marketplaces do exist.
export async function GET(req) {
  try {
    const { value, state } = await getLiveTemplates()
    const headers = { 'Cache-Control': CACHE_CONTROL, ETag: value.etag, 'X-Cache': state }
    if (matches(req.headers.get('if-none-match'), value.etag)) {
      return new NextResponse(null, { status: 304, headers })
    }
    return new NextResponse(value.body, { headers: { ...headers, 'Content-Type': 'application/json' } })
  } catch (err) {
    const noStore = { 'Cache-Control': 'no-store' }
    // The hub answered, with an error of its own — passed on as it was.
    if (err?.status) return NextResponse.json(err.data, { status: err.status, headers: noStore })
    return NextResponse.json({ error: hubUnreachable(err, LIVE_TEMPLATES_PATH) }, { status: 503, headers: noStore })
  }
}
