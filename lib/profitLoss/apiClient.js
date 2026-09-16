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

export async function listCompanies() {
  return json(await authFetch('/api/profit-loss/companies'));
}

export async function saveCompany({ marketplace, brand }) {
  return json(
    await authFetch('/api/profit-loss/companies', {
      method: 'POST',
      body: JSON.stringify({ marketplace, brand }),
    }),
  );
}

// Fetches this user's previously-saved rows back — newest-saved-first,
// paginated (default 100), across every company. `data.totalPages`/
// `data.totalCount` drive DashboardWorkspace's "Load more" affordance.
export async function listExtractedRows({ page = 1, limit = 100 } = {}) {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
  return json(await authFetch(`/api/profit-loss/rows?${qs}`));
}

// Debug-only: wipes every saved row for this user. See SheetDebugger's
// "Delete All Saved Data" button.
export async function deleteAllExtractedRows() {
  return json(await authFetch('/api/profit-loss/rows', { method: 'DELETE' }));
}

// Automatic (free) per-row persistence — chunked so one huge upload never
// sends a single oversized request; the hub route caps at 2000/request too,
// this just keeps the common case well under that. Best-effort: a chunk
// failure is swallowed here (returned in `errors`, not thrown) since this is
// background enrichment, never something a keystroke or upload should block on.
const ROWS_CHUNK = 500;
export async function saveExtractedRows(rows) {
  const errors = [];
  let saved = 0;
  for (let i = 0; i < rows.length; i += ROWS_CHUNK) {
    const chunk = rows.slice(i, i + ROWS_CHUNK);
    try {
      const { ok, data } = await json(
        await authFetch('/api/profit-loss/rows', {
          method: 'POST',
          body: JSON.stringify({ rows: chunk }),
        }),
      );
      if (ok) saved += data.count ?? chunk.length;
      else errors.push(data?.error || 'Failed to save a batch of rows');
    } catch (err) {
      errors.push(err?.message || 'Network error while saving rows');
    }
  }
  return { ok: errors.length === 0, saved, errors };
}
