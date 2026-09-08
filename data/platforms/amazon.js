import { STATUS, canonicalRow, num, absNum, toISODate } from './canonical.js';
import { rowLookup, headersHaveAny } from './aliases.js';

// Amazon's export is one row per order-item within a settlement group. A
// "Refund" row carries negative Quantity / negative Item_Price and reversed
// fee signs — we keep qty negative and bucket it as a refund so the engine
// nets it out of the delivered totals.
function mapType(raw) {
  const k = String(raw ?? '').trim().toLowerCase();
  if (k.includes('refund') || k.includes('return') || k.includes('reversal')) return STATUS.REFUND;
  if (k.includes('cancel')) return STATUS.CANCELLED;
  if (k.includes('chargeback')) return STATUS.REFUND;
  return STATUS.DELIVERED;
}

export default {
  id: 'amazon',
  label: 'Amazon',
  color: '#ff9900',
  kind: 'payment',

  matches(normSet, fname) {
    if (fname.includes('amazon') || fname.includes('mtr') || fname.includes('settlement')) {
      if (headersHaveAny(normSet, ['Settlement_ID', 'settlement-id', 'ASIN'])) return true;
    }
    return (
      headersHaveAny(normSet, ['Settlement_ID', 'settlement-id']) &&
      headersHaveAny(normSet, ['ASIN', 'Amazon_Order_ID', 'amazon-order-id'])
    );
  },

  toCanonical(row) {
    const r = rowLookup(row);
    const orderId = r.get('Amazon_Order_ID', 'amazon-order-id', 'order-id');
    if (!orderId) return null;
    const status = mapType(r.get('Order_Type', 'transaction-type', 'type'));
    const rawQty = num(r.get('Quantity', 'quantity-purchased', 'Qty'));
    const qty = Math.round(rawQty || (status === STATUS.REFUND ? -1 : 1));
    return canonicalRow({
      platform: 'amazon',
      rowId: `amazon:${orderId}:${r.get('SKU', 'sku') ?? ''}:${status}`,
      orderId: String(orderId),
      orderItemId: String(orderId),
      settlementId: String(r.get('Settlement_ID', 'settlement-id') ?? ''),
      orderDate: toISODate(r.get('Posted_Date', 'posted-date', 'Order_Date')),
      settlementDate: toISODate(r.get('Posted_Date', 'posted-date', 'deposit-date')),
      sku: r.get('SKU', 'sku', 'seller-sku'),
      productName: r.get('Product_Name', 'product-name'),
      qty,
      status,
      grossSale: num(r.get('Item_Price', 'Principal', 'item-price')),
      shippingCredit: num(r.get('Shipping_Credit', 'ShippingCharge', 'shipping-price')),
      settlement: num(r.get('Net_Amount', 'total-amount', 'Net Amount')),
      fees: {
        commission: absNum(r.get('Referral_Fee', 'Commission', 'ItemFees')),
        closingFee: absNum(r.get('Closing_Fee', 'FixedClosingFee', 'VariableClosingFee')),
        fbaFee: absNum(r.get('FBA_Weight_Handling_Fee', 'FBAPerUnitFulfillmentFee', 'FBAWeightHandling')),
      },
      taxes: {
        tcs: absNum(r.get('TCS_CGST')) + absNum(r.get('TCS_SGST')) + absNum(r.get('TCS_IGST')) + absNum(r.get('TCS')),
        tds: absNum(r.get('TDS_Sec_194O', 'TDS')),
      },
      meta: { asin: r.get('ASIN', 'asin') ?? '' },
    });
  },
};
