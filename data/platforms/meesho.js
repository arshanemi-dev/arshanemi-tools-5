import { STATUS, canonicalRow, num, absNum, toISODate } from './canonical.js';
import { rowLookup, headersHaveAny } from './aliases.js';

const STATUS_MAP = {
  delivered: STATUS.DELIVERED,
  shipped: STATUS.DELIVERED,
  door_step_exchanged: STATUS.EXCHANGE,
  rto: STATUS.RTO,
  rto_return: STATUS.RTO,
  rto_complete: STATUS.RTO,
  return: STATUS.RETURN,
  customer_return: STATUS.RETURN,
  cancelled: STATUS.CANCELLED,
  cancel: STATUS.CANCELLED,
};

function mapStatus(raw) {
  const k = String(raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (STATUS_MAP[k]) return STATUS_MAP[k];
  if (k.includes('rto')) return STATUS.RTO;
  if (k.includes('return')) return STATUS.RETURN;
  if (k.includes('cancel')) return STATUS.CANCELLED;
  if (k.includes('exchange')) return STATUS.EXCHANGE;
  return STATUS.DELIVERED;
}

export default {
  id: 'meesho',
  label: 'Meesho',
  color: '#f5308c',
  kind: 'payment',

  matches(normSet, fname) {
    if (fname.includes('paymentdashboardorderlevel') || fname.includes('meesho')) return true;
    return (
      headersHaveAny(normSet, ['Sub_Order_ID', 'Sub Order No', 'Sub-order ID']) &&
      headersHaveAny(normSet, ['Meesho_Commission', 'Net_Payout', 'Final Settlement Amount'])
    );
  },

  toCanonical(row) {
    const r = rowLookup(row);
    const orderId = r.get('Sub_Order_ID', 'Sub Order No', 'Sub-order ID');
    if (!orderId) return null;
    const status = mapStatus(r.get('Order_Status', 'Live Order Status', 'Reason for Credit Entry'));
    return canonicalRow({
      platform: 'meesho',
      rowId: `meesho:${orderId}`,
      orderId: String(orderId),
      orderItemId: String(orderId),
      orderDate: toISODate(r.get('Order_Date')),
      settlementDate: toISODate(r.get('Payment_Settlement_Date', 'Settlement Date')),
      sku: r.get('SKU', 'Supplier SKU'),
      productName: r.get('Product_Name', 'Product Name'),
      qty: Math.round(num(r.get('Quantity', 'Qty')) || 1),
      status,
      grossSale: num(r.get('Gross_Sale_Amount', 'Listed Price', 'Final Customer Price', 'Supplier Listed Price')),
      settlement: num(r.get('Net_Payout', 'Final Settlement Amount')),
      fees: {
        commission: absNum(r.get('Meesho_Commission', 'Meesho Commission (incl GST)')),
        shippingLogistics: absNum(r.get('Shipping_Fee', 'Shipping Charge', 'Total Shipping Charge')),
        fixedFee: absNum(r.get('Fixed_Fee', 'Fixed Fee')),
        rtoPenalty: absNum(r.get('RTO_Penalty', 'RTO Charges')),
      },
      taxes: {
        tcs: absNum(r.get('TCS_0_5_Percent', 'TCS')),
        tds: absNum(r.get('TDS_0_1_Percent', 'TDS')),
      },
      meta: { customerState: r.get('Customer_State') ?? '' },
    });
  },
};
