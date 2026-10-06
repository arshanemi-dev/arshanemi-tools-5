import { NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET)
// title-card/graph/table calculation (resolveTemplate/resolveTransactionRows)
// runs entirely client-side now — no server compute route to expose here.
// Every /api/profit-loss/* route is real per-user persistence and stays gated.
const PUBLIC_PATHS = ['/api/auth/login']

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3001').split(',').map((o) => o.trim())

function setCorsHeaders(res, origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  res.headers.set('Access-Control-Allow-Origin', allowed)
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.headers.set('Access-Control-Allow-Credentials', 'true')
  res.headers.set('Vary', 'Origin')
}

export async function proxy(req) {
  const { pathname } = req.nextUrl
  const origin = req.headers.get('origin') || ''

  // Handle CORS preflight for all API routes
  if (req.method === 'OPTIONS' && pathname.startsWith('/api/')) {
    const res = new NextResponse(null, { status: 204 })
    setCorsHeaders(res, origin)
    return res
  }

  const isAdminPath = pathname.startsWith('/api/admin')
  // The /profit-loss page itself is NOT login-gated (see app/profit-loss/page.js
  // and lib/authGate.js) — anyone can upload sheets and see the dashboard with
  // no account. "requires auth" here only still means something for
  // /api/profit-loss/* (always a real 401 below, same as any other protected
  // API) and /api/admin/*.
  const isProfitLossApi = pathname.startsWith('/api/profit-loss')
  const requiresAuth = isAdminPath || isProfitLossApi

  // Non-admin API routes (e.g. /api/auth/*) and the standalone auth pages
  // (/login, ...): inject CORS headers where relevant and pass
  // through, but still stamp x-pathname so the root layout can tell these
  // full-bleed auth screens apart from regular public pages and skip the
  // site Header/Footer for them.
  if (!requiresAuth) {
    const res = NextResponse.next()
    res.headers.set('x-pathname', pathname)
    if (pathname.startsWith('/api/')) setCorsHeaders(res, origin)
    return res
  }

  // Theme is read by the public site (ThemeContext) for every visitor, so GET
  // must be readable without an admin session — PUT/DELETE still require auth.
  const isPublicThemeGet = pathname === '/api/admin/theme' && req.method === 'GET'
  const isPublic = isPublicThemeGet || PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  if (isPublic) {
    const res = NextResponse.next()
    res.headers.set('x-pathname', pathname)
    setCorsHeaders(res, origin)
    return res
  }

  // Any authenticated role (master_admin / admin / user) gets an
  // 'barmeto-token' cookie on login; only master_admin additionally gets
  // 'admin-token'. Structural access to these paths is granted to any
  // logged-in role here — the layout and API routes below decide what each
  // role can actually see/do, same defense-in-depth pattern already used
  // elsewhere.
  const cookieToken = req.cookies.get('admin-token')?.value || req.cookies.get('barmeto-token')?.value
  // The cross-app SSO handoff's `lt_at` URL param (see lib/tokenHandoff.js) is deliberately NOT
  // accepted here. It used to be stamped into a session cookie on first sight, back when page
  // navigations were login-gated — but only /api/* reaches this point now, and no real client
  // ever calls an API with a token in its URL. All it still did was let a crafted link
  // (/api/profit-loss/...?lt_at=<someone else's token>) sign a visitor into that other account.
  // Every actual dashboard data call (SessionManager's fetch interceptor,
  // lib/tokenStore.js's authFetch) authenticates with this header, not a
  // cookie — it's the one channel guaranteed to work regardless of
  // third-party cookie policy (see components/admin/SessionManager.jsx).
  // Without also trusting it here, every /api/listing-tools/* and
  // /api/admin/* call made *after* the initial page load 401'd at this
  // middleware before ever reaching the route handler below (which already
  // accepts this same header via lib/auth.js's getAuthPayload) — even
  // though the visitor had a perfectly valid, currently-working token.
  const bearer = req.headers.get('Authorization')
  const bearerToken = !cookieToken && bearer?.startsWith('Bearer ') ? bearer.slice(7) : null
  const token = cookieToken || bearerToken
  const isApi = pathname.startsWith('/api/')

  // No token, or (below) an invalid/expired one, on a page navigation: this
  // used to hard-redirect straight to /login — but this app has no page
  // that requires being signed in just to look at it (see
  // app/listing-tools/layout.js), and a full-page navigation has no way to
  // run the client-side silent-refresh flow SessionManager already does for
  // API calls. That made every access-token expiry (1 day) or missed SSO
  // handoff bounce a page-reload straight to /login even when the visitor
  // had a perfectly good refreshable session — now it renders through, and
  // only an actual authenticated action shows the shared login-required
  // modal (an unauthenticated /api/* call still 401s immediately below,
  // same as before — that's what the modal reacts to).
  if (!token) {
    if (isApi) {
      const res = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      setCorsHeaders(res, origin)
      return res
    }
    const res = NextResponse.next()
    res.headers.set('x-pathname', pathname)
    setCorsHeaders(res, origin)
    return res
  }

  try {
    const { payload } = await jwtVerify(token, SECRET)
    const res = NextResponse.next()
    // Percent-encoded: a header value can only hold Latin-1, so a name in Hindi / Gujarati / any
    // other script made this line throw — and the catch below turned a valid session into a 401
    // on every save and load.
    res.headers.set('X-Admin-User', encodeURIComponent(payload.name ?? ''))
    res.headers.set('x-pathname', pathname)
    setCorsHeaders(res, origin)
    return res
  } catch {
    if (isApi) {
      const res = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      setCorsHeaders(res, origin)
      return res
    }
    const res = NextResponse.next()
    res.headers.set('x-pathname', pathname)
    setCorsHeaders(res, origin)
    return res
  }
}

export const config = {
  matcher: ['/profit-loss/:path*', '/api/:path*', '/login', '/forgot-password', '/reset-password'],
}
