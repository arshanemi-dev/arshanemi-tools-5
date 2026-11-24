import assert from 'node:assert/strict';
import test from 'node:test';
import { readAdsLines, readAdsLedger, mergeAdsLedger, allocateAds, summarizeAds, isAdOrderRow } from '../lib/profitLoss/adsLedger.js';
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

// A payout row: the order as the Order Payments tab has it, paid on `payDate`.
const paidOrder = (id, payDate, opts = {}) => order(id, opts.date || '2026-07-01', { txn: opts.txn || `NEFT-${payDate}`, payDate, ...opts });

test('Deduction Date = Payment Date: the ads cost is split equally per Order Id over every order paid that day', () => {
  const ledger = mergeAdsLedger([], readAdsLines(ADS_SHEET), 'Meesho_Freelax');
  const rows = [
    // paid 06 Jul (the 1372.14 line) — ad and normal orders alike
    paidOrder('A1_1', '2026-07-06', { txn: 'AXISCN1397709717' }),
    paidOrder('A2_1', '2026-07-06', { txn: 'AXISCN1397709717', ad: false }),
    paidOrder('A3_1', '2026-07-06', { txn: 'AXISCN1397709717', status: STATUS.RTO }),
    // paid 07 Jul (two campaigns: 1286.35 + 1.89 = 1288.24)
    paidOrder('B1_1', '2026-07-07', { txn: 'AXISCN1398625727' }),
    paidOrder('B2_1', '2026-07-07', { txn: 'AXISCN1398625727', ad: false }),
    // paid another day → no share
    paidOrder('C1_1', '2026-07-08'),
    // not paid at all (orders sheet only) → no share
    order('D1_1', '2026-07-06'),
  ];
  const before = JSON.stringify(rows);
  const { rows: out, days } = allocateAds(rows, ledger);
  assert.equal(JSON.stringify(rows), before, 'saved rows are never mutated');

  const cost = (id) => out.find((r) => r.orderId === id).adsAlloc?.cost ?? 0;
  // 1372.14 / 3 = 457.38 each
  assert.deepEqual(['A1_1', 'A2_1', 'A3_1'].map(cost), [457.38, 457.38, 457.38]);
  // 1288.24 / 2 = 644.12 each
  assert.deepEqual(['B1_1', 'B2_1'].map(cost), [644.12, 644.12]);
  assert.equal(cost('C1_1'), 0);
  assert.equal(cost('D1_1'), 0);

  const b1 = out.find((r) => r.orderId === 'B1_1');
  assert.equal(b1.adsAlloc.neftIds, 'AXISCN1398625727');
  assert.equal(b1.adsAlloc.campaignIds, '23788364, 23708695');
  assert.equal(b1.meta['Ads Deduction Date'], '2026-07-07');
  // 28 Jul: nobody paid that day → unallocated, reported
  assert.deepEqual(days.find((d) => d.spendDate === '2026-07-28'), { company: 'Meesho_Freelax', spendDate: '2026-07-28', endDate: '2026-07-28', amount: 10.56, targetDate: null, orders: 0 });
});

test('no uniqueness: every payment row that day is one share, even the same Order Id twice', () => {
  const ledger = [{ key: 'k', company: 'Meesho_Freelax', spendDate: '2026-07-08', deductDate: '2026-07-10', campaignId: 'c', total: 60 }];
  const rows = [paidOrder('a', '2026-07-10', { sku: 'S1' }), paidOrder('a', '2026-07-10', { sku: 'S2' }), paidOrder('b', '2026-07-10')];
  const { rows: out } = allocateAds(rows, ledger);
  assert.deepEqual(out.map((r) => r.adsAlloc?.cost ?? 0), [20, 20, 20]);
});

test('Account Name uniqueness: two accounts paid on the same day each split only their own ads', () => {
  const ledger = [
    { key: 'k1', company: 'Meesho_A', spendDate: '2026-07-08', deductDate: '2026-07-10', campaignId: 'c1', total: 100 },
    { key: 'k2', company: 'meesho_b ', spendDate: '2026-07-08', deductDate: '2026-07-10', campaignId: 'c2', total: 30 },
  ];
  const rows = [
    paidOrder('a1', '2026-07-10', { company: 'Meesho_A' }),
    paidOrder('a2', '2026-07-10', { company: 'Meesho_A' }),
    paidOrder('b1', '2026-07-10', { company: 'Meesho_B' }), // same account, other case / spacing
    paidOrder('x1', '2026-07-10', { company: 'Meesho_X' }), // an account with no ads line
  ];
  const result = allocateAds(rows, ledger);
  assert.deepEqual(result.rows.map((r) => r.adsAlloc?.cost ?? 0), [50, 50, 30, 0]);
  // the notice for one account shows only that account's ads
  assert.equal(summarizeAds(result, { company: 'Meesho_A' }).total, 100);
  assert.equal(summarizeAds(result, { company: 'Meesho_B' }).total, 30);
  assert.equal(summarizeAds(result, { company: 'Meesho_X' }), null);
});

test('an ads line with no account never spreads over named accounts', () => {
  const ledger = [{ key: 'k', company: '', spendDate: '2026-07-08', deductDate: '2026-07-10', campaignId: 'c', total: 30 }];
  const { rows: out, days } = allocateAds([paidOrder('a', '2026-07-10', { company: 'Meesho_A' })], ledger);
  assert.equal(out[0].adsAlloc, undefined);
  assert.equal(days[0].targetDate, null);
});

test('Meesho only: another marketplace\'s payments that day get no share', () => {
  const ledger = [{ key: 'k', company: 'Meesho_Freelax', spendDate: '2026-07-08', deductDate: '2026-07-10', campaignId: 'c', total: 30 }];
  const flip = { ...paidOrder('f', '2026-07-10', { company: 'Flipkart_X' }), platform: 'flipkart' };
  const rows = [paidOrder('a', '2026-07-10'), flip];
  const { rows: out } = allocateAds(rows, ledger);
  assert.equal(out[0].adsAlloc.cost, 30);
  assert.equal(out[1].adsAlloc, undefined);
});

test('odd paise: shares still add up exactly', () => {
  const ledger = [{ key: 'k', company: 'Meesho_Freelax', spendDate: '2026-07-08', deductDate: '2026-07-10', campaignId: 'c', total: 100 }];
  const rows = ['a', 'b', 'c'].map((id) => paidOrder(id, '2026-07-10'));
  assert.deepEqual(allocateAds(rows, ledger).rows.map((r) => r.adsAlloc.cost), [33.34, 33.33, 33.33]);
});

test('no Deduction Date → nothing to match: unallocated', () => {
  const ledger = [{ key: 'k', company: 'Meesho_Freelax', spendDate: '2026-07-10', deductDate: null, campaignId: 'c', total: 40 }];
  const { rows: out, days } = allocateAds([paidOrder('a', '2026-07-10')], ledger);
  assert.equal(out[0].adsAlloc, undefined);
  assert.equal(days[0].targetDate, null);
});

test("accounts never share each other's ads", () => {
  const ledger = [{ key: 'k', company: 'Meesho_A', spendDate: '2026-07-08', deductDate: '2026-07-10', campaignId: 'c', total: 40 }];
  const rows = [paidOrder('a', '2026-07-10', { company: 'Meesho_A' }), paidOrder('b', '2026-07-10', { company: 'Meesho_B' })];
  const { rows: out } = allocateAds(rows, ledger);
  assert.equal(out[0].adsAlloc.cost, 40);
  assert.equal(out[1].adsAlloc, undefined);
});

test('no ledger: rows untouched, same array', () => {
  const rows = [order('a', '2026-07-10')];
  assert.equal(allocateAds(rows, []).rows, rows);
  assert.equal(isAdOrderRow(rows[0]), true);
});

test("engine: allocated ads become the SKU's Ads Cost and come off Profit/Loss", () => {
  const rows = [paidOrder('a', '2026-07-12', { sku: 'S1', date: '2026-07-10' }), paidOrder('b', '2026-07-12', { sku: 'S2', date: '2026-07-10' })];
  const ledger = [{ key: 'k', company: 'Meesho_Freelax', spendDate: '2026-07-10', deductDate: '2026-07-12', campaignId: 'c', total: 30 }];
  const { rows: out } = allocateAds(rows, ledger);
  const { skuRows, summary } = computeProfitLoss(out, {});
  const s1 = skuRows.find((r) => r.sku === 'S1');
  assert.equal(s1.adsCost, 15);
  assert.equal(s1.profitLoss, 85);
  assert.equal(summary.ads.value, 30);
});

test('summary line: allocated and unallocated', () => {
  const ledger = mergeAdsLedger([], readAdsLines(ADS_SHEET), 'Meesho_Freelax');
  const rows = [paidOrder('a', '2026-07-06'), paidOrder('b', '2026-07-07')];
  const info = summarizeAds(allocateAds(rows, ledger), {});
  assert.equal(info.total, 2670.94);
  assert.equal(info.allocated, 2660.38);
  assert.equal(info.unallocated, 10.56);
  assert.equal(info.chargedOrders, 2);
  assert.equal(summarizeAds(allocateAds(rows, ledger), { dateFrom: '2026-08-01' }), null);
});

test('worker view: Ads Cost column and the summary come from the ledger', async () => {
  const rows = [paidOrder('a', '2026-07-12', { sku: 'S1', date: '2026-07-10' }), paidOrder('b', '2026-07-12', { sku: 'S1', date: '2026-07-10' })];
  const adsLedger = [{ key: 'k', company: 'Meesho_Freelax', spendDate: '2026-07-10', deductDate: '2026-07-12', campaignId: 'c', total: 20 }];
  const config = { headers: DEFAULT_HEADERS, marketplace: { groupByHeaderId: 'hdr_sku' }, tabs: [{ id: 't' }] };
  const result = await runCalculationTask('view', { config, rows, skuCosts: {}, options: { ads: { mode: 'percent', value: 0 }, adsLedger }, activeTabId: 't' });
  assert.equal(result.adsInfo.allocated, 20);
  const ads = result.resolved.tableRows.reduce((s, r) => s + (Number(r.cells.hdr_ads_cost?.raw) || 0), 0);
  assert.equal(ads, 20);
});
