import { gzipSync, gunzipSync } from 'node:zlib'
import { Redis } from 'ioredis'
import { env } from '@/lib/env'

// Server-side cache for hub data that is read far more often than it changes
// (today: the dashboard's live templates — lib/liveTemplates.js). Kept in
// Redis when REDIS_URL is set, so every instance of this app shares one copy;
// in this process's own memory otherwise.
//
// Each namespace has a generation number. A write to the hub bumps it
// (invalidate), and an entry only counts while it carries the current one —
// so a read that was already on its way to the hub when the write landed
// can't put the old data back afterwards. The TTL is only the safety net for
// a change that never passes through this app (a direct database edit): past
// it the hub is asked again, in the background where the caller allows it.
//
// A cache that can't be reached is never an error for the caller: reads go
// straight to `load`, writes and invalidations are dropped (the TTL covers a
// dropped invalidation), and Redis is left alone for RETRY_AFTER_MS so a dead
// server costs one timeout, not one per request.

const PREFIX = `cache:${env.TOOLS_NAME}`
const RETRY_AFTER_MS = 30_000
// Without Redis, another instance of this app never hears about this one's
// invalidations — so its copy is trusted only this long, whatever TTL is asked.
const MEMORY_MAX_TTL = 15

// On globalThis, not module scope: each route can be bundled with its own
// copy of this module, and the route that invalidates has to reach the same
// memory (and reuse the same Redis connection) as the route that reads.
const state = (globalThis.__barmetoCache ??= { memory: new Map(), loading: new Map(), redis: null, retryAt: 0 })

function redisClient() {
  if (Date.now() < state.retryAt) return null
  if (!state.redis) {
    state.redis = new Redis(env.REDIS_URL, {
      protocol: 2, // RESP2 — also spoken by Redis servers older than 6
      connectTimeout: 2000,
      // Also bounds a command waiting for the connection. Generous on
      // purpose: against a hosted Redis a write is occasionally well over a
      // second, and a timeout here is read as "Redis is down" (redisFailed).
      commandTimeout: 3000,
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt) => Math.min(attempt * 500, 10_000),
    })
    // Without a listener ioredis prints every reconnect failure itself; a
    // failed command is reported once per outage by redisFailed below.
    state.redis.on('error', () => {})
  }
  return state.redis
}

function redisFailed(err) {
  // The server answered, with an error of its own (a value over its size
  // limit, say): it is up, there is no outage to wait out.
  if (err?.name === 'ReplyError') {
    console.error(`[cache] Redis refused a command: ${err.message}`)
    return
  }
  state.retryAt = Date.now() + RETRY_AFTER_MS
  console.error(`[cache] Redis unavailable (${err?.message || err}) — bypassing the cache for ${RETRY_AFTER_MS / 1000}s`)
}

const genKey = (ns) => `${PREFIX}:${ns}:gen`
const dataKey = (ns) => `${PREFIX}:${ns}:data`

// Entries go to Redis gzipped: template configs are repetitive JSON, and over
// the network the time a read takes is the bytes moved — a small fraction as
// many this way, for a few ms of CPU. Anything still larger than this is
// simply not cached.
const MAX_STORED_BYTES = 4 * 1024 * 1024
const pack = (entry) => gzipSync(JSON.stringify(entry))
function unpack(raw) {
  if (!raw) return null
  try {
    return JSON.parse(gunzipSync(raw).toString())
  } catch {
    return null // not something this code stored — treated as nothing cached
  }
}

// → { gen, entry } (entry null when nothing is stored), or null when the
// cache can't be used right now.
async function read(ns) {
  if (!env.REDIS_URL) {
    const held = state.memory.get(ns)
    return { gen: held?.gen ?? 0, entry: held && Date.now() < held.until ? held.entry : null }
  }
  const client = redisClient()
  if (!client) return null
  try {
    const [gen, raw] = await client.mgetBuffer(genKey(ns), dataKey(ns))
    return { gen: Number(gen?.toString()) || 0, entry: unpack(raw) }
  } catch (err) {
    redisFailed(err)
    return null
  }
}

async function write(ns, entry, keepSeconds) {
  if (!env.REDIS_URL) {
    state.memory.set(ns, { gen: state.memory.get(ns)?.gen ?? 0, entry, until: Date.now() + keepSeconds * 1000 })
    return
  }
  const client = redisClient()
  if (!client) return
  const body = pack(entry)
  if (body.length > MAX_STORED_BYTES) return
  try {
    await client.set(dataKey(ns), body, 'EX', keepSeconds)
  } catch (err) {
    redisFailed(err)
  }
}

// Call after anything that may have changed what `ns` holds.
export async function invalidate(ns) {
  if (!env.REDIS_URL) {
    const held = state.memory.get(ns)
    state.memory.set(ns, { ...held, gen: (held?.gen ?? 0) + 1 })
    return
  }
  const client = redisClient()
  if (!client) return
  try {
    await client.incr(genKey(ns))
  } catch (err) {
    redisFailed(err)
  }
}

// The value for `ns`, from the cache while its entry still counts, from
// `load()` otherwise. → { value, state }:
//   'hit'         served from the cache
//   'refreshing'  served from the cache past its TTL (nothing is known to
//                 have changed); a fresh copy is being loaded for the next caller
//   'miss'        just loaded
//   'stale'       `load` failed, so this is the last value that was cached
// Throws what `load` threw when there is nothing cached to fall back on.
//   ttl            seconds an entry counts as current
//   keep           seconds it is kept beyond that — what 'refreshing' and 'stale' answer with
//   cacheable      (value) => false for a loaded value that must not be stored
//   afterResponse  next/server's `after`. Given it, an entry past its TTL is
//                  answered at once and reloaded once the response is out;
//                  without it the caller waits for the reload. An entry
//                  dropped by invalidate() is never answered this way.
export async function cached(ns, { ttl, keep = 0, cacheable = () => true, afterResponse }, load) {
  const found = await read(ns)
  const entry = found?.entry ?? null
  const current = !!entry && entry.gen === found.gen
  const currentFor = (env.REDIS_URL ? ttl : Math.min(ttl, MEMORY_MAX_TTL)) * 1000
  if (current && Date.now() - entry.at < currentFor) return { value: entry.value, state: 'hit' }

  // A burst of misses shares one load — per generation, so a request that
  // arrives after an invalidation never joins a load that started before it.
  const flight = `${ns}:${found?.gen}`
  let loading = state.loading.get(flight)
  if (!loading) {
    loading = (async () => {
      const value = await load()
      if (found && cacheable(value)) await write(ns, { gen: found.gen, at: Date.now(), value }, ttl + keep)
      return value
    })().finally(() => state.loading.delete(flight))
    loading.catch(() => {}) // a failed load nobody is waiting on is not an unhandled rejection
    state.loading.set(flight, loading)
  }

  if (current && afterResponse) {
    afterResponse(() => loading.catch(() => {}))
    return { value: entry.value, state: 'refreshing' }
  }

  try {
    return { value: await loading, state: 'miss' }
  } catch (err) {
    if (entry) return { value: entry.value, state: 'stale' }
    throw err
  }
}
