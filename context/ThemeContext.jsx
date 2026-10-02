'use client'

import '@/lib/tokenHandoff' // side effect only — must run before any auth check below

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import { defaultTheme } from '@/data/defaultTheme'

// Same key the anti-FOUC inline <Script id="theme-init"> in app/layout.js
// reads before hydration — must match, or that script never finds this
// provider's cached theme and always falls back to the hardcoded dark theme
// for a flash before this effect runs.
const THEME_CACHE_KEY = 'barmeto-theme-config'
const THEME_CACHE_TTL = 10 * 60 * 1000 // 10 min

const ThemeContext = createContext({ theme: 'light', siteTheme: defaultTheme })

// The cached theme (still within its TTL), or null. Same object back while
// the stored string is unchanged — useSyncExternalStore needs a stable value.
let cachedThemeMemo = { raw: undefined, data: null }
function readCachedTheme() {
  let raw = null
  try { raw = localStorage.getItem(THEME_CACHE_KEY) } catch {}
  if (raw !== cachedThemeMemo.raw) {
    let data = null
    try {
      const parsed = JSON.parse(raw)
      if (parsed && Date.now() - parsed.ts < THEME_CACHE_TTL && parsed.data?.mode) data = parsed.data
    } catch {}
    cachedThemeMemo = { raw, data }
  }
  return cachedThemeMemo.data
}
const noSubscribe = () => () => {}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return isNaN(r) ? null : `${r}, ${g}, ${b}`
}

function applyColors(colors) {
  const root = document.documentElement
  Object.entries(colors).forEach(([key, val]) => {
    root.style.setProperty(`--color-${key}`, val)
  })
  const rgb = (k) => colors[k] && hexToRgb(colors[k])
  if (rgb('accent'))        root.style.setProperty('--color-accent-rgb', rgb('accent'))
  if (rgb('accent-light'))  root.style.setProperty('--color-accent-light-rgb', rgb('accent-light'))
  if (rgb('accent-vivid'))  root.style.setProperty('--color-accent-vivid-rgb', rgb('accent-vivid'))
  if (rgb('cyan'))          root.style.setProperty('--color-cyan-rgb', rgb('cyan'))
}

const SYSTEM_FONT_STACK = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif'

function applyTypography(typography) {
  if (!typography) return
  const root = document.documentElement
  if (typography.fontFamily) {
    const f = typography.fontFamily
    if (f === 'System') {
      root.style.setProperty('--font-sans', SYSTEM_FONT_STACK)
    } else {
      root.style.setProperty('--font-sans', `${f}, ui-sans-serif, system-ui, -apple-system, sans-serif`)
      if (f !== 'Inter') {
        const id = `gf-${f.replace(/\s+/g, '-').toLowerCase()}`
        if (!document.getElementById(id)) {
          const link = document.createElement('link')
          link.id = id
          link.rel = 'stylesheet'
          link.href = `https://fonts.googleapis.com/css2?family=${f.replace(/\s+/g, '+')}:wght@300;400;500;600;700;800&display=swap`
          document.head.appendChild(link)
        }
      }
    }
  }
  if (typography.scale != null) {
    root.style.setProperty('--si-font-scale', String(typography.scale))
  }
}

function applyBorderRadius(borderRadius) {
  if (!borderRadius) return
  Object.entries(borderRadius).forEach(([k, v]) => {
    if (k === 'preset') return
    const cssKey = k === 'base' ? '--radius' : `--radius-${k}`
    document.documentElement.style.setProperty(cssKey, v)
  })
}

function applyFullTheme(siteTheme) {
  const mode = siteTheme.mode || 'light'
  const colors = siteTheme[mode] || siteTheme.dark || {}
  document.documentElement.setAttribute('data-theme', mode)
  applyColors(colors)
  applyTypography(siteTheme.typography)
  applyBorderRadius(siteTheme.borderRadius)
}

export function ThemeProvider({ children }) {
  // Context value: the freshly fetched theme once it lands, else the cached
  // one, else the defaults. The cache is read hydration-safely (null on the
  // server and during hydration, then the stored value), so nothing has to
  // be copied into state from an effect.
  const cachedTheme = useSyncExternalStore(noSubscribe, readCachedTheme, () => null)
  const [fetchedTheme, setFetchedTheme] = useState(null)
  const siteTheme = fetchedTheme || cachedTheme || defaultTheme

  useEffect(() => {
    // Cached theme applies instantly (avoids FOUC while the fresh fetch below
    // runs) — same cache + key the inline <Script> in app/layout.js reads
    // before hydration.
    const cached = readCachedTheme()
    if (cached) applyFullTheme(cached)

    // Always fire this first, on every hard reload — /api/admin/theme is
    // itself connect-mode aware (see app/api/admin/theme/route.js: proxies to
    // the root admin panel when NEXT_PUBLIC_IS_CONNECT=true, reads this app's
    // own local Supabase singleton otherwise), so the client never needs to
    // know which mode it's in.
    fetch('/api/admin/theme')
      .then(r => r.json())
      .then(data => {
        setFetchedTheme(data)
        applyFullTheme(data)
        localStorage.setItem(THEME_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }))
      })
      .catch(() => {
        // Cached theme (if any) or globals.css defaults stay active
      })
  }, [])

  // mode exposed for any component that needs to read it (e.g. conditional shadow)
  const theme = siteTheme.mode || 'light'

  return (
    <ThemeContext.Provider value={{ theme, siteTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
