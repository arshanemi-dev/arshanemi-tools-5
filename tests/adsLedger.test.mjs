import assert from 'node:assert/strict';
import test from 'node:test';
import { readAdsLines, readAdsLedger, mergeAdsLedger, allocateAds, summarizeAds, isAdOrderRow, adsWindow } from '../lib/profitLoss/adsLedger.js';
import { computeProfitLoss } from '../lib/profitLoss/engine.js';
import { runCalculationTask } from '../lib/profitLoss/calculationTasks.js';
import { canonicalRow, STATUS } from '../data/platforms/canonical.js';
import { DEFAULT_HEADERS } from '../data/defaultHeaders.js';

// The Meesho "Ads Cost" tab as it comes: a merged banner, the header, a
// formula legend, then amounts (Ad Cost positive, the rest negative).
const ADS_SHEET = [
  ['Ads Cost', 'Ads Cost', 'Ads Cost', 'Ads Cost', 'Ads Cost', 'Ads Cost', 'Ads Cost', 'Ads Cost'],
  ['Deduction Duration', 'Deduction Date', 'Campaign ID', 'Ad Cost', 'Credits / Waivers / Discounts', 'Ad Cost incl. Credits/Waivers/Discounts', 'GST', 'Total Ads Cost'],
  ['', '', '', 'A', 'B', '(A + B)', '', ''],
  ['2026-07-04', '2026-07-06', '23708695', '1162.83', '0', '-1162.83', '-209.31', '-1372.14'],
  ['2026-07-05', '2026-07-07', '23788364', '1090.13', '0', '-1090.13', '-196.22', '-1286.35'],
  ['2026-07-05', '2026-07-07', '23708695', '1.6', '0', '-1.6', '-0.29', '-1.89'],
  ['2026-07-26', '2026-07-28', '24521727', '8.95', '0', '-8.95', '-1.61', '-10.56'],
];

const order = (id, date, { ad = true, status = STATUS.DELIVERED, company = 'Meesho_Freelax', txn = null, payDate = null, sku = 'SKU-A' } = {}) => {
  const r = canonicalRow({ platform: 'meesho', orderId: id, orderDate: date, sku, status, settlement: 100, qty: 1 });
  r.company = company;
  r.meta = { 'Sub Order No': id, 'Order source': ad ? 'Ad order' : '', ...(txn ? { 'Transaction ID': txn, 'Payment Date': payDate } : {}) };
  return r;
};

test('reads the Ads Cost tab: legend skipped, deducted totals positive', () => {
  const entries = readAdsLines(ADS_SHEET);
  assert.equal(entries.length, 4);
  assert.deepEqual(entries[0], { key: '2026-07-04|23708695|2026-07-06', spendDate: '2026-07-04', deductDate: '2026-07-06', campaignId: '23708695', adCost: 1162.83, gst: 209.31, total: 1372.14 });
  assert.equal(readAdsLines([['Sub Order No', 'SKU'], ['1', 'x']]).length, 0, 'an orders sheet is not an ads sheet');
});

test('finds the ads tab by its headers, or by name when the slot skipped it', () => {
  const byTab = { 'Order Payments': { headerRow: ['Sub Order No'], rows: [{ 'Sub Order No': '1' }] } };
  const raw = { 'Ads Cost': ADS_SHEET, Disclaimer: [['text']] };
  const entries = readAdsLedger(['Disclaimer', 'Order Payments', 'Ads Cost'], byTab, (name) => raw[name]);
  assert.equal(entries.length, 4);
});

test('re-uploading a month replaces its entries instead of doubling them', () => {
  const first = mergeAdsLedger([], readAdsLines(ADS_SHEET), 'Meesho_Freelax');
  const again = mergeAdsLedger(first, readAdsLines(ADS_SHEET), 'Meesho_Freelax');
  assert.equal(again.length, 4);
  const other = mergeAdsLedger(again, readAdsLines(ADS_SHEET), 'Meesho_Other');
  assert.equal(other.length, 8, 'another account keeps its own');
});

test("a duration's spend is split equally over the ad orders in it, to the paisa, with its NEFT", () => {
  const ledger = mergeAdsLedger([], readAdsLines(ADS_SHEET), 'Meesho_Freelax');
  const rows = [
    order('A1_1', '2026-07-04'),
    order('A2_1', '2026-07-04', { status: STATUS.RTO }),
    order('A3_1', '2026-07-04', { status: STATUS.CANCELLED }),
    order('N1_1', '2026-07-04', { ad: false }),
    order('B1_1', '2026-07-05'),
    order('B2_1', '2026-07-05'),
    // a payout row of an unrelated order tells which NEFT paid on each day
    order('P1_1', '2026-07-01', { ad: false, txn: 'AXISCN1397709717', payDate: '2026-07-06' }),
    order('P2_1', '2026-07-01', { ad: false, txn: 'AXISCN1398625727', payDate: '2026-07-07' }),
  ];
  const before = JSON.stringify(rows);
  const { rows: out, days } = allocateAds(rows, ledger);
  assert.equal(JSON.stringify(rows), before, 'saved rows are never mutated');

  const cost = (id) => out.find((r) => r.orderId === id).adsAlloc?.cost ?? 0;
  // 4–6 Jul: 1372.14 over the 5 ad orders in it (RTO + cancelled carry their
  // share) = 274.428 → four get 274.43, one 274.42
  assert.equal(cost('A1_1'), 274.43);
  assert.equal(cost('A2_1'), 274.43);
  assert.equal(cost('A3_1'), 274.43);
  assert.equal(cost('N1_1'), 0, 'organic orders carry no ads');
  // 5–7 Jul: two campaigns, 1288.24 over the 2 orders of 5 Jul, on top of
  // their 4–6 Jul share (both windows cover 5 Jul)
  assert.equal(cost('B1_1'), 274.43 + 644.12);
  assert.equal(cost('B2_1'), 274.42 + 644.12);
  const total = ['A1_1', 'A2_1', 'A3_1', 'B1_1', 'B2_1'].reduce((s, id) => s + Math.round(cost(id) * 100), 0);
  assert.equal(total, 137214 + 128824, 'every paisa of both windows lands');
  const b1 = out.find((r) => r.orderId === 'B1_1');
  assert.equal(b1.adsAlloc.neftIds, 'AXISCN1397709717, AXISCN1398625727');
  assert.equal(b1.adsAlloc.campaignIds, '23708695, 23788364');
  assert.equal(b1.meta['Ads Spend Date'], '2026-07-04, 2026-07-05');
  assert.equal(out.find((r) => r.orderId === 'A1_1').adsAlloc.neftIds, 'AXISCN1397709717');
  // 26–28 Jul had no ad orders, nor within 3 days after → unallocated, reported
  assert.deepEqual(days.find((d) => d.spendDate === '2026-07-26'), { company: 'Meesho_Freelax', spendDate: '2026-07-26', endDate: '2026-07-28', amount: 10.56, targetDate: null, orders: 0 });
});

test('Meesho line 29 Jun → 1 Jul, ₹35.12: split over the ad orders of 29, 30 Jun and 1 Jul only', () => {
  const ledger = readAdsLines([
    ['Deduction Duration', 'Deduction Date', 'Campaign ID', 'Ad Cost', 'Credits / Waivers / Discounts', 'Ad Cost incl. Credits/Waivers/Discounts', 'GST', 'Total Ads Cost'],
    ['2026-06-29', '2026-07-01', '23424479', '29.76', '0', '-29.76', '-5.36', '-35.12'],
  ]);
  const rows = [
    order('before', '2026-06-28'),
    order('d29', '2026-06-29'),
    order('d30a', '2026-06-30'),
    order('d30b', '2026-06-30'),
    order('d01', '2026-07-01'),
    order('after', '2026-07-02'),
  ];
  const { rows: out, days } = allocateAds(rows, ledger);
  const cost = (id) => out.find((r) => r.orderId === id).adsAlloc?.cost ?? 0;
  // 35.12 / 4 = 8.78 each
  assert.deepEqual(['d29', 'd30a', 'd30b', 'd01'].map(cost), [8.78, 8.78, 8.78, 8.78]);
  assert.equal(cost('before'), 0, 'before the duration');
  assert.equal(cost('after'), 0, 'after the deduction date');
  assert.deepEqual(days[0], { company: '', spendDate: '2026-06-29', endDate: '2026-07-01', amount: 35.12, targetDate: '2026-07-01', orders: 4 });
});

test('no / earlier / implausible Deduction Date → the start day alone', () => {
  assert.deepEqual(adsWindow({ spendDate: '2026-07-10', deductDate: null }), { from: '2026-07-10', to: '2026-07-10' });
  assert.deepEqual(adsWindow({ spendDate: '2026-07-10', deductDate: '2026-07-08' }), { from: '2026-07-10', to: '2026-07-10' });
  assert.deepEqual(adsWindow({ spendDate: '2026-07-10', deductDate: '2026-09-30' }), { from: '2026-07-10', to: '2026-07-10' });
  assert.deepEqual(adsWindow({ spendDate: '2026-07-10', deductDate: '2026-07-12' }), { from: '2026-07-10', to: '2026-07-12' });
});

test('odd paise: shares still add up to the day exactly', () => {
  const ledger = [{ key: 'k', company: '', spendDate: '2026-07-10', deductDate: null, campaignId: 'c', total: 100 }];
  const rows = ['a', 'b', 'c'].map((id) => order(id, '2026-07-10'));
  const { rows: out } = allocateAds(rows, ledger);
  const shares = out.map((r) => r.adsAlloc.cost);
  assert.deepEqual(shares, [33.34, 33.33, 33.33]);
});

test('a duration with no ad orders stretches to the next day (within 3) after it that has some', () => {
  const ledger = [{ key: 'k', company: 'Meesho_Freelax', spendDate: '2026-07-26', deductDate: '2026-07-28', campaignId: 'c', total: 10.56 }];
  const rows = [order('x', '2026-07-30'), order('y', '2026-07-31')];
  const { rows: out, days } = allocateAds(rows, ledger);
  assert.equal(out[0].adsAlloc.cost, 10.56);
  assert.equal(out[1].adsAlloc, undefined, 'stops at the first day that has ad orders');
  assert.equal(days[0].targetDate, '2026-07-30');
  const info = summarizeAds({ days, adOrders: [] }, {});
  assert.deepEqual(info.carried, [{ spendDate: '2026-07-26', endDate: '2026-07-28', targetDate: '2026-07-30', amount: 10.56 }]);
});

test('an order seen in several rows (payout + return, orders sheet) is charged once', () => {
  const ledger = [{ key: 'k', company: 'Meesho_Freelax', spendDate: '2026-07-10', deductDate: null, campaignId: 'c', total: 50 }];
  const rows = [order('a', '2026-07-10', { txn: 'T1', payDate: '2026-07-15' }), order('a', '2026-07-10', { txn: 'T2', payDate: '2026-07-20' }), order('b', '2026-07-10')];
  const { rows: out } = allocateAds(rows, ledger);
  assert.deepEqual(out.map((r) => r.adsAlloc?.cost ?? 0), [25, 0, 25]);
});

test('accounts never share each other\'s spend', () => {
  const ledger = [{ key: 'k', company: 'Meesho_A', spendDate: '2026-07-10', deductDate: null, campaignId: 'c', total: 40 }];
  const rows = [order('a', '2026-07-10', { company: 'Meesho_A' }), order('b', '2026-07-10', { company: 'Meesho_B' })];
  const { rows: out } = allocateAds(rows, ledger);
  assert.equal(out[0].adsAlloc.cost, 40);
  assert.equal(out[1].adsAlloc, undefined);
});

test('no ledger: rows untouched, same array', () => {
  const rows = [order('a', '2026-07-10')];
  assert.equal(allocateAds(rows, []).rows, rows);
  assert.equal(isAdOrderRow(rows[0]), true);
});

test('engine: allocated ads become the SKU\'s Ads Cost and come off Profit/Loss', () => {
  const rows = [order('a', '2026-07-10', { sku: 'S1' }), order('b', '2026-07-10', { sku: 'S2' })];
  const ledger = [{ key: 'k', company: 'Meesho_Freelax', spendDate: '2026-07-10', deductDate: null, campaignId: 'c', total: 30 }];
  const { rows: out } = allocateAds(rows, ledger);
  const { skuRows, summary } = computeProfitLoss(out, {});
  const s1 = skuRows.find((r) => r.sku === 'S1');
  assert.equal(s1.adsCost, 15);
  assert.equal(s1.profitLoss, 85);
  assert.equal(summary.ads.value, 30);
  assert.equal(summary.ads.pct, 15); // 30 of 200 settlement
  // a date range without the order leaves its ads out too
  assert.equal(computeProfitLoss(out, { dateFrom: '2026-08-01' }).summary.ads.value, 0);
});

test('summary line: allocated, unallocated, and ad orders with no spend', () => {
  const ledger = mergeAdsLedger([], readAdsLines(ADS_SHEET), 'Meesho_Freelax');
  const rows = [order('a', '2026-07-04'), order('b', '2026-07-05'), order('z', '2026-07-20')];
  const info = summarizeAds(allocateAds(rows, ledger), {});
  assert.equal(info.total, 2670.94);
  assert.equal(info.allocated, 2660.38);
  assert.equal(info.unallocated, 10.56);
  assert.equal(info.adOrders, 3);
  assert.equal(info.chargedOrders, 2);
  assert.equal(summarizeAds(allocateAds(rows, ledger), { dateFrom: '2026-08-01' }), null);
});

test('worker view: Ads Cost column and the summary come from the ledger', async () => {
  const rows = [order('a', '2026-07-10', { sku: 'S1' }), order('b', '2026-07-10', { sku: 'S1' })];
  const adsLedger = [{ key: 'k', company: 'Meesho_Freelax', spendDate: '2026-07-10', deductDate: null, campaignId: 'c', total: 20 }];
  const config = { headers: DEFAULT_HEADERS, marketplace: { groupByHeaderId: 'hdr_sku' }, tabs: [{ id: 't' }] };
  const result = await runCalculationTask('view', { config, rows, skuCosts: {}, options: { ads: { mode: 'percent', value: 0 }, adsLedger }, activeTabId: 't' });
  assert.equal(result.adsInfo.allocated, 20);
  const ads = result.resolved.tableRows.reduce((s, r) => s + (Number(r.cells.hdr_ads_cost?.raw) || 0), 0);
  assert.equal(ads, 20);
});
