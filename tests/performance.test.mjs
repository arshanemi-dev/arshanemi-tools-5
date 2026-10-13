import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAllPages } from '../lib/profitLoss/loadAllPages.js';
import { runCalculationTask, configForView } from '../lib/profitLoss/calculationTasks.js';
import { createCalculationClient } from '../lib/profitLoss/calculationClient.js';
import { resolveTemplate, resolveTransactionRows } from '../lib/profitLoss/resolveTemplate.js';
import { mergeUploadsAcrossSlots } from '../lib/profitLoss/mergeRows.js';
import { withSkuCosts, unitCostMap } from '../lib/profitLoss/skuCosts.js';
import { createRowLedger } from '../lib/profitLoss/rowLedger.js';
import { canonicalRow } from '../data/platforms/canonical.js';
import { DEFAULT_HEADERS } from '../data/defaultHeaders.js';
import { RESERVED_HEADER_IDS } from '../data/templateSchema.js';

const orderIdHeader = { id: RESERVED_HEADER_IDS.orderId, name: 'Order Id', type: 'text', mappedFrom: { sheetHeader: 'Order Id' } };
const headers = [...DEFAULT_HEADERS, orderIdHeader,
  { id: 'company', name: 'Company', type: 'text', mappedFrom: { sheetHeader: 'Company' } },
  { id: 'formula', name: 'Calculated Profit', type: 'formula', formula: '[Settlement] - [Product Cost]', format: 'money' },
];
const config = {
  headers, marketplace: { groupByHeaderId: 'hdr_sku' },
  titleCards: [{ id: 'profit', mainValue: { formula: 'SUM([Calculated Profit])', format: 'money' } }, { id: 'orders', mainValue: { formula: '[Row Count]', format: 'int' } }],
  graphs: [{ id: 'chart', headerIds: ['formula'], chartType: 'line' }, { id: 'other', headerIds: ['hdr_total_order'], chartType: 'bar' }],
  tabs: [{ id: 'detail', titleCardIds: ['profit'], graphIds: ['chart'] }],
  overviewTabs: [
    { id: 'overview', hierarchyHeaderIds: ['company', 'hdr_sku'], headerIds: ['formula', 'hdr_total_order'], titleCardIds: ['profit'], graphIds: ['chart'] },
    { id: 'otherOverview', hierarchyHeaderIds: ['hdr_sku'], headerIds: ['hdr_total_order'], titleCardIds: ['orders'] },
  ],
};
const rows = Array.from({ length: 18 }, (_, index) => canonicalRow({
  orderId: `order${index}`, sku: `sku${index % 3}`, company: index % 2 ? 'Shop_A' : 'Shop_B',
  orderDate: index % 4 ? '2026-10-10' : null, platform: 'manual', qty: 1,
  grossSale: 200, settlement: 160, status: index % 3 ? 'delivered' : 'return',
  meta: { 'Order Id': `order${index}`, Company: index % 2 ? 'Shop_A' : 'Shop_B' },
}));
const skuCosts = { sku0: { cogs: 20 }, sku1: { cogs: 30 }, sku2: { cogs: 40 } };
const options = { ads: { mode: 'percent', value: 5 }, dateFrom: '2026-10-09', dateTo: '2026-10-12', company: 'all', platform: 'all', now: Date.UTC(2026, 9, 13) };
const fullOptions = { ...options, canonicalRows: withSkuCosts(rows, skuCosts), skuCostMap: unitCostMap(skuCosts) };

test('active view keeps hidden formula dependencies and matches full totals, chart and pivot', async () => {
  const expected = resolveTemplate(config, fullOptions);
  for (const activeTabId of ['detail', 'overview']) {
    const { resolved } = await runCalculationTask('view', { config, rows, skuCosts, options, activeTabId });
    assert.deepEqual(resolved.tableRows, expected.tableRows);
    assert.deepEqual(resolved.aggregate, expected.aggregate);
    assert.deepEqual(resolved.titleCardValues.profit, expected.titleCardValues.profit);
    assert.deepEqual(resolved.graphSeries.chart, expected.graphSeries.chart);
    assert.equal(resolved.graphSeries.other, undefined);
    assert.equal(resolved.overviews.otherOverview, undefined);
    if (activeTabId === 'overview') assert.deepEqual(resolved.overviews.overview, expected.overviews.overview);
    else assert.deepEqual(resolved.overviews, {});
  }
  assert.equal(configForView(config, 'detail').headers, config.headers);
});

test('transactions skip other outputs and match existing transaction calculations', async () => {
  const result = await runCalculationTask('view', { config, rows, skuCosts, options, transactions: true });
  assert.deepEqual(result.transactionResolved, resolveTransactionRows(config, fullOptions));
  assert.deepEqual(result.resolved.tableRows, []);
  assert.deepEqual(result.resolved.companyOptions, ['Shop_A', 'Shop_B']);
});

test('all-date export includes inactive overview tabs and complete financial data', async () => {
  const exportOptions = { ...options, dateFrom: null, dateTo: null };
  const result = await runCalculationTask('export', { config, rows, skuCosts, options: exportOptions, transactions: true });
  const expectedOptions = { ...fullOptions, dateFrom: null, dateTo: null };
  assert.deepEqual(result.full, resolveTemplate(config, expectedOptions));
  assert.deepEqual(result.fullTransactions, resolveTransactionRows(config, expectedOptions));
  assert.deepEqual(Object.keys(result.full.overviews), ['overview', 'otherOverview']);
});

test('company/date filtering and undated rows retain the original engine semantics', async () => {
  const filtered = { ...options, company: 'Shop_A', dateFrom: '2026-10-11' };
  const result = await runCalculationTask('view', { config, rows, skuCosts, options: filtered, activeTabId: 'overview' });
  assert.deepEqual(result.resolved.tableRows, resolveTemplate(config, { ...fullOptions, ...filtered }).tableRows);
});

test('worker merge preserves original object references for the persistence ledger', async () => {
  const uploads = [{ slotId: 'restored', rows }];
  const input = { uploads, orderIdHeader, transactionIdHeader: null, headers };
  const wireResult = structuredClone(await runCalculationTask('merge', structuredClone(input)));
  const originals = uploads.flatMap((upload) => upload.rows);
  const result = wireResult.map((row) => typeof row === 'number' ? originals[row] : row);
  assert.deepEqual(result, mergeUploadsAcrossSlots(uploads, orderIdHeader, null, headers));
  result.forEach((row, index) => assert.equal(row, rows[index]));
  const ledger = createRowLedger();
  ledger.markStored(rows);
  assert.deepEqual(ledger.pending(result.map((row) => ({ data: row, orderId: row.orderId, transactionId: null }))), []);
});

test('cross-file enrichment survives worker serialization', async () => {
  const uploads = [{ slotId: 'orders', rows: [rows[1]] }, { slotId: 'payments', rows: [{ ...rows[1], meta: { ...rows[1].meta, Extra: 30 } }] }];
  const wireResult = await runCalculationTask('merge', structuredClone({ uploads, orderIdHeader, transactionIdHeader: null, headers }));
  const originals = uploads.flatMap((upload) => upload.rows);
  assert.deepEqual(wireResult.map((row) => typeof row === 'number' ? originals[row] : row), mergeUploadsAcrossSlots(uploads, orderIdHeader, null, headers));
});

test('spreadsheet parsing and mapping run without DOM APIs', async () => {
  const file = new File(['Order Id,SKU,Order Date,Settlement\nA1,SKU1,2026-10-10,160\nA2,SKU2,2026-10-11,190'], 'orders.csv', { type: 'text/csv' });
  const result = await runCalculationTask('upload', { file, options: { config, fileName: file.name, tag: { company: 'Shop_A' } } });
  assert.equal(result.ok, true);
  assert.equal(result.parts[0].rows.length, 2);
});

test('out-of-order page completion still restores every row in page order with bounded concurrency', async () => {
  const delivered = [];
  let running = 0;
  let maxRunning = 0;
  const result = await loadAllPages({
    concurrency: 3,
    fetchPage: async (page) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, (8 - page) * 2));
      running--;
      return { rows: [page], totalPages: page === 1 ? 7 : null, totalCount: page === 1 ? 7 : null };
    },
    onRows: (batch) => delivered.push(...batch),
  });
  assert.equal(result.complete, true);
  assert.deepEqual(delivered, [1, 2, 3, 4, 5, 6, 7]);
  assert.ok(maxRunning <= 3);
});

test('failed restore never reports complete or delivers rows after a gap', async () => {
  const delivered = [];
  const result = await loadAllPages({
    fetchPage: async (page) => page === 2 ? null : { rows: [page], totalCount: 4, totalPages: 4 },
    onRows: (batch) => delivered.push(...batch),
  });
  assert.equal(result.complete, false);
  assert.deepEqual(delivered, [1]);
});

test('first-page failure and count mismatch are incomplete restores', async () => {
  assert.equal((await loadAllPages({ fetchPage: async () => null, onRows() {} })).complete, false);
  assert.equal((await loadAllPages({ fetchPage: async () => { throw new Error('Network unavailable'); }, onRows() {} })).complete, false);
  assert.equal((await loadAllPages({ fetchPage: async () => ({ rows: [], totalPages: 1, totalCount: 3 }), onRows() {} })).complete, false);
});

test('Excel export produces worksheets containing complete calculation results', async (t) => {
  const { downloadMultiTabXlsx } = await import('../lib/profitLoss/exportTemplate.js');
  const { default: ExcelJS } = await import('exceljs');
  const { full } = await runCalculationTask('export', { config, rows, skuCosts, options: { ...options, dateFrom: null, dateTo: null } });
  let blob;
  let clicked = false;
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    body: { appendChild() {} },
    createElement: () => ({ click() { clicked = true; }, remove() {} }),
  } });
  t.mock.method(URL, 'createObjectURL', (value) => { blob = value; return 'blob:test'; });
  try {
    const tabs = [
      { tabName: 'Details', table: { columns: ['SKU', 'Orders'], rows: full.tableRows.map((row) => [row.key, row.cells.hdr_total_order.raw]) } },
      ...Object.entries(full.overviews).map(([id, overview]) => ({ tabName: id, table: { columns: ['Key'], rows: overview.flatRows.map((row) => [row.key]) } })),
    ];
    await downloadMultiTabXlsx({ label: 'Regression', tabs });
    assert.ok(clicked);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());
    assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Details', 'overview', 'otherOverview']);
    assert.equal(workbook.getWorksheet('Details').rowCount, full.tableRows.length + 1);
    assert.equal(workbook.getWorksheet('otherOverview').rowCount, full.overviews.otherOverview.flatRows.length + 1);
  } finally {
    if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument);
    else delete globalThis.document;
  }
});

test('cancelled restore does not deliver late responses', async () => {
  let cancelled = false;
  const delivered = [];
  const result = await loadAllPages({
    fetchPage: async () => { cancelled = true; return { rows: [1], totalPages: 1, totalCount: 1 }; },
    cancelled: () => cancelled,
    onRows: (batch) => delivered.push(...batch),
  });
  assert.equal(result.complete, false);
  assert.deepEqual(delivered, []);
});

test('worker queue removes superseded jobs and avoids recloning unchanged dataset', async () => {
  const messages = [];
  const fakeWorker = { postMessage: (message) => messages.push(message), terminate() {} };
  const client = createCalculationClient({ createWorker: () => fakeWorker });
  const input = { rows, options };
  const first = client.run('view', input);
  const controller = new AbortController();
  const superseded = client.run('view', { rows, options: { company: 'old' } }, { signal: controller.signal });
  const rejected = assert.rejects(superseded, { name: 'AbortError' });
  controller.abort();
  const latest = client.run('view', { rows, options: { company: 'latest' } });
  fakeWorker.onmessage({ data: { id: messages[0].id, result: 'first' } });
  assert.equal(await first, 'first');
  await rejected;
  assert.equal(messages.length, 2);
  assert.equal(messages[1].patch.rows, undefined);
  assert.equal(messages[1].patch.options.company, 'latest');
  fakeWorker.onmessage({ data: { id: messages[1].id, result: 'latest' } });
  assert.equal(await latest, 'latest');
  client.dispose();
});

test('worker errors reject calculations instead of reporting empty financial results', async () => {
  const fakeWorker = { postMessage() {}, terminate() {} };
  const client = createCalculationClient({ createWorker: () => fakeWorker });
  const result = client.run('view', {});
  fakeWorker.onmessage({ data: { id: 1, error: 'Invalid formula configuration' } });
  await assert.rejects(result, /Invalid formula/);
  client.dispose();
});

test('blocked workers fall back to the same engine and dispose cancels pending work', async () => {
  const client = createCalculationClient({ createWorker: () => { throw new Error('Workers blocked'); } });
  const input = { config, rows, skuCosts, options, activeTabId: 'detail' };
  assert.deepEqual(await client.run('view', input), await runCalculationTask('view', input));
  client.dispose();
  const pending = client.run('view', input);
  client.dispose();
  await assert.rejects(pending, { name: 'AbortError' });
});
