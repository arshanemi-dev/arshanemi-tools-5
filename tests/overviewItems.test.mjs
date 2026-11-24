import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTemplate } from '../lib/profitLoss/resolveTemplate.js';
import { RESERVED_HEADER_IDS } from '../data/templateSchema.js';

// SKU1 sold in 2 accounts × 4 sizes, 3 orders each → 24 sheet rows.
const rows = [];
for (const company of ['Meesho_A', 'Meesho_B']) {
  for (const size of ['S', 'M', 'L', 'XL']) {
    for (let o = 1; o <= 3; o += 1) {
      rows.push({ rowId: `${company}-${size}-${o}`, company, sku: 'SKU1', platform: 'meesho', orderDate: '2026-11-01', orderId: `${company}-${size}-${o}`, meta: { Size: size } });
    }
  }
}
const H = {
  sku: { id: 'hdr_sku', name: 'SKU', type: 'text', primitive: 'sku' },
  size: { id: 'hdr_size', name: 'Size', type: 'text', fixedKey: 'size' },
  order: { id: RESERVED_HEADER_IDS.orderId, name: 'Order Id', type: 'text' },
};
const config = (levels, shown) => ({
  headers: [H.sku, H.size, H.order],
  overviewTabs: [{ id: 'ov', name: 'Ov', hierarchyHeaderIds: levels, headerIds: shown }],
});
const leaves = (nodes) => nodes.flatMap((n) => (n.children?.length ? leaves(n.children) : [n]));

test('Level SKU, no order column → 1 × 4 sizes × 2 accounts = 8 plain rows', () => {
  const ov = resolveTemplate(config(['hdr_sku'], []), { canonicalRows: rows }).overviews.ov;
  assert.equal(ov.tree.length, 8);
  assert.ok(ov.tree.every((n) => !n.children.length));
  assert.ok(ov.tree.every((n) => n.rowCount === 3));
});

test('Levels SKU → Size → dropdowns, 8 leaves', () => {
  const ov = resolveTemplate(config(['hdr_sku', 'hdr_size'], []), { canonicalRows: rows }).overviews.ov;
  assert.equal(ov.tree.length, 2); // SKU1 per account
  assert.equal(leaves(ov.tree).length, 8);
});

test('Levels SKU → Order Id (Size not a level) → one SKU dropdown per account + size, each with only its own orders', () => {
  const ov = resolveTemplate(config(['hdr_sku', RESERVED_HEADER_IDS.orderId], ['hdr_size']), { canonicalRows: rows }).overviews.ov;
  assert.equal(ov.tree.length, 8); // 2 accounts × 4 sizes
  for (const n of ov.tree) {
    assert.equal(n.value, 'SKU1'); // Size column is shown → not repeated in the label
    assert.equal(n.cells.hdr_size.raw, n.children[0].cells.hdr_size.raw); // one size per SKU row
    assert.equal(n.children.length, 3); // that size's 3 orders
    assert.equal(n.fields.size, n.cells.hdr_size.raw); // the price boxes' size
    assert.ok(n.children.every((c) => c.fields.size === n.fields.size)); // inherited below
    assert.ok(n.children.every((c) => c.children.length === 0));
  }
});

test('a custom "SKU ID" header (mapped to the sheet, not the built-in SKU) as Level 1 is still split per size', () => {
  const skuId = { id: 'hdr_sku_id', name: 'SKU ID', type: 'text' };
  const withCol = rows.map((r) => ({ ...r, meta: { ...r.meta, 'SKU ID': r.sku } }));
  const cfg = {
    headers: [skuId, H.size, H.order],
    overviewTabs: [{ id: 'ov', name: 'Ov', hierarchyHeaderIds: ['hdr_sku_id', RESERVED_HEADER_IDS.orderId], headerIds: ['hdr_size'] }],
  };
  const ov = resolveTemplate(cfg, { canonicalRows: withCol }).overviews.ov;
  assert.equal(ov.tree.length, 8); // 2 accounts × 4 sizes, not one SKU row with every size
  assert.ok(ov.tree.every((n) => n.children.length === 3 && !String(n.cells.hdr_size.raw).includes(',')));
});

test('Size column not shown → the SKU row names its size', () => {
  const ov = resolveTemplate(config(['hdr_sku', RESERVED_HEADER_IDS.orderId], []), { canonicalRows: rows }).overviews.ov;
  assert.deepEqual([...new Set(ov.tree.map((n) => n.value))], ['SKU1 · S', 'SKU1 · M', 'SKU1 · L', 'SKU1 · XL']);
});

test('Level Order Id only → each order split by SKU + Size', () => {
  const two = [
    { rowId: 'a', company: 'A', sku: 'SKU1', platform: 'meesho', orderDate: '2026-11-01', orderId: 'O1', meta: { Size: 'S' } },
    { rowId: 'b', company: 'A', sku: 'SKU1', platform: 'meesho', orderDate: '2026-11-01', orderId: 'O1', meta: { Size: 'M' } },
  ];
  const ov = resolveTemplate(config([RESERVED_HEADER_IDS.orderId], []), { canonicalRows: two }).overviews.ov;
  assert.deepEqual(ov.tree.map((n) => n.value), ['O1 · SKU1 · S', 'O1 · SKU1 · M']);
});

test('Order Id shown → split per order too (24 rows)', () => {
  const ov = resolveTemplate(config(['hdr_sku'], [RESERVED_HEADER_IDS.orderId]), { canonicalRows: rows }).overviews.ov;
  assert.equal(ov.tree.length, 24);
});
