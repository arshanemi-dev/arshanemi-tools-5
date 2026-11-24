import test from 'node:test';
import assert from 'node:assert/strict';
import { dateTextToDisplay, fmtAnyDate, fmtDate } from '../lib/profitLoss/dates.js';
import { fmtHeaderCell } from '../lib/profitLoss/fmt.js';
import { resolveTemplate, resolveTransactionRows } from '../lib/profitLoss/resolveTemplate.js';
import { packRows, unpackRows } from '../lib/profitLoss/packedRows.js';
import { RESERVED_HEADER_IDS } from '../data/templateSchema.js';

test('every date layout shows as DD/MM/YYYY', () => {
  assert.equal(fmtDate(new Date(2026, 6, 9).getTime()), '09/07/2026');
  for (const s of ['2026-07-09', '2026-07-09 08:19:55', '2026-07-09T08:19:55', '09-07-2026', '9/7/26', '09.07.2026', '9 Jul 2026', '09-Jul-2026', 'Jul 9, 2026', 'Jul 9, 2026 8:19 PM']) {
    assert.equal(dateTextToDisplay(s), '09/07/2026', s);
  }
  assert.equal(dateTextToDisplay('2026-07-09, 2026-07-10'), '09/07/2026, 10/07/2026');
  assert.equal(fmtAnyDate('2026-07-09'), '09/07/2026');
});

test('things that are not dates are left alone', () => {
  for (const s of ['10301-35-WT', '32-36', 'Free-Size: 32-36', '34 Alterable', '324741713136571904_1', '20260709', 'AXISCN1466508157', 'Delivered']) {
    assert.equal(dateTextToDisplay(s), null, s);
  }
});

test('a Text header holding a date shows DD/MM/YYYY; other text unchanged', () => {
  const text = { type: 'text' };
  assert.equal(fmtHeaderCell(text, '2026-07-09 10:00:00'), '09/07/2026');
  assert.equal(fmtHeaderCell(text, '10301-35-WT'), '10301-35-WT');
});

const ORDER = { id: RESERVED_HEADER_IDS.orderId, name: 'Order Id', type: 'text' };
const TXN = { id: RESERVED_HEADER_IDS.transactionId, name: 'Transaction Id', type: 'text' };
const SKU = { id: 'hdr_sku', name: 'SKU', type: 'text', primitive: 'sku' };
const rows = [
  { rowId: '1', company: 'A', sku: 'S1', platform: 'm', orderDate: '2026-07-01', orderId: 'O1', meta: { 'Order Id': 'O1', 'Transaction Id': 'T1' } },
  { rowId: '2', company: 'A', sku: 'S1', platform: 'm', orderDate: '2026-07-01', orderId: 'O2', meta: { 'Order Id': 'O2' } },
];

test('an order with no Transaction Id is flagged (noTxn), one with is not', () => {
  const config = { headers: [SKU, ORDER, TXN] };
  const flagged = (res) => Object.fromEntries(res.rows.map((r) => [r.cells[ORDER.id].raw, !!r.noTxn]));
  assert.deepEqual(flagged(resolveTransactionRows(config, { canonicalRows: rows })), { O1: false, O2: true });
  assert.deepEqual(flagged(resolveTransactionRows(config, { canonicalRows: rows, everyRow: true })), { O1: false, O2: true });
  // survives the worker's packing (the Transactions page)
  assert.deepEqual(flagged(unpackRows(packRows(resolveTransactionRows(config, { canonicalRows: rows })))), { O1: false, O2: true });
});

test('overview Order Id nodes are flagged too', () => {
  const config = { headers: [SKU, ORDER, TXN], overviewTabs: [{ id: 'ov', name: 'Ov', hierarchyHeaderIds: [ORDER.id], headerIds: [] }] };
  const tree = resolveTemplate(config, { canonicalRows: rows }).overviews.ov.tree;
  assert.deepEqual(Object.fromEntries(tree.map((n) => [n.path[0], !!n.noTxn])), { O1: false, O2: true });
});
