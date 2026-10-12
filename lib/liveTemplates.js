import { createHash } from 'node:crypto'
import { after } from 'next/server'
import { cached, invalidate } from '@/lib/cache'
import { proxyAdminCall } from '@/lib/connect'
import { env } from '@/lib/env'

// The dashboard's templates (Global Settings' live version + every
// marketplace's config) as the hub's public /live endpoint returns them —
// read on every dashboard load, changed only when someone saves or publishes
// in Template Settings. Cached (lib/cache.js) so a load normally costs no
// hub round trip: past the TTL the cached copy is still what's answered
// with, while the hub is asked in the background. Every write this app
// forwards to the hub's /api/marketplace-templates/* calls
// invalidateLiveTemplates(); the load after that waits for the hub.

export const LIVE_TEMPLATES_PATH = '/api/marketplace-templates/live'

// The cache key names the hub the templates were read from (a short hash of
// its URL): two copies of this app that share a Redis but not a hub —
// `npm run dev` pointed at production's Redis, a staging deployment — would
// otherwise hand each other their own templates.
const HUB = createHash('sha256').update(process.env.NEXT_PUBLIC_ADMIN_API_URL || '').digest('hex').slice(0, 8)
const NS = `live-templates:${HUB}`
// How long the last good copy stays available for when the hub can't be reached.
const KEEP_SECONDS = 24 * 60 * 60

// The hub's own /live answers 200 with an empty global config and/or an
// empty list when ITS database read fails, which can't be told apart from a
// dashboard nobody has set up yet. Neither is stored: caching the first would
// blank every seller's dashboard for the whole TTL, and the second has
// nothing worth caching.
function isSetUp(data) {
  const global = data?.global
  return Array.isArray(data?.templates) && data.templates.length > 0
    && ((global?.tabs?.length || 0) + (global?.overviewTabs?.length || 0)) > 0
}

async function loadFromHub() {
  const { ok, status, data } = await proxyAdminCall(LIVE_TEMPLATES_PATH)
  if (!ok) throw Object.assign(new Error(data?.error || `Admin hub returned HTTP ${status}`), { status, data })
  const body = JSON.stringify(data)
  return { body, etag: `"${createHash('sha1').update(body).digest('base64url')}"`, setUp: isSetUp(data) }
}

// → { value: { body, etag }, state } — `body` is the JSON text to send on,
// `etag` identifies it, `state` is lib/cache.js's 'hit' | 'refreshing' |
// 'miss' | 'stale'. Throws when the hub can't be reached (or answers with an
// error — then the error carries the hub's own `status` + `data`) and
// nothing is cached. Call it from a request (it uses next/server's `after`).
export function getLiveTemplates() {
  return cached(
    NS,
    { ttl: env.TEMPLATES_CACHE_TTL, keep: KEEP_SECONDS, cacheable: (value) => value.setUp, afterResponse: after },
    loadFromHub,
  )
}

export function invalidateLiveTemplates() {
  return invalidate(NS)
}
