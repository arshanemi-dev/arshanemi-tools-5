// What a formula's SUM([..]) / COUNT([..]) reduce over in resolveTemplate:
// the raw sheet rows behind a group, one column at a time.

// The headers whose value is a raw sheet column (mapped per marketplace) —
// not an engine metric, not a formula — keyed by name: the columns that can
// be read sheet row by sheet row.
export function rawColumnsByName(headers) {
  return new Map(headers.filter((h) => !h.primitive && h.type !== 'formula').map((h) => [String(h.name).trim(), h]));
}

// The `rows` context evaluateFormula takes (lib/profitLoss/formula.js), for
// one group of raw sheet rows — a SKU's rows, one transaction's, the whole
// filtered set: a raw column's value on each of those rows. That is what
// lets COUNT([Status], "Delivered") count a group's delivered orders — the
// group's own Status cell is already collapsed to a single value by then.
// Read lazily, and only the columns a formula actually names. null for
// anything else (an engine metric, another formula) — the caller's own
// fallback applies. `readValue(header, row)` is resolveTemplate's
// readHeaderFromRow, passed in the same way overviewTree.js takes it.
export function rawColumnReader(rawColumns, rows, readValue) {
  const cache = new Map();
  return (name) => {
    const header = rawColumns.get(name);
    if (!header) return null;
    if (!cache.has(name)) cache.set(name, rows.map((r) => readValue(header, r)));
    return cache.get(name);
  };
}
