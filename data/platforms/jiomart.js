import { STATUS, canonicalRow, num, absNum, toISODate } from './canonical.js';
import { rowLookup, headersHaveAny } from './aliases.js';

function mapStatus(payoutStatus, settlement) {
  const k = String(payoutStatus ?? '').trim().toLowerCase();
  if (k.includes('return')) return STATUS.RETURN;
  if (k.includes('rto')) return STATUS.RTO;
  if (k.includes('cancel')) return STATUS.CANCELLED;
  if (k.includes('processing') || k.includes('pending') || k.includes('hold')) return STATUS.PENDING;
  // No explicit return status column in the sample — a negative net payout on
  // an otherwise "paid" row is a clawback (return/RTO adjustment).
  if (k.includes('paid') && num(settlement) < 0) return STATUS.RETURN;
  return STATUS.DELIVERED;
}

export default {
  id: 'jiomart',
  label: 'JioMart',
  color: '#0093d3',
  kind: 'payment',

  matches(normSet, fname) {
    if (fname.includes('jiomart') || fname.includes('disbursement') || fname.includes('reliance')) return true;
    return (
      headersHaveAny(normSet, ['Jio_Transaction_ID', 'Jio Transaction ID']) &&
      headersHaveAny(normSet, ['Merchant_Ref_No', 'Merchant Ref No', 'Net_Payout_Amount', 'Net Payable'])
    );
  },

  toCanonical(row) {
    const r = rowLookup(row);
    const txnId = r.get('Jio_Transaction_ID', 'Jio Transaction ID', 'Transaction ID');
    const refNo = r.get('Merchant_Ref_No', 'Merchant Ref No', 'Order ID', 'Shipment ID');
    if (!txnId && !refNo) return null;
    const settlement = num(r.get('Net_Payout_Amount', 'Net Payable', 'Settlement Amount'));
    const status = mapStatus(r.get('Payout_Status', 'Order Status'), settlement);
    return canonicalRow({
      platform: 'jiomart',
      rowId: `jiomart:${txnId ?? refNo}`,
      orderId: String(refNo ?? txnId),
      orderItemId: String(txnId ?? refNo),
      orderDate: toISODate(r.get('Order_Date', 'Order Date')),
      settlementDate: toISODate(r.get('Payout_Date', 'Settlement Date', 'Disbursement Date')),
      sku: r.get('SKU_Code', 'Seller SKU', 'SKU', 'EAN'),
      productName: r.get('Item_Description', 'Product Description', 'Item Name'),
      qty: Math.round(num(r.get('Quantity', 'Qty')) || 1),
      status,
      grossSale: num(r.get('Order_Value', 'Item Total', 'Gross Amount')),
      settlement,
      fees: {
        commission: absNum(r.get('Jio_Commission', 'Marketplace Fee', 'Commission')),
        paymentGateway: absNum(r.get('PG_Charges', 'Payment Gateway Fee')),
        shippingLogistics: absNum(r.get('Logistic_Fees', 'Logistics Fee', 'Fulfilment Charge')),
      },
      taxes: {
        tcs: absNum(r.get('TCS_Deduction', 'TCS')),
        tds: absNum(r.get('TDS_Deduction', 'TDS')),
        gstOnFees: absNum(r.get('GST_On_Fees', 'GST on Fees')),
      },
      meta: { paymentMode: r.get('Payment_Mode') ?? '' },
    });
  },
};
