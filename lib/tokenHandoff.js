'use client'
// Cross-app SSO handoff — receiving half. Mirrors
// tools/barmeto-tools-1/lib/tokenHandoff.js: when this dashboard is opened
// inside the root admin panel's iframe, root appends its own session tokens
// as query params on the iframe src (it can't write to this origin's
// localStorage directly — different origin). This captures them into
// localStorage via lib/tokenStore.js so lib/connect.js's authHeaderFrom(req)
// picks them up on the next request the browser makes to this app's own
// /api/* routes, and forwards them on to root instead of a static service
// token — see lib/connect.js's proxyAdminCall.
//
// Runs at MODULE-EVALUATION time, not inside a React effect — plain
// top-level code in an ES module runs once, synchronously, the first time
// the module is imported, before any component in the same bundle chunk
// gets to render. Importing this file (for its side effect only) as early
// as possible — see context/ThemeContext.jsx, mounted for every page via
// app/layout.js — guarantees the tokens are already in localStorage before
// any auth check runs.
import { saveAuthTokens } from './tokenStore'

// Tokens in a URL are only ever trusted when this page is framed — and the
// frame-ancestors header in next.config.mjs lets nobody but the admin panel
// frame it. Opened directly (a link in a chat, an email, another site), the
// same params are ignored: otherwise anyone could send a link carrying THEIR
// OWN tokens, the visitor would silently be working inside the sender's
// account, and every sheet they then uploaded would auto-save into it.
function isEmbedded() {
  try {
    return window.self !== window.top
  } catch {
    return true // a cross-origin parent that blocks even the comparison is still a parent
  }
}

if (typeof window !== 'undefined') {
  const params = new URLSearchParams(window.location.search)
  const accessToken = params.get('lt_at')
  const refreshToken = params.get('lt_rt')

  if (accessToken || refreshToken || params.has('lt_u')) {
    if (accessToken && refreshToken && isEmbedded()) {
      let user = null
      const rawUser = params.get('lt_u')
      if (rawUser) {
        try { user = JSON.parse(rawUser) } catch { /* malformed payload — proceed without a cached user */ }
      }

      saveAuthTokens({ accessToken, refreshToken, expiresIn: 86400, user })
    }

    // Strip the handoff params — used or ignored — so the tokens never
    // linger in browser history or get reprocessed on a refresh/back-navigation.
    params.delete('lt_at')
    params.delete('lt_rt')
    params.delete('lt_u')
    const query = params.toString()
    const nextUrl = window.location.pathname + (query ? `?${query}` : '') + window.location.hash
    window.history.replaceState({}, '', nextUrl)
  }
}
