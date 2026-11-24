import { normHeader, num, toISODate } from '@/data/platforms/canonical';

// Ads cost from the marketplace's own Payment sheet (Meesho: the "Ads Cost"
// tab of the Payments export), shared out onto the orders it paid for.
//
// That tab has no Order Id and no Transaction (NEFT) Id — only two dates and
// a campaign:
//   Deduction Duration — the day the money was SPENT on ads
//   Deduction Date     — the day it was CUT from the payout, i.e. the Payment
//                        Date of exactly one NEFT in the Order Payments tab.
// So the two sheets are matched on that date:
//
//   Ads Cost tab "Deduction Date"  =  Order Payments tab "Payment Date"
//
// MEESHO ONLY. Every payment that came in on that day (same account) shares
// the ads cost cut from that payout EQUALLY — one share per PAYMENT ROW, no
// uniqueness: an Order Id paid twice that day is two shares, ad orders and
// normal orders alike. Several lines cut on one day are pooled first. A line
// with no Deduction Date, or with no payments on it, is "unallocated" —
// reported, never dropped silently. Each charged row also carries the NEFT
// (Transaction ID) paid that day, so a payout can be reconciled against the
// bank. See allocateAds.
//
// The ledger is a plain list, kept per account (company = the upload's
// "MarketPlace_Brand" tag) and saved with the user's settings:
//   { key, company, spendDate, deductDate, campaignId, adCost, gst, total }
// `total` is what was deducted (Ad Cost incl. credits + GST), positive.

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

// "Order source" = Ad order — shown for information only; the split goes
// over every order paid on the Deduction Date, ad or not.
export function isAdOrderRow(row) {
  const v = normHeader(metaValue(row, ['ordersource']) ?? '');
  return v === 'ad' || v === 'ads' || v.includes('adorder');
}

const joinUnique = (values) => [...new Set(values.filter(Boolean))].join(', ');

// The day a row was paid out: its Payments sheet "Payment Date", else the
// canonical settlement date. null = not paid (yet).
export const paymentDateOf = (row) => toISODate(metaValue(row, ['paymentdate'])) || row.settlementDate || null;

// The ads split is for Meesho only: a row read as Meesho, or uploaded under
// a Meesho account ("Meesho_<Brand>").
export const isMeeshoRow = (row) => row?.platform === 'meesho' || /^meesho(_|$)/i.test(String(row?.company ?? '').trim());

// rows (canonical, already merged) + ledger → { rows, days, adOrders }.
//
// Meesho only. Each ads line is matched on its Deduction Date to the Payment
// Date of the Order Payments sheet (same account): the payments that came
// in that day are the payout the ads were cut from. Its Total Ads Cost is
// split EQUALLY over every Meesho payment row of that day — no uniqueness:
// an Order Id with two payment rows that day takes two shares. Lines
// deducted on the same day (several campaigns) are pooled first. A line
// with no Deduction Date, or whose date has no payments, is "unallocated" —
// reported, never dropped.
//
//   rows — the same array when there is nothing to allocate; otherwise a copy
//          where each charged row is a new object with `adsAlloc` ({ cost,
//          neftIds, campaignIds, spendDates, deductDates }) and readable meta
//          columns ("Ads Cost (Allocated)", "Ads NEFT ID", "Ads Campaign ID",
//          "Ads Spend Date", "Ads Deduction Date") — so a template header of
//          that name shows it without any mapping.
//   days — one entry per account + Deduction Date: { company, spendDate,
//          endDate (both the Deduction Date; spendDate = the line's own
//          Deduction Duration when it has no Deduction Date), amount,
//          targetDate (the Deduction Date when it found orders, else null =
//          unallocated), orders }.
//   adOrders — every charged payment row: { company, date (its Payment
//          Date), charged: true }.
// Rows are never mutated: they are the saved rows' own objects.
export function allocateAds(rows, ledger) {
  if (!Array.isArray(ledger) || !ledger.length || !rows?.length) return { rows, days: [], adOrders: [] };

  // account → Payment Date → every Meesho payment row paid that day (row
  // indexes — the same Order Id twice is two entries).
  const paid = new Map();
  const neftByDay = new Map(); // company␀payDate → Set<txn>
  rows.forEach((r, idx) => {
    if (!isMeeshoRow(r)) return;
    const payDate = paymentDateOf(r);
    if (!payDate) return;
    const company = r.company || '';
    if (!paid.has(company)) paid.set(company, new Map());
    const byDay = paid.get(company);
    if (!byDay.has(payDate)) byDay.set(payDate, []);
    byDay.get(payDate).push(idx);
    const txn = metaValue(r, ['transactionid']) ?? r.settlementId;
    if (txn != null && String(txn).trim()) {
      const k = `${company}\u0000${payDate}`;
      if (!neftByDay.has(k)) neftByDay.set(k, new Set());
      neftByDay.get(k).add(String(txn).trim());
    }
  });
  // The payment rows of `day` — in that account; an entry with no account
  // (an older save) takes any account's.
  const ordersPaidOn = (company, day) => {
    if (company) return (paid.get(company)?.get(day) || []).map((idx) => ({ idx, company }));
    const out = [];
    for (const [c, byDay] of paid) for (const idx of byDay.get(day) || []) out.push({ idx, company: c });
    return out;
  };
  const neftsOn = (company, day) => {
    if (company) return [...(neftByDay.get(`${company}\u0000${day}`) || [])];
    const out = [];
    for (const [k, set] of neftByDay) if (k.endsWith(`\u0000${day}`)) out.push(...set);
    return out;
  };

  // Spend per account + Deduction Date (several campaigns cut on one day
  // are one pool). No Deduction Date → nothing to match: unallocated.
  const spend = new Map();
  for (const e of ledger) {
    if (!e?.spendDate && !e?.deductDate) continue;
    const day = e.deductDate || null;
    const k = `${e.company || ''}\u0000${day ?? `none:${e.spendDate}`}`;
    if (!spend.has(k)) spend.set(k, { company: e.company || '', day, spendDate: day || e.spendDate, paise: 0, entries: [] });
    const s = spend.get(k);
    s.paise += toPaise(e.total);
    s.entries.push(e);
  }

  const charge = new Map(); // row idx → { paise, nefts, campaigns, spendDates, deductDates, company, date }
  const days = [];
  for (const s of [...spend.values()].sort((a, b) => (a.spendDate < b.spendDate ? -1 : a.spendDate > b.spendDate ? 1 : 0))) {
    const orders = s.day ? ordersPaidOn(s.company, s.day) : [];
    days.push({ company: s.company, spendDate: s.spendDate, endDate: s.spendDate, amount: fromPaise(s.paise), targetDate: orders.length ? s.day : null, orders: orders.length });
    if (!orders.length) continue;

    const nefts = neftsOn(s.company, s.day);
    const campaigns = s.entries.map((e) => e.campaignId);
    const spendDates = s.entries.map((e) => e.spendDate);
    // Equal shares per payment row in whole paise; the odd paise go to the
    // first rows so the shares add up to the day's ads cost exactly.
    const base = Math.floor(s.paise / orders.length);
    let rest = s.paise - base * orders.length;
    for (const { idx, company } of orders) {
      const c = charge.get(idx) || { paise: 0, nefts: [], campaigns: [], spendDates: [], deductDates: [], company, date: s.day };
      c.paise += base + (rest > 0 ? 1 : 0);
      if (rest > 0) rest -= 1;
      c.nefts.push(...nefts);
      c.campaigns.push(...campaigns);
      c.spendDates.push(...spendDates);
      c.deductDates.push(s.day);
      charge.set(idx, c);
    }
  }

  const adOrders = [...charge.values()].map((c) => ({ company: c.company, date: c.date, charged: true }));
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
// the date range — a Deduction Date counts when it falls inside the range).
export function summarizeAds({ days = [], adOrders = [] } = {}, { company = 'all', dateFrom = null, dateTo = null } = {}) {
  if (!days.length) return null;
  const inRange = (d) => !d || ((!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo));
  const ofCompany = (c) => company === 'all' || !c || c === company;
  const shown = days.filter((d) => ofCompany(d.company) && inRange(d.spendDate));
  if (!shown.length) return null;
  let total = 0;
  let allocated = 0;
  const unallocatedDays = [];
  for (const d of shown) {
    total += toPaise(d.amount);
    if (d.targetDate) allocated += toPaise(d.amount);
    else unallocatedDays.push({ spendDate: d.spendDate, endDate: d.endDate || d.spendDate, amount: d.amount });
  }
  const orders = adOrders.filter((o) => ofCompany(o.company) && inRange(o.date));
  return {
    total: fromPaise(total),
    allocated: fromPaise(allocated),
    unallocated: fromPaise(total - allocated),
    unallocatedDays,
    carried: [],
    adOrders: orders.length,
    chargedOrders: orders.length,
  };
}
