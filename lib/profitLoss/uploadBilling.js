import { rowOrderId } from './rowsPayload';

// Coins for an upload — the counting half of lib/profitLoss/useUploadBilling.js.
// Nothing new is stored: everything is counted from the rows already on the
// dashboard, which (signed in) is every row ever saved to the account — the
// dashboard loads them all before an upload is allowed.
//
//  - Orders are counted by Order Id, once: an Order Id already on the
//    dashboard is not new and never charged again.
//  - Each order month (the month of the order's own date; undated rows count
//    in this month) has `freePerMonth` free orders; only new orders past that
//    are billable.
//  - Accounts are Marketplace + Brand ("company"), in the order they were
//    first used (the saved list first, oldest first). The first `freeAccounts`
//    are free; any other one is charged once a month — the hub's coin history
//    makes that once (accountKey).

const count = (n) => Number(n || 0).toLocaleString('en-IN');
const plural = (n, word) => `${count(n)} ${word}${n === 1 ? '' : 's'}`;

const monthOf = (row, thisMonth) => (
  typeof row.orderDate === 'string' && /^\d{4}-\d{2}/.test(row.orderDate) ? row.orderDate.slice(0, 7) : thisMonth
);

// → { newOrderIds, newOrders, billableOrders }.
export function countNewOrders({ existingRows, newRows, orderIdHeader, freePerMonth, thisMonth }) {
  const existing = new Map(); // Order Id → its month
  for (const r of existingRows) {
    const id = rowOrderId(r, orderIdHeader);
    if (id && !existing.has(id)) existing.set(id, monthOf(r, thisMonth));
  }
  const fresh = new Map();
  for (const r of newRows) {
    const id = rowOrderId(r, orderIdHeader);
    if (id && !existing.has(id) && !fresh.has(id)) fresh.set(id, monthOf(r, thisMonth));
  }

  const perMonth = (ids) => {
    const m = new Map();
    for (const month of ids.values()) m.set(month, (m.get(month) || 0) + 1);
    return m;
  };
  const had = perMonth(existing);
  let billableOrders = 0;
  for (const [month, n] of perMonth(fresh)) {
    const before = had.get(month) || 0;
    billableOrders += Math.max(0, before + n - freePerMonth) - Math.max(0, before - freePerMonth);
  }
  return { newOrderIds: [...fresh.keys()], newOrders: fresh.size, billableOrders };
}

// Is `company` past the free accounts? `savedCompanies` = the account's
// saved Marketplace + Brand list, oldest first.
export function isPaidAccount({ company, savedCompanies, existingRows, freeAccounts }) {
  const known = [...new Set(savedCompanies)];
  const seen = new Set(known);
  for (const r of existingRows) {
    if (r.company && !seen.has(r.company)) { seen.add(r.company); known.push(r.company); }
  }
  if (!seen.has(company)) known.push(company);
  return known.indexOf(company) >= freeAccounts;
}

// Idempotency keys for /api/wallet/deduct — a repeat of the same charge is
// recorded once in the coin history and costs nothing the second time.
// An extra account: once per account per month.
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
export function chargeSummary({ newOrders, billableOrders, coins, accountCoins }) {
  if (!newOrders) return 'No new orders — nothing to charge';
  const parts = [plural(newOrders, 'new order')];
  parts.push(billableOrders ? `${plural(billableOrders, 'order')} past the free ones` : 'within the free orders');
  if (accountCoins) parts.push(`${plural(accountCoins, 'coin')} for this account this month`);
  parts.push(coins ? `${plural(coins, 'coin')} used` : 'free');
  return parts.join(' · ');
}
