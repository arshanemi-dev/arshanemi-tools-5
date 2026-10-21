'use client';

import { authFetch } from '@/lib/tokenStore';

// Thin wrappers over the tools-5 /api/marketplace-templates/* proxy routes.
// Each returns { ok, status, data }. authFetch attaches the Bearer token +
// auto-refreshes and pops the shared LoginRequiredModal on a final 401.
// `listLive` is the one call the public dashboard makes (no auth needed, but
// authFetch is harmless when signed out).

async function json(res) {
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// One line for a failed save's toast that always says where it broke: the
// server's own error (or `fallback`) plus the HTTP status. Pass a result
// shaped { error, status } or { data: { error }, status }, or a thrown
// error — a throw means the request never got a response at all (this
// app's dev server restarting / recompiling, or the network).
export function failureMessage(res, fallback = 'Request failed') {
  if (res instanceof Error) return `${fallback} — no response from the server (${res.message}). Try again in a moment.`;
  const msg = res?.error || res?.data?.error || fallback;
  return res?.status ? `${msg} (HTTP ${res.status})` : msg;
}

// "Fix 2 errors first: graph "Sales" (line) needs at least 1 header" — the
// first validation error spelled out, since the section it's in may not be
// the one open.
export function validationMessage(errors = []) {
  const n = errors.length;
  return `Fix ${n} error${n === 1 ? '' : 's'} first: ${errors[0]}${n > 1 ? ` (+${n - 1} more — hover the error count in the footer)` : ''}`;
}

// ── Dashboard (public) ─────────────────────────────────────────────────────
// Returns { global: <config>, templates: [{ id, marketplaceName,
// templateNumber, config: { marketplace, fileSlots } }] } — the global config
// (Headers/Title Cards/Graphs/Tabs/Overview Tabs) is shared by every
// marketplace, so it comes back once, not per template. The result also
// carries the response's `etag`; pass the one from an earlier load back in
// and an unchanged answer comes back as { ok: true, status: 304, data: null }
// with no body to download (see lib/profitLoss/useLiveTemplates.js).
export async function listLiveTemplates({ etag } = {}) {
  const res = await fetch('/api/marketplace-templates/live', {
    cache: 'no-store',
    headers: etag ? { 'If-None-Match': etag } : undefined,
  });
  if (res.status === 304) return { ok: true, status: 304, data: null, etag };
  return { ...(await json(res)), etag: res.headers.get('ETag') };
}

// ── Global Settings identity (builder — master_admin or granted) ───────────
// The singleton Global Settings row's id (lazily created on first touch) —
// its config/versions/publish flow all reuse the plain template calls below
// (getTemplate/getVersion/saveDraftVersion/publishVersion/...), same as any
// marketplace used to. See useGlobalTemplateDraft.js.
export async function getGlobalTemplateMeta() {
  return json(await authFetch('/api/marketplace-templates/global'));
}

// ── Builder (master_admin or granted) ──────────────────────────────────────
// The marketplace rows (is_global = false) — only read now: every
// marketplace is part of the Global Settings version
// (lib/profitLoss/versionMarketplaces.js), and these rows are where a
// version saved before that starts from.
export async function listTemplates({ scopeAll = false } = {}) {
  const qs = scopeAll ? '?scope=all' : '';
  return json(await authFetch(`/api/marketplace-templates${qs}`));
}

export async function getTemplate(id) {
  return json(await authFetch(`/api/marketplace-templates/${encodeURIComponent(id)}`));
}

export async function listVersions(id) {
  return json(await authFetch(`/api/marketplace-templates/${encodeURIComponent(id)}/versions`));
}

export async function getVersion(id, vid) {
  return json(
    await authFetch(
      `/api/marketplace-templates/${encodeURIComponent(id)}/versions/${encodeURIComponent(vid)}`,
    ),
  );
}

// A NEW version, saved as a draft ("Save New Version") — the hub numbers it
// one past the highest version (v94, v95, …).
export async function saveDraftVersion(id, { config, note } = {}) {
  return json(
    await authFetch(`/api/marketplace-templates/${encodeURIComponent(id)}/versions`, {
      method: 'POST',
      body: JSON.stringify({ config, note }),
    }),
  );
}

export async function publishVersion(id, vid, { live = true } = {}) {
  return json(
    await authFetch(
      `/api/marketplace-templates/${encodeURIComponent(id)}/versions/${encodeURIComponent(vid)}/publish`,
      { method: 'POST', body: JSON.stringify({ live }) },
    ),
  );
}

// The hub refuses this (409) for the version that is live on the dashboard —
// that rule is enforced there, not by the button's own disabled state.
export async function deleteVersion(id, vid) {
  return json(
    await authFetch(
      `/api/marketplace-templates/${encodeURIComponent(id)}/versions/${encodeURIComponent(vid)}`,
      { method: 'DELETE' },
    ),
  );
}

export async function listLogs(id, { limit = 50, cursor } = {}) {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (cursor) qs.set('cursor', cursor);
  return json(await authFetch(`/api/marketplace-templates/${encodeURIComponent(id)}/logs?${qs}`));
}

// ── Header groups, as set before they were versioned ───────────────────────
// The hub's profit_loss_header_groups / _members, read only — a version saved
// before groups were part of it starts from them (withVersionGroups,
// lib/profitLoss/headerGroups.js). → { groups, members, hiddenHeaderIds }.
export async function listHeaderGroups() {
  return json(await authFetch('/api/marketplace-templates/header-groups'));
}

// ── Access grant (master_admin only) ───────────────────────────────────────
export async function getMyTemplateAccess() {
  return json(await authFetch('/api/marketplace-templates/access/me'));
}

export async function getAccessGrants() {
  return json(await authFetch('/api/admin/marketplace-template-access'));
}

export async function putAccessGrants(map) {
  return json(
    await authFetch('/api/admin/marketplace-template-access', {
      method: 'PUT',
      body: JSON.stringify(map),
    }),
  );
}
