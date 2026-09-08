import { STATUS, canonicalRow, num, absNum, toISODate } from './canonical.js';
import { rowLookup, headersHaveAny } from './aliases.js';

function mapStatus(raw) {
  const k = String(raw ?? '').trim().toLowerCase();
  if (k.includes('return')) return STATUS.RETURN;
  if (k.includes('rto')) return STATUS.RTO;
  if (k.includes('cancel')) return STATUS.CANCELLED;
  if (k.includes('exchange')) return STATUS.EXCHANGE;
  if (k.includes('pending') || k.includes('unsettled') || k.includes('in_process')) return STATUS.PENDING;
  return STATUS.DELIVERED; // 'settled'
}

export default {
  id: 'myntra',
  label: 'Myntra',
  color: '#ff3f6c',
  kind: 'payment',

  matches(normSet, fname) {
    if (fname.includes('myntra') || fname.includes('ppmp') || fname.includes('pgforward')) return true;
    return (
      headersHaveAny(normSet, ['Release_ID', 'Order Release ID', 'Order_Release_ID']) &&
      headersHaveAny(normSet, ['Style_ID', 'Myntra Style ID', 'Vendor_SKU', 'Vendor Article Number'])
    );
  },

  toCanonical(row) {
    const r = rowLookup(row);
    const orderId = r.get('Myntra_Order_ID', 'Order Line ID', 'Order Release ID', 'Release_ID');
    if (!orderId) return null;
    const status = mapStatus(r.get('Settlement_Status', 'Order Status'));
    const styleId = r.get('Style_ID', 'Myntra Style ID');
    return canonicalRow({
      platform: 'myntra',
      rowId: `myntra:${orderId}:${styleId ?? ''}`,
      orderId: String(orderId),
      orderItemId: String(orderId),
      settlementId: String(r.get('Release_ID', 'Settlement ID') ?? ''),
      orderDate: toISODate(r.get('Order_Release_Date', 'Order Created Date', 'Created On')),
      settlementDate: toISODate(r.get('Settlement_Date', 'PG Settlement Date')),
      sku: r.get('Vendor_SKU', 'Vendor Article Number', 'Seller SKU', 'SKU'),
      productName: r.get('Product_Name', 'Article Name'),
      qty: Math.round(num(r.get('Quantity', 'Qty')) || 1),
      status,
      grossSale: num(r.get('Gross_Sales', 'Final Amount', 'MRP', 'Total MRP')),
      settlement: num(r.get('Net_Settlement_Amount', 'Settlement Value', 'Net Amount')),
      commissionRate: (() => {
        const v = num(r.get('Commission_Rate', 'Commission %'));
        return v ? v : null;
      })(),
      fees: {
        commission: absNum(r.get('Commission_Amount', 'Commission', 'Marketplace Fee')),
        shippingLogistics: absNum(r.get('Logistics_Deduction', 'Logistics Fee', 'Shipping Fee')),
        platformFee: absNum(r.get('Platform_Fee', 'Fixed Fee', 'Tech Enablement Fee')),
      },
      taxes: {
        tcs: absNum(r.get('TCS_194O', 'TCS')),
        tds: absNum(r.get('TDS_0_1', 'TDS')),
      },
      meta: { styleId: styleId ?? '', category: r.get('Category') ?? '' },
    });
  },
};
