import { normHeader } from '@/data/platforms/canonical';

// What makes a sheet row ONE item, on the dashboard side — everywhere rows
// are told apart (upload merge, the normal tabs' tables, the saved-row key,
// the SKU prices):
//
//   Account Name + SKU + Size + (Transaction Id → else Order Id → else the row itself)
//
// SKU and Size are always part of it: a size S and a size M line are two
// items even on one order. Then the most exact reference the row has — its
// Transaction Id when it carries one, else its Order Id, else nothing to
// match it by, so it is only ever itself. Never one field alone.
//
// Pure — no imports from resolveTemplate.js (which imports this).

export const SIZE_KEY = 'size';

// Sheet columns that hold a size when the Size header isn't mapped:
// "Size", "Product Size", "SKU Size", "Variant", "Variation"…
const SIZE_NAMES = new Set(['size', 'sizes', 'productsize', 'skusize', 'itemsize', 'sizename', 'variant', 'variation', 'variantsize', 'sizevariant', 'variantname', 'variationname']);
const isSizeColumn = (col) => {
  const n = normHeader(col);
  return SIZE_NAMES.has(n) || (n.endsWith('size') && !n.includes('pack') && !n.includes('file') && !n.includes('page'));
};

const blank = (v) => v == null || String(v).trim() === '' || String(v).trim() === '—';
// A size as shown ("Free  Size" → "Free Size") and as compared ("FREE SIZE").
export const sizeText = (v) => (blank(v) ? '' : String(v).trim().replace(/\s+/g, ' '));
export const sizeMatchKey = (v) => sizeText(v).toUpperCase();
export const skuText = (v) => (blank(v) ? '' : String(v).trim());

// The size a row's own sheet columns carry — '' when none.
export function autoSize(row) {
  const meta = row?.meta;
  if (!meta) return '';
  for (const k in meta) {
    if (isSizeColumn(k) && !blank(meta[k])) return sizeText(meta[k]);
  }
  return '';
}

// → `(row) => size` — through the template's Size header when there is one
// (`read` = readHeaderFromRow, which itself falls back to autoSize), else
// the sheet's own size columns.
export function sizeReader(sizeHeader = null, read = null) {
  if (!sizeHeader || !read) return autoSize;
  return (row) => sizeText(read(sizeHeader, row)) || autoSize(row);
}

// A row's VARIANT: { sku, size }, both as compared (case aside).
export function variantOf(row, readSize = autoSize) {
  return { sku: skuText(row?.sku).toLowerCase(), size: sizeMatchKey(readSize(row)) };
}
export const variantKey = (row, readSize = autoSize) => {
  const { sku, size } = variantOf(row, readSize);
  return `${sku}|${size}`;
};
// Can two rows be one item? Neither has a different SKU or a different
// size — a side with none matches (a Payments file with no size column still
// enriches its order's sized row).
export function sameVariant(a, b, readSize = autoSize) {
  const x = variantOf(a, readSize);
  const y = variantOf(b, readSize);
  return (!x.sku || !y.sku || x.sku === y.sku) && (!x.size || !y.size || x.size === y.size);
}

// The row's full identity → { sku, size, ref, key }. `ids` = { orderId,
// transactionId } — its values (already read); `own` = what stands in when
// it has neither (its rowId / position): it is only ever itself.
const SEP = '\u0001';
// The Account Name (the upload's Market Place_Brand, `row.company`) is
// always part of it: one SKU + Size in two accounts is two items.
export function rowIdentity(row, { orderId = null, transactionId = null, size = '', own = '' } = {}) {
  const txn = skuText(transactionId);
  const order = skuText(orderId);
  const ref = txn ? `t:${txn}` : order ? `o:${order}` : `r:${own}`;
  const sku = skuText(row?.sku);
  const sz = sizeText(size);
  const account = skuText(row?.company).toLowerCase();
  return { sku, size: sz, account, ref, key: [account, sku.toLowerCase(), sizeMatchKey(sz), ref].join(SEP) };
}

// Every value of a group of rows, in a cell: one when they agree, else all
// of them — never "first +N more".
export function joinDistinct(values) {
  const uniq = [...new Set(values.filter((v) => !blank(v)).map((v) => (typeof v === 'number' ? v : String(v).trim())))];
  if (uniq.length <= 1) return uniq[0] ?? '';
  return uniq.join(', ');
}
