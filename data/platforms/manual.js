import { STATUS, canonicalRow, num, absNum, toISODate } from './canonical.js';
import { rowLookup } from './aliases.js';

// Fallback when auto-detection fails. `mapping` is a {canonicalField: headerName}
// object the user builds in the column-mapper UI; `toCanonical` is called with
// each row and the mapping bound. Sensible column-name guesses are pre-filled.
export const CANONICAL_FIELDS = [
  { key: 'orderId', label: 'Order ID', required: true },
  { key: 'sku', label: 'SKU', required: true },
  { key: 'orderDate', label: 'Order date' },
  { key: 'settlementDate', label: 'Settlement / payout date' },
  { key: 'qty', label: 'Quantity' },
  { key: 'status', label: 'Order status' },
  { key: 'grossSale', label: 'Gross sale amount' },
  { key: 'settlement', label: 'Net settlement / payout' },
  { key: 'commission', label: 'Commission fee' },
  { key: 'shippingLogistics', label: 'Shipping / logistics fee' },
  { key: 'tcs', label: 'TCS' },
  { key: 'tds', label: 'TDS' },
];

const GUESSES = {
  orderId: ['order id', 'order_id', 'sub order id', 'order item id', 'transaction id'],
  sku: ['sku', 'sku code', 'seller sku', 'vendor sku'],
  orderDate: ['order date', 'order_date', 'ordered on'],
  settlementDate: ['settlement date', 'payout date', 'bank payout date', 'posted date'],
  qty: ['quantity', 'qty'],
  status: ['status', 'order status', 'order state', 'order_type'],
  grossSale: ['gross sale amount', 'sale amount', 'item price', 'gross sales', 'order value'],
  settlement: ['net payout', 'settlement value', 'net amount', 'net settlement amount', 'net payable'],
  commission: ['commission', 'marketplace fee', 'referral fee'],
  shippingLogistics: ['shipping fee', 'logistics deduction', 'logistic fees'],
  tcs: ['tcs'],
  tds: ['tds'],
};

export function guessMapping(headerRow = []) {
  const out = {};
  const lower = headerRow.map((h) => String(h).trim().toLowerCase());
  for (const [field, cands] of Object.entries(GUESSES)) {
    const hit = cands
      .map((c) => headerRow[lower.indexOf(c)])
      .find(Boolean);
    if (hit) out[field] = hit;
  }
  return out;
}

function mapStatus(raw) {
  const k = String(raw ?? '').trim().toLowerCase();
  if (k.includes('cancel')) return STATUS.CANCELLED;
  if (k.includes('rto')) return STATUS.RTO;
  if (k.includes('refund')) return STATUS.REFUND;
  if (k.includes('return')) return STATUS.RETURN;
  if (k.includes('exchange')) return STATUS.EXCHANGE;
  if (k.includes('pending') || k.includes('processing')) return STATUS.PENDING;
  return STATUS.DELIVERED;
}

export default {
  id: 'manual',
  label: 'Manual',
  color: '#6b7280',
  kind: 'manual',
  needsMapping: true,

  matches() {
    return false; // never auto-detected
  },

  toCanonical(row, mapping = {}) {
    const r = rowLookup(row);
    const pick = (f) => (mapping[f] ? r.raw[mapping[f]] : undefined);
    const orderId = pick('orderId');
    if (!orderId) return null;
    return canonicalRow({
      platform: 'manual',
      rowId: `manual:${orderId}:${pick('sku') ?? ''}`,
      orderId: String(orderId),
      orderItemId: String(orderId),
      orderDate: toISODate(pick('orderDate')),
      settlementDate: toISODate(pick('settlementDate')),
      sku: pick('sku'),
      qty: Math.round(num(pick('qty')) || 1),
      status: mapStatus(pick('status')),
      grossSale: num(pick('grossSale')),
      settlement: num(pick('settlement')),
      fees: {
        commission: absNum(pick('commission')),
        shippingLogistics: absNum(pick('shippingLogistics')),
      },
      taxes: { tcs: absNum(pick('tcs')), tds: absNum(pick('tds')) },
    });
  },
};
