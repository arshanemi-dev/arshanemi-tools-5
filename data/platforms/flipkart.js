import { STATUS, canonicalRow, num, absNum, toISODate } from './canonical.js';
import { rowLookup, headersHaveAny } from './aliases.js';

function mapStatus(raw) {
  const k = String(raw ?? '').trim().toLowerCase();
  if (k.includes('cancel')) return STATUS.CANCELLED;
  if (k.includes('return')) return STATUS.RETURN;
  if (k.includes('rto')) return STATUS.RTO;
  if (k.includes('exchange')) return STATUS.EXCHANGE;
  if (k.includes('pending') || k.includes('approved') || k.includes('packing')) return STATUS.PENDING;
  return STATUS.DELIVERED; // 'completed', 'delivered', 'shipped'
}

export default {
  id: 'flipkart',
  label: 'Flipkart',
  color: '#2874f0',
  kind: 'payment',

  matches(normSet, fname) {
    if (fname.includes('flipkart')) return true;
    return (
      headersHaveAny(normSet, ['Order_Item_ID', 'Order Item ID']) &&
      headersHaveAny(normSet, ['FSN', 'Bank_Payout_Date', 'Bank Settlement Value', 'Settlement_Value'])
    );
  },

  toCanonical(row) {
    const r = rowLookup(row);
    const orderItemId = r.get('Order_Item_ID', 'Order Item ID');
    if (!orderItemId) return null;
    const status = mapStatus(r.get('Order_State', 'Order Status', 'Event Type'));
    return canonicalRow({
      platform: 'flipkart',
      rowId: `flipkart:${orderItemId}`,
      orderId: String(r.get('Order_ID', 'Order Id') ?? orderItemId),
      orderItemId: String(orderItemId),
      orderDate: toISODate(r.get('Order_Date', 'Ordered On')),
      settlementDate: toISODate(r.get('Bank_Payout_Date', 'Settlement Date', 'NEFT Date')),
      sku: r.get('SKU', 'Seller SKU'),
      productName: r.get('Product_Title', 'Product', 'Title'),
      qty: Math.round(num(r.get('Item_Quantity', 'Quantity', 'Qty')) || 1),
      status,
      grossSale: num(r.get('Sale_Amount', 'Total Selling Price', 'Order Item Value', 'Customer_Paid_Amount')),
      settlement: num(r.get('Settlement_Value', 'Bank Settlement Value', 'Net Settlement Value')),
      fees: {
        commission: absNum(r.get('Marketplace_Fee', 'Commission', 'Commission Value')),
        paymentGateway: absNum(r.get('Payment_Gateway_Fee', 'Collection Fee')),
        pickPack: absNum(r.get('Pick_and_Pack_Fee', 'Pick And Pack Fee', 'Reverse Shipping Fee')),
        fixedFee: absNum(r.get('Fixed_Fee', 'Fixed Fee')),
        shippingLogistics: absNum(r.get('Shipping_Fee', 'Shipping Fee')),
      },
      taxes: {
        tcs: absNum(r.get('TCS_Amount', 'TCS')),
        tds: absNum(r.get('TDS_Amount', 'TDS')),
        gstOnFees: absNum(r.get('GST_Tax_Deducted', 'Total GST on Marketplace Fee', 'GST on MP Fees')),
      },
      meta: { fsn: r.get('FSN') ?? '' },
    });
  },
};
