'use client';

import { authFetch } from '@/lib/tokenStore';

// Thin wrappers over the tools-5 /api/profit-loss/* proxy routes. Each returns
// { ok, status, data } and NEVER throws: a request that got no response at
// all — this app restarting, the connection dropping, the page reloading
// under it ("Failed to fetch") — comes back as { ok: false, status: 0, data:
// { error } } like any other failure. Every caller already handles `!ok`;
// several had no `.catch`, which left the browser with an unhandled
// rejection. authFetch attaches the Bearer token + auto-refreshes, and pops
// the shared LoginRequiredModal on a final 401.

async function request(path, options) {
  try {
    const res = await authFetch(path, options);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: { error: `No response from the server (${err?.message || 'network error'}) — try again in a moment` } };
  }
}

export async function getSettings() {
  return request('/api/profit-loss/settings');
}

export async function putSettings({ headers, preferences }) {
  return request('/api/profit-loss/settings', {
    method: 'PUT',
    body: JSON.stringify({ headers, preferences }),
  });
}

// The user's per-SKU default costs → data.costs: [{ sku, cogs?, costGst?,
// finalCost?, otherExpense? }] (lib/profitLoss/skuCosts.js).
export async function listSkuCosts() {
  return request('/api/profit-loss/sku-costs');
}

// Saves costs — `items` = [{ sku, <cost>: number | null, ... }]: a number
// sets that cost, null clears it, a cost an item doesn't name is left alone.
// One typed cost is one item naming one cost; an uploaded SKU Cost sheet is
// many, sent in batches. Stops at the first batch the hub turns down and
// returns its result.
const SKU_COSTS_CHUNK = 500;
export async function saveSkuCosts(items) {
  let last = { ok: true, status: 200, data: { count: 0 } };
  for (let i = 0; i < items.length; i += SKU_COSTS_CHUNK) {
    last = await request('/api/profit-loss/sku-costs', {
      method: 'PUT',
      body: JSON.stringify({ costs: items.slice(i, i + SKU_COSTS_CHUNK) }),
    });
    if (!last.ok) return last;
  }
  return last;
}

export async function listHistory({ limit = 20, cursor } = {}) {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (cursor) qs.set('cursor', cursor);
  return request(`/api/profit-loss/history?${qs}`);
}

export async function saveRun(payload) {
  return request('/api/profit-loss/history', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getRun(id) {
  return request(`/api/profit-loss/history/${encodeURIComponent(id)}`);
}

export async function deleteRun(id) {
  return request(`/api/profit-loss/history/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function listCompanies() {
  return request('/api/profit-loss/companies');
}

export async function saveCompany({ marketplace, brand }) {
  return request('/api/profit-loss/companies', {
    method: 'POST',
    body: JSON.stringify({ marketplace, brand }),
  });
}

// Fetches this user's previously-saved rows back — newest-saved-first,
// paginated (default 100), across every company. `data.totalPages`/
// `data.totalCount` drive DashboardWorkspace's "Load more" affordance.
export async function listExtractedRows({ page = 1, limit = 100, signal, includeCount = true } = {}) {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (!includeCount) qs.set('includeCount', 'false');
  return request(`/api/profit-loss/rows?${qs}`, { signal });
}

// Debug-only: wipes every saved row for this user. See SheetDebugger's
// "Delete All Saved Data" button.
export async function deleteAllExtractedRows() {
  return request('/api/profit-loss/rows', { method: 'DELETE' });
}

// Deletes specific saved rows by { orderId, transactionId } key — what the
// dashboard's "Delete selected rows" actually persists. Without this, a row
// removed on screen only ever changed local state: the next load-on-refresh
// (listExtractedRows, above) would pull it straight back in from here.
// Sent in batches of ROWS_CHUNK, like the saves — the hub caps one request
// at 2000 keys. → { ok, status, data: { deleted } }, the first failing
// batch's result if one fails.
export async function deleteExtractedRows(keys) {
  let deleted = 0;
  let last = { ok: true, status: 200, data: { deleted } };
  for (let i = 0; i < keys.length; i += ROWS_CHUNK) {
    last = await request('/api/profit-loss/rows', {
      method: 'DELETE',
      body: JSON.stringify({ keys: keys.slice(i, i + ROWS_CHUNK) }),
    });
    if (!last.ok) return last;
    deleted += last.data?.deleted ?? 0;
  }
  return { ...last, data: { ...last.data, deleted } };
}

// Automatic (free) per-row persistence, one part at a time: `rows` =
// buildExtractedRowsPayload entries, at most ROWS_CHUNK of them (the hub caps
// one request at 2000 rows / ~4 MB). The caller — lib/profitLoss/
// useRowSaver.js — walks a large upload through this part by part, so it can
// say how far along it is and try a failed part again.
export const ROWS_CHUNK = 500;
export async function saveExtractedRowsPart(rows) {
  return request('/api/profit-loss/rows', {
    method: 'POST',
    body: JSON.stringify({ rows }),
  });
}
