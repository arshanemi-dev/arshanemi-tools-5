import { normHeader, num, toISODate } from '@/data/platforms/canonical';

// Ads cost from the marketplace's own Payment sheet (Meesho: the "Ads Cost"
// tab of the Payments export), shared out onto the orders it paid for.
//
// That tab has no Order Id and no Transaction (NEFT) Id — only two dates and
// a campaign:
//   Deduction Duration — the day the money was SPENT on ads
//   Deduction Date     — the day it was CUT from the payout, i.e. the Payment
//                        Date of exactly one NEFT in the Order Payments tab
// and the orders themselves say whether ads brought them in ("Order source"
// = "Ad order", in both the Orders and the Payments exports). So:
//
//   - Profit view: each line covers a DURATION — Deduction Duration (start)
//     to Deduction Date (end), both inclusive, e.g. 29 Jun → 1 Jul. Its Total
//     Ads Cost is split EQUALLY over every ad order placed in that window —
//     cancelled / RTO / returned ones included (the clicks were paid for
//     either way; leaving them out would overcharge the delivered ones and
//     hide what returns really cost). A line with no Deduction Date is a
//     one-day window. Overlapping windows each charge their own orders, so an
//     order in two windows carries a share of both. A window with no ad
//     orders is stretched up to CARRY_DAYS days past its end (an order can
//     come a little after the click); failing that it is "unallocated" —
//     reported, never dropped silently.
//   - Cash view: every charged order also carries the NEFT its ads were
//     deducted from (the Transaction ID paid on the Deduction Date), so a
//     payout can be reconciled against the bank.
//
// The ledger is a plain list, kept per account (company = the upload's
// "MarketPlace_Brand" tag) and saved with the user's settings:
//   { key, company, spendDate, deductDate, campaignId, adCost, gst, total }
// `total` is what was deducted (Ad Cost incl. credits + GST), positive.

export const CARRY_DAYS = 3;
// A Deduction Date far past its Duration is a bad cell, not a real window —
// such a line falls back to its start day alone.
const MAX_WINDOW_DAYS = 31;

const COLS = {
  spendDate: ['deductionduration', 'spenddate', 'adspenddate'],
  deductDate: ['deductiondate'],
  campaignId: ['campaignid'],
  adCost: ['adcost'],
  credits: ['creditswaiversdiscounts'],
  gst: ['gst'],
  total: ['totaladscost', 'totaladcost'],
};

const toPaise = (n) => Math.round((Number(n) || 0) * 100);
const fromPaise = (p) => p / 100;

function headerIndexes(cells) {
  const norm = cells.map((c) => normHeader(c));
  const at = {};
  for (const [field, names] of Object.entries(COLS)) {
    const i = norm.findIndex((n) => names.includes(n));
    if (i !== -1) at[field] = i;
  }
  return at;
}

const isAdsHeader = (at) => at.campaignId != null && at.spendDate != null && (at.total != null || at.adCost != null);

// One sheet's lines (arrays of cells, header row somewhere near the top) →
// ledger entries, or [] when it isn't an ads sheet. The legend line under
// the header ("A", "B", "(A + B)") and blank lines have no date, so they are
// skipped.
export function readAdsLines(lines) {
  const top = Math.min(lines.length, 15);
  let headerAt = -1;
  let at = null;
  for (let i = 0; i < top; i += 1) {
    const found = headerIndexes(lines[i] || []);
    if (isAdsHeader(found)) { headerAt = i; at = found; break; }
  }
  if (!at) return [];

  const byKey = new Map();
  for (const line of lines.slice(headerAt + 1)) {
    const cell = (field) => (at[field] != null ? line?.[at[field]] : undefined);
    const spendDate = toISODate(cell('spendDate'));
    if (!spendDate) continue;
    const deductDate = toISODate(cell('deductDate')) || null;
    const campaignId = String(cell('campaignId') ?? '').trim();
    const adCost = Math.abs(num(cell('adCost')));
    const credits = Math.abs(num(cell('credits')));
    const gst = Math.abs(num(cell('gst')));
    const totalCell = Math.abs(num(cell('total')));
    const total = totalCell || Math.max(adCost - credits, 0) + gst;
    if (!total) continue;
    // The same campaign twice on one day in one file is two real charges.
    const key = `${spendDate}|${campaignId}|${deductDate || ''}`;
    const prev = byKey.get(key);
    if (prev) {
      prev.adCost = fromPaise(toPaise(prev.adCost) + toPaise(adCost));
      prev.gst = fromPaise(toPaise(prev.gst) + toPaise(gst));
      prev.total = fromPaise(toPaise(prev.total) + toPaise(total));
    } else {
      byKey.set(key, { key, spendDate, deductDate, campaignId, adCost, gst, total });
    }
  }
  return [...byKey.values()];
}

// A parsed workbook's ads entries. `byTab` = parseAllTabs' parsed tabs (an
// ads tab the slot's settings already read is used as is); `rawLinesOf(name)`
// reads any other tab whose name says "ads" straight off the file — the slot
// may exclude that tab, or point its header row at the orders' layout.
export function readAdsLedger(sheetNames, byTab, rawLinesOf) {
  const out = [];
  for (const name of sheetNames) {
    const tab = byTab?.[name];
    if (tab?.headerRow?.length && isAdsHeader(headerIndexes(tab.headerRow))) {
      out.push(...readAdsLines([tab.headerRow, ...(tab.rows || []).map((r) => tab.headerRow.map((h) => r[h]))]));
      continue;
    }
    if (/\bads?\b|advert/i.test(name) && rawLinesOf) out.push(...readAdsLines(rawLinesOf(name) || []));
  }
  return out;
}

// The saved ledger with a new upload's entries laid over it: an entry for
// the same account + day + campaign + deduction is replaced (uploading a
// month again doesn't double it), everything else is kept.
export function mergeAdsLedger(prev, incoming, company = '') {
  const tagged = (incoming || []).map((e) => ({ ...e, company: e.company ?? company ?? '' }));
  const keyOf = (e) => `${e.company || ''}|${e.key}`;
  const next = new Map((Array.isArray(prev) ? prev : []).map((e) => [keyOf(e), e]));
  for (const e of tagged) next.set(keyOf(e), e);
  return [...next.values()].sort((a, b) => (a.spendDate < b.spendDate ? -1 : a.spendDate > b.spendDate ? 1 : 0));
}

// Cheap identity for the allocation cache (the worker gets a fresh copy of
// the ledger with every message).
export function adsLedgerSignature(ledger) {
  if (!Array.isArray(ledger) || !ledger.length) return '';
  return ledger.map((e) => `${e.company || ''}|${e.key}|${e.total}`).join('\n');
}

// ── allocation ────────────────────────────────────────────────────────────
function metaValue(row, names) {
  const meta = row.meta || {};
  for (const k in meta) {
    if (!names.includes(normHeader(k))) continue;
    const v = meta[k];
    if (v != null && String(v).trim() !== '') return v;
  }
  return undefined;
}

export function isAdOrderRow(row) {
  const v = normHeader(metaValue(row, ['ordersource']) ?? '');
  return v === 'ad' || v === 'ads' || v.includes('adorder');
}

function nextDay(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const joinUnique = (values) => [...new Set(values.filter(Boolean))].join(', ');

const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

// A ledger entry's window: Deduction Duration → Deduction Date, inclusive.
// No / earlier / implausibly late Deduction Date → the start day alone.
export function adsWindow(entry) {
  const from = entry.spendDate;
  const to = entry.deductDate;
  if (!to || to <= from || daysBetween(from, to) > MAX_WINDOW_DAYS) return { from, to: from };
  return { from, to };
}

// rows (canonical, already merged) + ledger → { rows, days }.
//   rows — the same array when there is nothing to allocate; otherwise a copy
//          where each charged ad order's row (one row per order, the first
//          seen) is a new object with `adsAlloc` ({ cost, neftIds,
//          campaignIds, spendDates, deductDates }) and readable meta columns
//          ("Ads Cost (Allocated)", "Ads NEFT ID", "Ads Campaign ID",
//          "Ads Spend Date", "Ads Deduction Date") — so a template header of
//          that name shows it without any mapping.
//   days — one entry per account + window: { company, spendDate (start),
//          endDate (end), amount, targetDate (last day actually used —
//          endDate, or later when stretched; null = unallocated), orders }.
// Rows are never mutated: they are the saved rows' own objects.
export function allocateAds(rows, ledger, { carryDays = CARRY_DAYS } = {}) {
  if (!Array.isArray(ledger) || !ledger.length || !rows?.length) return { rows, days: [], adOrders: [] };

  // Ad orders: account → order date → [first row index of each order].
  const adOrderIds = new Set();
  for (const r of rows) if (r.orderId && isAdOrderRow(r)) adOrderIds.add(`${r.company || ''}\u0000${r.orderId}`);
  const firstRow = new Map(); // company␀orderId → { idx, date, company }
  const neftByDay = new Map(); // company␀payDate → Set<txn>
  rows.forEach((r, idx) => {
    const company = r.company || '';
    const id = `${company}\u0000${r.orderId}`;
    if (r.orderId && adOrderIds.has(id)) {
      const seen = firstRow.get(id);
      if (!seen) firstRow.set(id, { idx, date: r.orderDate || null, company });
      else if (!seen.date && r.orderDate) seen.date = r.orderDate;
    }
    const payDate = toISODate(metaValue(r, ['paymentdate'])) || r.settlementDate || null;
    const txn = metaValue(r, ['transactionid']) ?? r.settlementId;
    if (payDate && txn != null && String(txn).trim()) {
      const k = `${company}\u0000${payDate}`;
      if (!neftByDay.has(k)) neftByDay.set(k, new Set());
      neftByDay.get(k).add(String(txn).trim());
    }
  });

  // An entry with an account matches that account's orders; one without (an
  // older save) matches any.
  const poolCache = new Map();
  const poolFor = (company) => {
    if (poolCache.has(company)) return poolCache.get(company);
    const byDate = new Map();
    for (const o of firstRow.values()) {
      if (!o.date || (company && o.company !== company)) continue;
      if (!byDate.has(o.date)) byDate.set(o.date, []);
      byDate.get(o.date).push(o.idx);
    }
    poolCache.set(company, byDate);
    return byDate;
  };
  const neftsFor = (company, deductDate) => {
    if (!deductDate) return [];
    if (company) return [...(neftByDay.get(`${company}\u0000${deductDate}`) || [])];
    const out = [];
    for (const [k, set] of neftByDay) if (k.endsWith(`\u0000${deductDate}`)) out.push(...set);
    return out;
  };

  // Spend per account + window (lines sharing the same start and end — e.g.
  // two campaigns deducted together — are pooled).
  const spend = new Map();
  for (const e of ledger) {
    if (!e?.spendDate) continue;
    const { from, to } = adsWindow(e);
    const k = `${e.company || ''}\u0000${from}\u0000${to}`;
    if (!spend.has(k)) spend.set(k, { company: e.company || '', spendDate: from, endDate: to, paise: 0, entries: [] });
    const s = spend.get(k);
    s.paise += toPaise(e.total);
    s.entries.push(e);
  }

  const charge = new Map(); // row idx → { paise, nefts, campaigns, spendDates, deductDates }
  const days = [];
  const byWindow = (a, b) => (a.spendDate !== b.spendDate ? (a.spendDate < b.spendDate ? -1 : 1) : (a.endDate < b.endDate ? -1 : 1));
  for (const s of [...spend.values()].sort(byWindow)) {
    const pool = poolFor(s.company);
    // Every ad order from the window's start to its end; stretched one day
    // at a time (up to carryDays) only while it has none at all.
    const orders = [];
    let d = s.spendDate;
    for (; d <= s.endDate; d = nextDay(d, 1)) orders.push(...(pool.get(d) || []));
    let targetDate = orders.length ? s.endDate : null;
    for (let k = 1; k <= carryDays && !orders.length; k += 1) {
      const extra = nextDay(s.endDate, k);
      orders.push(...(pool.get(extra) || []));
      if (orders.length) targetDate = extra;
    }
    days.push({ company: s.company, spendDate: s.spendDate, endDate: s.endDate, amount: fromPaise(s.paise), targetDate, orders: orders.length });
    if (!targetDate) continue;

    const nefts = s.entries.flatMap((e) => neftsFor(s.company, e.deductDate));
    const campaigns = s.entries.map((e) => e.campaignId);
    const deductDates = s.entries.map((e) => e.deductDate);
    // Equal shares in whole paise; the odd paise go to the first orders so
    // the shares add up to the day's spend exactly.
    const base = Math.floor(s.paise / orders.length);
    let rest = s.paise - base * orders.length;
    for (const idx of orders) {
      const c = charge.get(idx) || { paise: 0, nefts: [], campaigns: [], spendDates: [], deductDates: [] };
      c.paise += base + (rest > 0 ? 1 : 0);
      if (rest > 0) rest -= 1;
      c.nefts.push(...nefts);
      c.campaigns.push(...campaigns);
      c.spendDates.push(s.spendDate);
      c.deductDates.push(...deductDates);
      charge.set(idx, c);
    }
  }

  const adOrders = [...firstRow.values()].map((o) => ({ company: o.company, date: o.date, charged: charge.has(o.idx) }));
  if (!charge.size) return { rows, days, adOrders };
  const out = rows.slice();
  for (const [idx, c] of charge) {
    const row = rows[idx];
    const adsAlloc = {
      cost: fromPaise(c.paise),
      neftIds: joinUnique(c.nefts),
      campaignIds: joinUnique(c.campaigns),
      spendDates: joinUnique(c.spendDates),
      deductDates: joinUnique(c.deductDates),
    };
    out[idx] = {
      ...row,
      adsAlloc,
      meta: {
        ...row.meta,
        'Ads Cost (Allocated)': adsAlloc.cost,
        'Ads NEFT ID': adsAlloc.neftIds,
        'Ads Campaign ID': adsAlloc.campaignIds,
        'Ads Spend Date': adsAlloc.spendDates,
        'Ads Deduction Date': adsAlloc.deductDates,
      },
    };
  }
  return { rows: out, days, adOrders };
}

// The dashboard's ads summary line for the filters on screen (account and
// the order-date range — a window counts when any day of it, as charged,
// falls inside the range).
export function summarizeAds({ days = [], adOrders = [] } = {}, { company = 'all', dateFrom = null, dateTo = null } = {}) {
  if (!days.length) return null;
  const inRange = (d) => !d || ((!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo));
  const overlaps = (from, to) => (!dateFrom || to >= dateFrom) && (!dateTo || from <= dateTo);
  const ofCompany = (c) => company === 'all' || !c || c === company;
  const shown = days.filter((d) => ofCompany(d.company) && overlaps(d.spendDate, d.targetDate || d.endDate || d.spendDate));
  if (!shown.length) return null;
  let total = 0;
  let allocated = 0;
  const unallocatedDays = [];
  const carried = [];
  for (const d of shown) {
    total += toPaise(d.amount);
    const endDate = d.endDate || d.spendDate;
    if (d.targetDate) {
      allocated += toPaise(d.amount);
      if (d.targetDate > endDate) carried.push({ spendDate: d.spendDate, endDate, targetDate: d.targetDate, amount: d.amount });
    } else {
      unallocatedDays.push({ spendDate: d.spendDate, endDate, amount: d.amount });
    }
  }
  const orders = adOrders.filter((o) => ofCompany(o.company) && inRange(o.date));
  return {
    total: fromPaise(total),
    allocated: fromPaise(allocated),
    unallocated: fromPaise(total - allocated),
    unallocatedDays,
    carried,
    adOrders: orders.length,
    chargedOrders: orders.filter((o) => o.charged).length,
  };
}
