import { STATUS, RETURN_STATUSES, emptySummary } from '@/data/platforms/canonical';

// Pure. canonicalRows[] + a SKU→cost map + an ads config + filters →
// { summary (KPI cards), skuRows (details table), rowCount, platforms }.
//
//   profitLoss = settlementAmount − productCost − adsCost
// Marketplace commission / shipping / TCS / TDS are ALREADY netted inside the
// per-row `settlement` figure every mapper emits, so they are not subtracted
// again here — they're only surfaced in the fee/tax breakdown for display.

function inRange(iso, from, to) {
  if (!iso) return true; // undated rows always pass — don't silently drop money
  if (from && iso < from) return false;
  if (to && iso > to) return false;
  return true;
}

export function computeProfitLoss(canonicalRows, opts = {}) {
  const {
    skuCostMap = {},
    ads = { mode: 'percent', value: 0 }, // {mode:'percent'|'flat', value:number}
    dateFrom = null,
    dateTo = null,
    platform = 'all', // 'all' | platform id
  } = opts;

  const rows = canonicalRows.filter(
    (r) =>
      (platform === 'all' || r.platform === platform) &&
      inRange(r.orderDate, dateFrom, dateTo),
  );

  const bySku = new Map();
  const getBucket = (sku) => {
    if (!bySku.has(sku)) {
      bySku.set(sku, {
        sku,
        deliveredQty: 0, returnQty: 0, rtoQty: 0, cancelledQty: 0,
        exchangeQty: 0, pendingQty: 0, totalOrderQty: 0,
        totalOrderValue: 0, returnValue: 0,
        settleOrderQty: 0, settlementAmt: 0, bankStatement: 0,
        unitCost: skuCostMap[sku] ?? null,
        _grossFees: 0, _grossTax: 0,
      });
    }
    return bySku.get(sku);
  };

  for (const r of rows) {
    const b = getBucket(r.sku);
    const q = Math.abs(r.qty || 0) || 1;

    switch (r.status) {
      case STATUS.DELIVERED: b.deliveredQty += q; break;
      case STATUS.RETURN: b.returnQty += q; break;
      case STATUS.REFUND: b.returnQty += q; break;
      case STATUS.RTO: b.rtoQty += q; break;
      case STATUS.CANCELLED: b.cancelledQty += q; break;
      case STATUS.EXCHANGE: b.exchangeQty += q; break;
      case STATUS.PENDING: b.pendingQty += q; break;
      default: b.deliveredQty += q;
    }

    if (r.status === STATUS.DELIVERED || r.status === STATUS.PENDING) {
      b.totalOrderValue += r.grossSale;
    }
    if (RETURN_STATUSES.includes(r.status)) {
      b.returnValue += r.grossSale || Math.abs(r.settlement);
    }

    b.settlementAmt += r.settlement;
    if (inRange(r.settlementDate, dateFrom, dateTo)) {
      b.bankStatement += r.settlement;
      if (r.settlementDate) b.settleOrderQty += r.qty;
    } else if (!r.settlementDate && r.status === STATUS.DELIVERED) {
      b.settleOrderQty += r.qty;
    }

    b._grossFees += Object.values(r.fees).reduce((s, n) => s + (n || 0), 0);
    b._grossTax += (r.taxes.tcs || 0) + (r.taxes.tds || 0) + (r.taxes.gstOnFees || 0);
  }

  // First pass done. Total settlement drives pro-rata flat-ads allocation.
  const totalSettle = [...bySku.values()].reduce((s, b) => s + b.settlementAmt, 0);
  const adsPct = ads.mode === 'percent' ? Number(ads.value) || 0 : null;
  const adsFlat = ads.mode === 'flat' ? Number(ads.value) || 0 : 0;

  const skuRows = [];
  const summary = emptySummary();
  let totalAds = 0;

  for (const b of bySku.values()) {
    b.totalOrderQty =
      b.deliveredQty + b.returnQty + b.rtoQty + b.cancelledQty + b.exchangeQty + b.pendingQty;

    const productCost = b.unitCost != null ? b.unitCost * b.deliveredQty : 0;
    const cogs = productCost;

    let adsCost;
    if (ads.mode === 'percent') {
      adsCost = (b.settlementAmt * adsPct) / 100;
    } else {
      adsCost = totalSettle !== 0 ? adsFlat * (b.settlementAmt / totalSettle) : 0;
    }
    totalAds += adsCost;

    const returnPct = b.totalOrderQty ? (b.returnQty / b.totalOrderQty) * 100 : 0;
    const profitLoss = b.settlementAmt - productCost - adsCost;

    const outRow = {
      sku: b.sku,
      totalOrderQty: round(b.totalOrderQty),
      settleOrderQty: round(b.settleOrderQty),
      productCost: round2(productCost),
      profitLoss: round2(profitLoss),
      returnPct: round2(returnPct),
      cogs: round2(cogs),
      bankStatement: round2(b.bankStatement),
      adsCost: round2(adsCost),
      deliveredQty: round(b.deliveredQty),
      returnQty: round(b.returnQty),
      rtoQty: round(b.rtoQty),
      exchangeQty: round(b.exchangeQty),
      cancelledQty: round(b.cancelledQty),
      settlementAmt: round2(b.settlementAmt),
      totalOrderValue: round2(b.totalOrderValue),
      returnValue: round2(b.returnValue),
      hasCost: b.unitCost != null,
      fees: round2(b._grossFees),
      taxes: round2(b._grossTax),
    };
    skuRows.push(outRow);

    summary.order.count += b.totalOrderQty;
    summary.order.value += b.totalOrderValue;
    summary.return.count += b.returnQty;
    summary.return.value += b.returnValue;
    summary.canceled.count += b.cancelledQty;
    summary.rto.count += b.rtoQty;
    summary.profitLoss.value += profitLoss;
    summary.cogs.value += cogs;
  }

  summary.ads.value = round2(totalAds);
  summary.ads.pct = adsPct != null
    ? round2(adsPct)
    : (totalSettle !== 0 ? round2((totalAds / totalSettle) * 100) : 0);
  summary.profitLoss.count = skuRows.filter((r) => r.settleOrderQty > 0).length;
  summary.cogs.count = skuRows.filter((r) => r.hasCost && r.cogs > 0).length;
  for (const k of ['order', 'return', 'canceled', 'rto', 'profitLoss', 'cogs']) {
    summary[k].count = round(summary[k].count);
    summary[k].value = round2(summary[k].value);
  }

  skuRows.sort((a, b) => Math.abs(b.profitLoss) - Math.abs(a.profitLoss));

  const platforms = [...new Set(rows.map((r) => r.platform))];
  return { summary, skuRows, rowCount: rows.length, platforms };
}

function round(n) { return Math.round(n); }
function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
