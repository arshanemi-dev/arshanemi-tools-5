import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeUploadsAcrossSlots, RESTORED_SLOT_ID } from '../lib/profitLoss/mergeRows.js';
import { buildExtractedRowsPayload, rowsFromExtractedPayload } from '../lib/profitLoss/rowsPayload.js';

const ORDER = { id: 'hdr_order_id', name: 'Order Id', type: 'text' };
const TXN = { id: 'hdr_transaction_id', name: 'Transaction Id', type: 'text' };

// An Orders sheet: 3 orders of SKU1 size M, no Transaction Id, one account.
const ordersSheet = (extra = {}) => [1, 2, 3].map((n) => ({
  company: 'Meesho_A', sku: 'SKU1', orderId: `O${n}`, src: 'orders::Sheet1',
  meta: { 'Order Id': `O${n}`, Size: 'M', Status: 'Dispatched', ...extra },
}));
const upload = (id, rows, slotId = 'orders') => ({ id, slotId, rows });
const merge = (uploads) => mergeUploadsAcrossSlots(uploads, ORDER, TXN);

test('same sheet uploaded twice in one session → still 3 rows', () => {
  assert.equal(merge([upload('a', ordersSheet()), upload('b', ordersSheet())]).length, 3);
});

test('the newer upload wins on values', () => {
  const rows = merge([upload('a', ordersSheet()), upload('b', ordersSheet({ Status: 'Delivered' }))]);
  assert.deepEqual(rows.map((r) => r.meta.Status), ['Delivered', 'Delivered', 'Delivered']);
});

test('saved rows + same sheet again → 3 rows, and the saved copies are named for replacing', () => {
  const saved = rowsFromExtractedPayload(ordersSheet().map((data, i) => ({ id: `id-${i}`, data })));
  // the restored slot is appended last by the dashboard — still the oldest
  const rows = merge([upload('b', ordersSheet()), upload('restored', saved, RESTORED_SLOT_ID)]);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.replacesSavedIds).flat().sort(), ['id-0', 'id-1', 'id-2']);
  const payload = buildExtractedRowsPayload(rows, ORDER, TXN);
  assert.deepEqual(payload.map((e) => e.replaces).flat().sort(), ['id-0', 'id-1', 'id-2']);
});

test('old duplicate saved copies are all taken over by one re-upload', () => {
  const saved = rowsFromExtractedPayload([...ordersSheet(), ...ordersSheet()].map((data, i) => ({ id: `id-${i}`, data })));
  const rows = merge([upload('restored', saved, RESTORED_SLOT_ID), upload('b', ordersSheet())]);
  assert.equal(rows.length, 3);
});

test('different sizes / accounts / SKUs of one order stay separate', () => {
  const sheet = [
    { company: 'Meesho_A', sku: 'SKU1', orderId: 'O1', meta: { 'Order Id': 'O1', Size: 'S' } },
    { company: 'Meesho_A', sku: 'SKU1', orderId: 'O1', meta: { 'Order Id': 'O1', Size: 'M' } },
    { company: 'Meesho_B', sku: 'SKU1', orderId: 'O1', meta: { 'Order Id': 'O1', Size: 'M' } },
    { company: 'Meesho_A', sku: 'SKU2', orderId: 'O1', meta: { 'Order Id': 'O1', Size: 'M' } },
  ];
  assert.equal(merge([upload('a', sheet), upload('b', sheet.map((r) => ({ ...r })))]).length, 4);
});

test('two lines of one item inside ONE file are still both kept, and saved under two keys', () => {
  const line = () => ({ company: 'Meesho_A', sku: 'SKU1', orderId: 'O1', meta: { 'Order Id': 'O1', Size: 'M' } });
  const rows = merge([upload('a', [line(), line()])]);
  assert.equal(rows.length, 2);
  const keys = buildExtractedRowsPayload(rows, ORDER, TXN).map((e) => e.rowKey);
  assert.equal(new Set(keys).size, 2);
  // the same file again: still 2, on the same two keys
  const again = merge([upload('a', [line(), line()]), upload('b', [line(), line()])]);
  assert.equal(again.length, 2);
  assert.deepEqual(buildExtractedRowsPayload(again, ORDER, TXN).map((e) => e.rowKey), keys);
});

test('rows with Transaction Ids: different transactions of one order stay separate', () => {
  const sheet = () => ['T1', 'T2'].map((t) => ({ company: 'Meesho_A', sku: 'SKU1', orderId: 'O1', meta: { 'Order Id': 'O1', 'Transaction Id': t, Size: 'M' } }));
  assert.equal(merge([upload('a', sheet()), upload('b', sheet())]).length, 2);
});

test('a Payments file in another slot still merges into the order, not replaced away', () => {
  const pay = ordersSheet().map((r) => ({ ...r, src: 'payments::Sheet1', meta: { 'Order Id': r.orderId, 'Transaction Id': `T-${r.orderId}`, Settlement: 100 } }));
  const rows = merge([upload('a', ordersSheet()), upload('p', pay, 'payments')]);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.meta.Status === 'Dispatched' && r.meta.Settlement === 100));
});
