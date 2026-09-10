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

// ── Dashboard (public) ─────────────────────────────────────────────────────
export async function listLiveTemplates() {
  return json(await fetch('/api/marketplace-templates/live', { cache: 'no-store' }));
}

// ── Builder / list (master_admin or granted) ───────────────────────────────
export async function listTemplates({ scopeAll = false } = {}) {
  const qs = scopeAll ? '?scope=all' : '';
  return json(await authFetch(`/api/marketplace-templates${qs}`));
}

export async function createTemplate({ marketplaceName, description, config }) {
  return json(
    await authFetch('/api/marketplace-templates', {
      method: 'POST',
      body: JSON.stringify({ marketplaceName, description, config }),
    }),
  );
}

export async function getTemplate(id) {
  return json(await authFetch(`/api/marketplace-templates/${encodeURIComponent(id)}`));
}

export async function patchTemplate(id, patch) {
  return json(
    await authFetch(`/api/marketplace-templates/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  );
}

export async function deleteTemplate(id) {
  return json(
    await authFetch(`/api/marketplace-templates/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  );
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

export async function saveDraftVersion(id, { config, note, major } = {}) {
  return json(
    await authFetch(`/api/marketplace-templates/${encodeURIComponent(id)}/versions`, {
      method: 'POST',
      body: JSON.stringify({ config, note, major }),
    }),
  );
}

export async function updateDraftVersion(id, vid, { config, note } = {}) {
  return json(
    await authFetch(
      `/api/marketplace-templates/${encodeURIComponent(id)}/versions/${encodeURIComponent(vid)}`,
      { method: 'PUT', body: JSON.stringify({ config, note }) },
    ),
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

export async function listLogs(id, { limit = 50, cursor } = {}) {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (cursor) qs.set('cursor', cursor);
  return json(await authFetch(`/api/marketplace-templates/${encodeURIComponent(id)}/logs?${qs}`));
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
