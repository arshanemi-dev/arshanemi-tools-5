import { rowOrderId } from './rowsPayload';

// Coins for an upload — the counting half of lib/profitLoss/useUploadBilling.js.
// Nothing new is stored: everything is counted from the rows already on the
// dashboard, which (signed in) is every row ever saved to the account — the
// dashboard loads them all before an upload is allowed.
//
//  - Orders are counted by Order Id, once: an Order Id already on the
//    dashboard is not new and never charged again. Signed in, every new one
//    is charged; signed out, the dashboard holds at most the guest limit.
//  - Accounts are Marketplace + Brand ("company"), in the order they were
//    first used (the saved list first, oldest first). Signed in, every
//    account is charged once a month — the hub's coin history makes that
//    once (accountKey); signed out, only the first `limit` can be used.

const count = (n) => Number(n || 0).toLocaleString('en-IN');
const plural = (n, word) => `${count(n)} ${word}${n === 1 ? '' : 's'}`;

// → { newOrderIds, newOrders, totalOrders } — totalOrders = the unique Order
// Ids on the dashboard once this upload is added.
export function countNewOrders({ existingRows, newRows, orderIdHeader }) {
  const existing = new Set();
  for (const r of existingRows) {
    const id = rowOrderId(r, orderIdHeader);
    if (id) existing.add(id);
  }
  const fresh = new Set();
  for (const r of newRows) {
    const id = rowOrderId(r, orderIdHeader);
    if (id && !existing.has(id)) fresh.add(id);
  }
  return { newOrderIds: [...fresh], newOrders: fresh.size, totalOrders: existing.size + fresh.size };
}

// Is `company` past the first `limit` accounts? `savedCompanies` = the
// account's saved Marketplace + Brand list, oldest first.
export function isPastAccountLimit({ company, savedCompanies, existingRows, limit }) {
  const known = [...new Set(savedCompanies)];
  const seen = new Set(known);
  for (const r of existingRows) {
    if (r.company && !seen.has(r.company)) { seen.add(r.company); known.push(r.company); }
  }
  if (!seen.has(company)) known.push(company);
  return known.indexOf(company) >= limit;
}

// Idempotency keys for /api/wallet/deduct — a repeat of the same charge is
// recorded once in the coin history and costs nothing the second time.
// An account: once per account per month.
export const accountKey = (company, thisMonth) => `pl-account:${company}:${thisMonth}`;

// New orders: the exact set of Order Ids — an upload that was paid for but
// never saved (refused later, page closed) isn't charged again when the same
// orders are uploaded once more.
export async function ordersKey(orderIds) {
  const bytes = new TextEncoder().encode([...orderIds].sort().join('\n'));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return `pl-orders:${[...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

// One line for a finished charge — the upload window's.
export function chargeSummary({ newOrders, coins, accountCoins }) {
  if (!newOrders) return 'No new orders — nothing to charge';
  const parts = [plural(newOrders, 'new order')];
  if (accountCoins) parts.push(`${plural(accountCoins, 'coin')} for this account this month`);
  parts.push(coins ? `${plural(coins, 'coin')} used` : 'no coins used');
  return parts.join(' · ');
}
