// Connected-mode proxy helpers. See CONNECT_MODE.md / .env.example for the full
// story. NEXT_PUBLIC_IS_CONNECT toggles whether /api/auth/* and /api/admin/* read
// and write against the root admin panel (barmeto-admin-pannels) instead of this
// app's own local Supabase — mirrors tools/barmeto-tools-1's identical flag.
export const IS_CONNECT = process.env.NEXT_PUBLIC_IS_CONNECT === 'true'

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || ''

// How long an auth call to the hub (proxyAuthCall) may take before it counts
// as failed. With no limit, a hub that had stopped answering (its dev server
// frozen, a dropped connection) left the request waiting for good — and the
// browser with it: the Sign In button just kept spinning. Past this the fetch
// throws, which the auth routes already turn into an error the page shows
// ("Authentication service unavailable"). Long enough for the slowest real
// auth call: a login that emails its OTP gives up on SMTP within ~40 s (the
// hub's lib/mailer.js). (proxyAdminCall keeps its own rule: reads time out,
// writes don't.)
export const HUB_TIMEOUT_MS = 45_000

// Pulls the caller's own bearer/cookie token off an incoming request so it can
// be forwarded as this same identity's Authorization header on the outbound
// call to root — same priority order as lib/auth.js's getAuthPayload (Bearer
// header, then the barmeto-token/admin-token cookies), since cookies don't
// cross origins on a server-to-server fetch.
export function authHeaderFrom(req) {
  const bearer = req.headers.get('Authorization')
  if (bearer?.startsWith('Bearer ')) return bearer
  const token = req.cookies.get('barmeto-token')?.value || req.cookies.get('admin-token')?.value
  return token ? `Bearer ${token}` : undefined
}

// Server-to-server admin CRUD calls (companies/users/tools/blogs/theme/generic
// collections & singletons). No static service token — forwards the actual
// caller's own identity via `authHeader` (build it with authHeaderFrom(req)),
// which resolves to a real root-issued token one of two ways: (1) this app's
// own cookie, when the caller logged in directly through /login (which
// proxies to root and stores root's issued token in that cookie — see
// app/api/auth/login/route.js), or (2) a Bearer header the browser attached
// from localStorage, populated by lib/tokenHandoff.js when this app is opened
// embedded in the root admin panel's iframe (root appends its session tokens
// as URL query params on the iframe src — same handoff tools-1 receives).
export async function proxyAdminCall(path, { method = 'GET', body, authHeader, ifNoneMatch, signal } = {}) {
  // A stalled hub must reach the dashboard's retry/error state. Writes retain
  // their existing semantics because a timeout doesn't tell us if they landed.
  const readTimeout = method === 'GET' ? AbortSignal.timeout(30_000) : null
  const requestSignal = signal && readTimeout ? AbortSignal.any([signal, readTimeout]) : signal || readTimeout || undefined
  const res = await fetch(`${ADMIN_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader ? { Authorization: authHeader } : {}),
      ...(ifNoneMatch ? { 'If-None-Match': ifNoneMatch } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
    signal: requestSignal,
  })
  // A failed call whose body isn't JSON (e.g. the hub's dev server serving
  // an HTML compile-error page) still gets an `error` the UI can show.
  const data = res.status === 304 ? null : await res.json().catch(() => (res.ok ? {} : { error: `Admin hub returned HTTP ${res.status} (not JSON)` }))
  return { ok: res.ok, status: res.status, data, etag: res.headers.get('etag') }
}

// When proxyAdminCall throws, the hub was never reached (or dropped the
// connection) — e.g. its dev server is restarting or recompiling. Logs the
// real cause here and returns a message that says so, instead of a bare
// "service unavailable" that hides why a save failed.
export function hubUnreachable(err, path) {
  // A timed-out fetch is a DOMException whose `code` is the legacy number 23 — say what happened instead.
  const code = err?.name === 'TimeoutError' ? 'timed out' : err?.cause?.code || err?.code || err?.name || 'error'
  console.error(`[connect] ${path} → ${ADMIN_URL || '(NEXT_PUBLIC_ADMIN_API_URL unset)'} failed: ${code}`, err?.cause || err)
  return `Can't reach the admin hub at ${ADMIN_URL || '(NEXT_PUBLIC_ADMIN_API_URL unset)'} (${code}) — it may be restarting. Try again in a moment.`
}

// Auth calls (login/refresh/me/change-password/...) — forwards the request as-is
// and returns root's response verbatim, so root's accessToken/refreshToken/user
// pass straight through to the browser unchanged. `authHeader` forwards the
// caller's own bearer token for already-authenticated calls (me, change-password).
export async function proxyAuthCall(path, { method = 'POST', body, authHeader, timeoutMs = HUB_TIMEOUT_MS } = {}) {
  const res = await fetch(`${ADMIN_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}
