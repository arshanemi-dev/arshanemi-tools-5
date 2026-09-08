'use client';

import { authFetch } from '@/lib/tokenStore';

// Thin wrappers over the tools-5 /api/profit-loss/* proxy routes. Each returns
// { ok, status, data }. authFetch attaches the Bearer token + auto-refreshes,
// and pops the shared LoginRequiredModal on a final 401.

async function json(res) {
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function getSettings() {
  return json(await authFetch('/api/profit-loss/settings'));
}

export async function putSettings({ headers, preferences }) {
  return json(
    await authFetch('/api/profit-loss/settings', {
      method: 'PUT',
      body: JSON.stringify({ headers, preferences }),
    }),
  );
}

export async function listHistory({ limit = 20, cursor } = {}) {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (cursor) qs.set('cursor', cursor);
  return json(await authFetch(`/api/profit-loss/history?${qs}`));
}

export async function saveRun(payload) {
  return json(
    await authFetch('/api/profit-loss/history', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  );
}

export async function getRun(id) {
  return json(await authFetch(`/api/profit-loss/history/${encodeURIComponent(id)}`));
}

export async function deleteRun(id) {
  return json(
    await authFetch(`/api/profit-loss/history/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  );
}
