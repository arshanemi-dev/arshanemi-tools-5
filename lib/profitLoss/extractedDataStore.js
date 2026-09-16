import { fmtCell } from './fmt';

// Persists every mapped header's extracted value per SKU — not just the
// ones currently shown via "My Details" (that toggle only hides columns on
// screen; resolveTemplate already computes every saved header regardless).
// Same free, debounced pattern as skuCosts (useDashboardSettings.js) — this
// is a standing per-user snapshot of "what this header last read for this
// SKU", not a metered "Save to History" run.
//
// Only non-computed headers are ever snapshotted/filled — a `primitive`
// (engine metric) or `formula` header must always reflect the CURRENTLY
// uploaded rows, never a frozen number from a previous session.
const isSavable = (h) => !h.primitive && h.type !== 'formula';

// resolveTemplate's live tableRows -> { [sku]: { [headerName]: rawValue } },
// non-empty cells only — nothing here is "this SKU has no value", only
// "this SKU actually had one".
export function buildExtractedSnapshot(tableRows, headers) {
  const savable = headers.filter(isSavable);
  const out = {};
  for (const row of tableRows) {
    const cells = {};
    for (const h of savable) {
      const raw = row.cells[h.id]?.raw;
      if (raw != null && String(raw).trim() !== '') cells[h.name] = raw;
    }
    if (Object.keys(cells).length) out[row.key] = cells;
  }
  return out;
}

// Merge a fresh snapshot into the saved store — a value that DOES exist in
// the new snapshot overwrites (it's current), but a SKU/header the new
// upload simply doesn't touch keeps whatever was already saved for it
// (empty/missing never clears a previously-known value).
export function mergeExtractedData(saved, snapshot) {
  const merged = { ...saved };
  for (const [sku, cells] of Object.entries(snapshot)) {
    merged[sku] = { ...(merged[sku] || {}), ...cells };
  }
  return merged;
}

// Fills gaps in the live tableRows from the saved store — only a cell that's
// CURRENTLY empty for a non-computed header gets a stand-in value, so a
// column this session's upload doesn't map/have still shows what it was
// last known to be, without ever overriding a real, freshly-computed one.
export function fillFromExtractedData(tableRows, headers, extractedData) {
  if (!extractedData || !Object.keys(extractedData).length) return tableRows;
  const savable = headers.filter(isSavable);
  if (!savable.length) return tableRows;
  return tableRows.map((row) => {
    const saved = extractedData[row.key];
    if (!saved) return row;
    let changed = false;
    const cells = { ...row.cells };
    for (const h of savable) {
      const current = cells[h.id]?.raw;
      const hasCurrent = current != null && String(current).trim() !== '';
      const savedVal = saved[h.name];
      if (hasCurrent || savedVal == null || String(savedVal).trim() === '') continue;
      changed = true;
      const display = h.type === 'text' || h.type === 'alphanumeric' ? String(savedVal) : fmtCell(savedVal, h.format);
      cells[h.id] = { raw: savedVal, display };
    }
    return changed ? { ...row, cells } : row;
  });
}
