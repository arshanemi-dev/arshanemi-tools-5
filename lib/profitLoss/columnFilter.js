// Excel-style column filters for the dashboard tables (DetailsTable,
// OverviewTreeTable): a column's filter is the list of values it may show —
// { values: [text, ...] } — picked from a searchable checklist of everything
// the column currently holds (components/dashboard/ColumnFilterMenu.jsx).
// A cell is matched on what it SHOWS ("29 Jul 2026", "3 days", "1,299"), so
// what is ticked is exactly what is seen; '' stands for a blank cell. Pure.

export const BLANK_LABEL = '(Blanks)';

// The text a cell is filtered on.
export const cellText = (cell) => (cell?.display == null ? '' : String(cell.display).trim());

// filters { [columnKey]: { values } | null } → [[key, Set], ...] for the
// columns that are on screen (`keys`) — a filter on a column that has since
// been hidden must not keep narrowing the table invisibly.
export function activeFilters(filters, keys) {
  const shown = new Set(keys);
  return Object.entries(filters || {})
    .filter(([key, f]) => shown.has(key) && Array.isArray(f?.values))
    .map(([key, f]) => [key, new Set(f.values)]);
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

// What OK means in the menu → the filter to store: null when every value is
// allowed (no filter at all), else the chosen values.
export function filterFromChoice(chosen, allCount) {
  return chosen.length >= allCount ? null : { values: chosen };
}
