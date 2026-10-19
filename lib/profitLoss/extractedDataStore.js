import { fmtHeaderCell } from './fmt';

// Persists every mapped header's extracted value per SKU — not just the
// ones currently shown via "My Details" (that toggle only hides columns on
// screen; resolveTemplate already computes every saved header regardless).
// Same free, debounced pattern as skuCosts (useDashboardSettings.js) — this
// is a standing per-user snapshot of "what this header last read for this
// SKU", not a metered "Save to History" run.
//
// Only non-computed headers are ever snapshotted/filled — a `primitive`
// (engine metric) or `formula` header must always reflect the CURRENTLY
// uploaded rows, never a frozen number from a previous session. Neither is a
// fixed header (data/fixedHeaders.js) — its value has a store of its own (the
// SKU Cost sheet, the upload's Account Name), and a cost emptied there has
// to go blank here, not come back from this snapshot.
const isSavable = (h) => !h.primitive && h.type !== 'formula' && !h.fixedKey;

// The config to resolve when ONLY this snapshot is wanted: the savable
// headers (plus the header the table groups by, so the rows are the same
// groups) and none of the Title Cards / Graphs / Tabs / Overview Tabs. A
// savable header's value comes off the sheet rows alone — no cost, formula
// or other header feeds it — so resolveTemplate over this gives exactly the
// cells the full config gives for those headers, at a fraction of the work.
// (The dashboard used to resolve the whole template a second time on every
// change just to read these.)
export function snapshotConfig(config) {
  const groupById = config?.marketplace?.groupByHeaderId;
  return {
    ...config,
    headers: (config?.headers || []).filter((h) => isSavable(h) || (groupById && h.id === groupById)),
    titleCards: [],
    graphs: [],
    tabs: [],
    overviewTabs: [],
  };
}

// resolveTemplate's live tableRows -> { [sku]: { [headerId]: rawValue } },
// non-empty cells only — nothing here is "this SKU has no value", only
// "this SKU actually had one". Kept by header id, so renaming a header in
// Template Settings keeps what was saved for it; a store saved before this
// is keyed by header name, which is still read (fillFromExtractedData) and
// moved over to ids by the next merge.
export function buildExtractedSnapshot(tableRows, headers) {
  const savable = headers.filter(isSavable);
  const out = {};
  for (const row of tableRows) {
    const cells = {};
    for (const h of savable) {
      const raw = row.cells[h.id]?.raw;
      if (raw != null && String(raw).trim() !== '') cells[h.id] = raw;
    }
    if (Object.keys(cells).length) out[row.key] = cells;
  }
  return out;
}

// Merge a fresh snapshot into the saved store — a value that DOES exist in
// the new snapshot overwrites (it's current), but a SKU/header the new
// upload simply doesn't touch keeps whatever was already saved for it
// (empty/missing never clears a previously-known value). `headers` (the
// savable ones the snapshot was taken with) moves any value still saved
// under a header's name onto its id — every SKU's, not just the snapshot's —
// unless the id already has one.
export function mergeExtractedData(saved, snapshot, headers = []) {
  const merged = { ...saved };
  const named = headers.filter(isSavable).filter((h) => h.name !== h.id);
  for (const [sku, cells] of Object.entries(merged)) {
    if (!named.some((h) => h.name in cells)) continue;
    const next = { ...cells };
    for (const h of named) {
      if (!(h.name in next)) continue;
      if (!(h.id in next)) next[h.id] = next[h.name];
      delete next[h.name];
    }
    merged[sku] = next;
  }
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
      const savedVal = saved[h.id] ?? saved[h.name]; // by id; by name in a store saved before ids
      if (hasCurrent || savedVal == null || String(savedVal).trim() === '') continue;
      changed = true;
      cells[h.id] = { raw: savedVal, display: fmtHeaderCell(h, savedVal) };
    }
    return changed ? { ...row, cells } : row;
  });
}
