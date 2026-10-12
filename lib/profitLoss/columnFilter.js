// Excel-style column filters for the dashboard tables (DetailsTable,
// OverviewTreeTable): a column's filter is the list of values it may show —
// { values: [text, ...] } — picked from a searchable checklist of everything
// the column currently holds (components/dashboard/ColumnFilterMenu.jsx).
// A number column can also be held to a range — { min, max }, either end
// alone, on its own or together with `values` (a cell has to pass both).
// A cell is matched on what it SHOWS ("29 Jul 2026", "3 days", "1,299"), so
// what is ticked is exactly what is seen; '' stands for a blank cell. Pure.

import { parseNumberish } from '@/data/platforms/canonical';

export const BLANK_LABEL = '(Blanks)';

// The text a cell is filtered on.
export const cellText = (cell) => (cell?.display == null ? '' : String(cell.display).trim());

// The number a cell is ranged on, or null when it shows none — text, an
// empty cell, a date ("29 Jul 2026"). Read off what the cell shows like
// everything else here ("12.5%" → 12.5, "3 days" → 3), never the value
// behind it: a row showing 1299 is inside "max 1299" even with 1299.46
// behind it, and a number column's empty cell showing 0 counts as 0.
export function cellNumber(cell) {
  const n = parseNumberish(cellText(cell).replace(/\s*days?$/i, ''));
  return Number.isFinite(n) ? n : null;
}

// Can this header's column be ranged at all? One that is meant to hold
// numbers — a Number header, an engine metric, a formula. Never a Text /
// Alphanumeric / Date header, even when its values happen to read as
// numbers (an order id, a pincode) — cellNumber alone can't tell those
// apart, so a table only offers the range where this says yes.
export const isNumberHeader = (h) => !['text', 'alphanumeric', 'date'].includes(h?.type);

const bound = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// filters { [columnKey]: { values, min, max } | null } → [[key, { values: Set
// | null, min, max }], ...] for the columns that are on screen (`keys`) — a
// filter on a column that has since been hidden must not keep narrowing the
// table invisibly.
export function activeFilters(filters, keys) {
  const shown = new Set(keys);
  return Object.entries(filters || {})
    .map(([key, f]) => [key, { values: Array.isArray(f?.values) ? new Set(f.values) : null, min: bound(f?.min), max: bound(f?.max) }])
    .filter(([key, f]) => shown.has(key) && (f.values || f.min != null || f.max != null));
}

// Does a cell pass one column's filter (an activeFilters entry)? A range
// leaves out every cell that isn't a number, blanks included.
export function cellPasses(f, cell) {
  if (f.values && !f.values.has(cellText(cell))) return false;
  if (f.min == null && f.max == null) return true;
  const n = cellNumber(cell);
  return n != null && (f.min == null || n >= f.min) && (f.max == null || n <= f.max);
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

// Every distinct value of one column → [{ text, count }], sorted the way the
// column sorts (numbers and dates by value, text naturally), blanks last.
// `textOf(item)` / `rawOf(item)` read the column off a row or tree node.
export function columnOptions(items, textOf, rawOf) {
  const byText = new Map();
  for (const it of items) {
    const text = textOf(it);
    const entry = byText.get(text);
    if (entry) entry.count += 1;
    else byText.set(text, { text, count: 1, raw: rawOf ? rawOf(it) : text });
  }
  return [...byText.values()].sort((a, b) => {
    if (a.text === '' || b.text === '') return a.text === b.text ? 0 : a.text === '' ? 1 : -1;
    if (typeof a.raw === 'number' && typeof b.raw === 'number') return a.raw - b.raw || collator.compare(a.text, b.text);
    return collator.compare(a.text, b.text);
  }).map(({ text, count }) => ({ text, count }));
}

// The lowest and highest number one column shows → { min, max } — what its
// Min / Max boxes suggest — or null when it shows no number at all (nothing
// to range on). `numberOf(item)` = cellNumber of the column on a row or node.
export function columnRange(items, numberOf) {
  let min = null;
  let max = null;
  for (const it of items) {
    const n = numberOf(it);
    if (n == null) continue;
    if (min == null || n < min) min = n;
    if (max == null || n > max) max = n;
  }
  return min == null ? null : { min, max };
}

// What OK means in the menu → the filter to store: the ticked values (pass
// null when every value is ticked) and / or a number range; null when
// neither narrows anything — no filter at all.
export function makeFilter(values, min = null, max = null) {
  const f = {};
  if (Array.isArray(values)) f.values = values;
  if (bound(min) != null) f.min = min;
  if (bound(max) != null) f.max = max;
  return Object.keys(f).length ? f : null;
}

// A filter's range in words — "100 to 500", "100 or more", "500 or less" —
// '' when it has none.
export function rangeText(f) {
  const min = bound(f?.min);
  const max = bound(f?.max);
  if (min != null && max != null) return `${min} to ${max}`;
  if (min != null) return `${min} or more`;
  return max != null ? `${max} or less` : '';
}
