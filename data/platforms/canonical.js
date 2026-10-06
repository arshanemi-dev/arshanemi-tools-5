// Canonical shapes every platform mapper produces and the engine consumes.
// A marketplace-specific quirk NEVER leaves data/platforms/<platform>.js —
// downstream (lib/profitLoss/engine.js, the dashboard UI) only sees these.

// ── Canonical order-row status ───────────────────────────────────────────────
export const STATUS = {
  DELIVERED: 'delivered',
  RETURN: 'return',
  RTO: 'rto',
  CANCELLED: 'cancelled',
  REFUND: 'refund',
  EXCHANGE: 'exchange',
  PENDING: 'pending',
};

// Buckets used by the KPI cards / details table.
export const RETURN_STATUSES = [STATUS.RETURN, STATUS.RTO, STATUS.REFUND];

// Generic status classifier — used by the Sheet Settings header-map override
// path (where the user re-points the Status column and we no longer have the
// platform mapper's own status vocabulary to lean on).
export function classifyStatus(raw) {
  const k = String(raw ?? '').trim().toLowerCase();
  if (!k) return STATUS.DELIVERED;
  if (k.includes('cancel')) return STATUS.CANCELLED;
  if (k.includes('rto')) return STATUS.RTO;
  if (k.includes('refund') || k.includes('reversal') || k.includes('chargeback')) return STATUS.REFUND;
  if (k.includes('return')) return STATUS.RETURN;
  if (k.includes('exchange')) return STATUS.EXCHANGE;
  if (k.includes('pending') || k.includes('processing') || k.includes('unsettled') || k.includes('hold')) return STATUS.PENDING;
  return STATUS.DELIVERED;
}

// ── Header normalisation ────────────────────────────────────────────────────
// "Sub_Order_ID" -> "suborderid" ; "TCS (0.5%)" -> "tcs05" ; "  Net  Payout " -> "netpayout"
export function normHeader(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./()%,:]+/g, '');
}

// ── Value coercion ─────────────────────────────────────────────────────────
// "-455.76" -> -455.76 ; "24.00%" -> 24 ; "1,299.00" -> 1299 ; "" / "-" -> 0
// Everything parseNumberish understands counts too — "(150.00)" (accounting
// negative), "−45" (unicode minus), "Rs. 50", "INR 1,200" used to fall
// through to 0 here, silently dropping that money from the settlement.
export function num(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const strict = parseNumberish(v);
  if (Number.isFinite(strict)) return strict;
  const cleaned = String(v).replace(/[₹$,\s]/g, '').replace(/%$/, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// Units on a row. A blank / unreadable quantity is `fallback` (one unit —
// most exports leave it off a single-unit order), but an explicit 0 stays 0:
// that's a fee or adjustment line, not an order, and must not add a unit.
export function qtyOf(v, fallback = 1) {
  const n = parseNumberish(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

export function absNum(v) {
  return Math.abs(num(v));
}

// Strict reader for a mapped sheet value going into a template's Number
// header: "1,299.00", "₹ 1,234", "Rs. 50", "24%", "(150.00)" (accounting
// negative), "−45" (unicode minus) → numbers; an id like "A1", text or a
// blank → NaN. Unlike num() (junk → 0) this keeps "not a number" apart
// from a real 0, so a column of text never silently sums to 0.
export function parseNumberish(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (v == null) return NaN;
  let s = String(v).trim();
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/^(rs\.?|inr)\s*/i, '').replace(/[₹$€£,\s]/g, '').replace(/%$/, '').replace(/[−–]/g, '-');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
  const n = Number(s);
  return neg ? -n : n;
}

// "Order Details › Sub Order No" → "Sub Order No" — the column's own name
// inside a header joined from several header rows (Template Settings).
export function leafHeader(h) {
  const s = String(h ?? '');
  const i = s.lastIndexOf(' › ');
  return i === -1 ? s : s.slice(i + 3).trim();
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const monthOf = (name) => MONTHS[String(name).slice(0, 3).toLowerCase()] || 0;
const fullYear = (y) => (String(y).length <= 2 ? 2000 + Number(y) : Number(y));

// y/m/d → "YYYY-MM-DD", or null when that day doesn't exist (31 Feb, month
// 20) or the year is nonsense (a stray number read as a date).
function ymd(y, m, d) {
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (!(year >= 1900 && year <= 2200)) return null;
  if (!(month >= 1 && month <= 12) || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Excel serial / "2026-08-20" / "2026/08/20" / "20-08-2026" / "20/08/2026 12:30"
// / "20-08-26" / "20-Aug-2026" / "20 Aug 2026" / "Aug 20, 2026" -> "YYYY-MM-DD" | null.
// The day is read straight off the text — never through a Date in local
// time, which lands a day early in India once it's converted back to UTC.
// Numeric dates are day-first (India); a "month" above 12 with a valid day
// in its place means the text was month-first ("08/20/2026"), so it's swapped.
export function toISODate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && v > 20000 && v < 90000) {
    // Excel serial date (days since 1899-12-30)
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/);
  if (m) return ymd(m[1], m[2], m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/);
  if (m) {
    const year = fullYear(m[3]);
    return Number(m[2]) > 12 && Number(m[1]) <= 12 ? ymd(year, m[1], m[2]) : ymd(year, m[2], m[1]);
  }
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[-/.\s]+([a-z]{3,9})\.?[-/.,\s]+(\d{4}|\d{2})(?!\d)/i);
  if (m && monthOf(m[2])) return ymd(fullYear(m[3]), monthOf(m[2]), m[1]);
  m = s.match(/^([a-z]{3,9})\.?[-/.\s]+(\d{1,2})(?:st|nd|rd|th)?[-/.,\s]+(\d{4})(?!\d)/i);
  if (m && monthOf(m[1])) return ymd(m[3], monthOf(m[1]), m[2]);
  // Anything else Date can read — its own LOCAL day, i.e. the day as written.
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

// Build a canonical row with every field defaulted, so a partial mapper output
// never null-crashes the engine.
export function canonicalRow(partial) {
  return {
    platform: partial.platform,
    rowId: partial.rowId ?? `${partial.platform}:${partial.orderId ?? Math.random().toString(36).slice(2)}`,
    orderId: partial.orderId ?? null,
    orderItemId: partial.orderItemId ?? partial.orderId ?? null,
    settlementId: partial.settlementId ?? null,
    orderDate: partial.orderDate ?? null,
    settlementDate: partial.settlementDate ?? null,
    sku: String(partial.sku ?? '').trim() || '—',
    productName: partial.productName ?? '',
    qty: Number.isFinite(partial.qty) ? partial.qty : 1,
    status: partial.status ?? STATUS.DELIVERED,
    grossSale: num(partial.grossSale),
    settlement: num(partial.settlement),
    shippingCredit: num(partial.shippingCredit),
    fees: {
      commission: 0, paymentGateway: 0, shippingLogistics: 0, fixedFee: 0,
      pickPack: 0, closingFee: 0, fbaFee: 0, platformFee: 0, rtoPenalty: 0, other: 0,
      ...(partial.fees ?? {}),
    },
    taxes: { tcs: 0, tds: 0, gstOnFees: 0, ...(partial.taxes ?? {}) },
    commissionRate: partial.commissionRate ?? null,
    // The brand picked in the toolbar before this file was uploaded, and the
    // "MarketPlace_Brand" combo derived from it — tagged onto every row by
    // mapRowsForPlatform's `tag` option, not extracted from the sheet.
    brand: partial.brand ?? null,
    company: partial.company ?? null,
    meta: partial.meta ?? {},
  };
}

// ── Details-table columns (exact order + labels from the reference) ─────────
export const SKU_COLUMNS = [
  { key: 'sku', label: 'Sku Name', type: 'text', align: 'left', sticky: true },
  { key: 'totalOrderQty', label: 'Total Order', type: 'int' },
  { key: 'settleOrderQty', label: 'Settle Order', type: 'int' },
  { key: 'productCost', label: 'Product Cost', type: 'money' },
  { key: 'profitLoss', label: 'Profit/Loss', type: 'money', signed: true },
  { key: 'returnPct', label: 'Return %', type: 'pct' },
  { key: 'cogs', label: 'COGS', type: 'money' },
  { key: 'bankStatement', label: 'Bank Statement', type: 'money', signed: true },
  { key: 'adsCost', label: 'Ads Cost', type: 'money' },
  { key: 'deliveredQty', label: 'Deliver', type: 'int' },
  { key: 'returnQty', label: 'Return', type: 'int' },
  { key: 'rtoQty', label: 'RTO', type: 'int' },
  { key: 'exchangeQty', label: 'Exchange', type: 'int' },
  { key: 'cancelledQty', label: 'Canceled', type: 'int' },
];

// The default "My Details" column set for anonymous / never-saved users.
export const DEFAULT_MY_COLUMNS = [
  'sku', 'totalOrderQty', 'settleOrderQty', 'profitLoss', 'returnPct', 'cogs', 'adsCost',
];

// ── KPI cards (exact order + labels from the reference) ────────────────────
export const KPI_CARDS = [
  { key: 'order', label: 'Order', meta: 'count', value: 'value', money: true },
  { key: 'return', label: 'Return', meta: 'count', value: 'value', money: true },
  { key: 'canceled', label: 'Canceled', meta: 'count', value: 'value', money: true },
  { key: 'rto', label: 'RTO', meta: 'count', value: 'value', money: true },
  { key: 'ads', label: 'Ads Cost', meta: 'pct', metaSuffix: '%', value: 'value', money: true },
  { key: 'profitLoss', label: 'Profit/Loss', meta: 'count', value: 'value', money: true, signed: true },
  { key: 'cogs', label: 'COGS', meta: 'count', value: 'value', money: true },
];

export function emptySummary() {
  return {
    order: { count: 0, value: 0 },
    return: { count: 0, value: 0 },
    canceled: { count: 0, value: 0 },
    rto: { count: 0, value: 0 },
    ads: { pct: 0, value: 0 },
    profitLoss: { count: 0, value: 0 },
    cogs: { count: 0, value: 0 },
  };
}
