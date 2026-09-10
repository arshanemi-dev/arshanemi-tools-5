import { proxyAdminCall } from './connect'

// Server-side check for "can this user reach the Profit & Loss Template
// Settings section" — called from app/profit-loss/template-settings/layout.js
// (and template-access/page.js), which already hold the raw cookie token, so
// this needs no client-facing route of its own. Fails closed (false) on any
// proxy error — this is a permission gate, not a convenience feature.
// Mirrors tools-4's lib/listingTemplateAccess.js.
export async function fetchTemplateSettingsAllowed(token, role) {
  if (role === 'master_admin') return true
  if (!token) return false
  try {
    const { ok, data } = await proxyAdminCall('/api/marketplace-templates/access/me', {
      authHeader: `Bearer ${token}`,
    })
    return ok ? !!data.allowed : false
  } catch {
    return false
  }
}
