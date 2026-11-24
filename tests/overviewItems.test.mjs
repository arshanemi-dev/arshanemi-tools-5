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

test('Order Id shown → split per order too (24 rows)', () => {
  const ov = resolveTemplate(config(['hdr_sku'], [RESERVED_HEADER_IDS.orderId]), { canonicalRows: rows }).overviews.ov;
  assert.equal(ov.tree.length, 24);
});
