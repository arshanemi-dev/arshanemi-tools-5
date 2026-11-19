'use client';

// The device copy of a signed-in user's saved rows (IndexedDB) — so a
// dashboard visit shows them at once, and asks the server only for what
// changed since (GET /api/profit-loss/rows?since=…) instead of every row
// again. DashboardWorkspace's restore is the one caller.
//
// One record per user: { key, version, syncedAt, rows } — `rows` exactly as
// the API sends them ({ id, orderId, transactionId, data, updatedAt }), so
// they go through the same rowsFromExtractedPayload as a fresh download;
// `syncedAt` = the newest updatedAt among them (the server's own clock).
// Every call fails soft: no IndexedDB (private window, blocked storage) →
// no cache, and the dashboard just downloads everything as before.

import { getStoredUser } from '@/lib/tokenStore';

const DB_NAME = 'pl-row-cache';
const STORE = 'users';
// Bump when the saved shape changes — an older copy is then ignored.
const VERSION = 1;

export function cacheUserKey() {
  const u = getStoredUser();
  const id = u?.id ?? u?.userId ?? u?.email ?? null;
  return id ? String(id) : null;
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no indexedDB')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const out = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(out?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// → { syncedAt, rows } or null (nothing cached / an older shape / no storage).
export async function readRowCache(userKey) {
  if (!userKey) return null;
  try {
    const rec = await run('readonly', (store) => store.get(userKey));
    if (!rec || rec.version !== VERSION || !Array.isArray(rec.rows)) return null;
    return { syncedAt: rec.syncedAt || null, rows: rec.rows };
  } catch {
    return null;
  }
}

// The newest updatedAt among the rows — where the next sync starts.
export function newestUpdate(rows) {
  let max = null;
  for (const r of rows) if (r?.updatedAt && (!max || r.updatedAt > max)) max = r.updatedAt;
  return max;
}

export async function writeRowCache(userKey, rows) {
  if (!userKey) return;
  try {
    await run('readwrite', (store) => store.put({ key: userKey, version: VERSION, syncedAt: newestUpdate(rows), rows }));
  } catch { /* storage full or blocked — the next visit downloads again */ }
}

// Cached rows + what changed since → one list: a changed row replaces its
// older copy (same id), a new one is added. Newest first, as the API sends.
export function mergeChanged(cached, changed) {
  if (!changed.length) return cached;
  const byId = new Map(cached.map((r) => [r.id, r]));
  for (const r of changed) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

// Rows deleted on this device ({ orderId, transactionId } keys — the same
// keys DELETE /api/profit-loss/rows takes) leave the copy too.
export async function removeFromRowCache(userKey, keys) {
  if (!userKey || !keys?.length) return;
  const cached = await readRowCache(userKey);
  if (!cached) return;
  const gone = new Set(keys.map((k) => `${k.orderId}\u0000${k.transactionId ?? ''}`));
  const rows = cached.rows.filter((r) => !gone.has(`${r.orderId}\u0000${r.transactionId ?? ''}`));
  if (rows.length !== cached.rows.length) await writeRowCache(userKey, rows);
}

// Every user's copy — signing out, or "Delete all saved data".
export async function clearRowCache(userKey = null) {
  try {
    if (userKey) await run('readwrite', (store) => store.delete(userKey));
    else await run('readwrite', (store) => store.clear());
  } catch { /* nothing to clear */ }
}
