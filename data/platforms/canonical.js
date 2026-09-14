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
export function num(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const cleaned = String(v).replace(/[₹$,\s]/g, '').replace(/%$/, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function absNum(v) {
  return Math.abs(num(v));
}

// Excel serial / "2026-08-20" / "20-08-2026" / "20/08/2026 12:30" -> "YYYY-MM-DD" | null
export function toISODate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && v > 20000 && v < 90000) {
    // Excel serial date (days since 1899-12-30)
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
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
