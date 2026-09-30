// A file slot's headerRowIndex/valueRowIndex (Template Settings, 1-based like
// a spreadsheet row number) only means something once an admin has actually
// moved it away from makeFileSlot()'s factory default (1, 2) — otherwise
// every untouched slot would force-disable the auto-detect heuristic in
// parseWorkbook.js, including plain sheets it already handles correctly.
// Once set, it wins outright over auto-detect: exact beats guessed, and it's
// the fix for a sheet like Meesho Payments, which inserts a per-column
// formula-legend row between the header row and the real data — a row the
// merged-cell heuristic can't tell apart from an actual data row.
//
// `sheets` carries the per-sheet settings saved by Template Settings' "Save
// All Sheets" (fileSlot.sheets[]) keyed by sheet name: include/ignore, row vs
// column headers, the explicit header row(s)/column(s) and the explicit
// value lines ("4-end", "4, 6-10") — each only when the admin actually set
// it (headerIndexAuto === false / a non-empty valueSpec); anything left on
// auto stays auto so a real upload with one extra banner line still parses.
export function rowOverrideFor(slot) {
  if (!slot) return null;
  const h = Number(slot.headerRowIndex) || 0;
  const v = Number(slot.valueRowIndex) || 0;
  const isDefault = (h === 0 || h === 1) && (v === 0 || v === 2);
  const sheets = sheetOverridesFor(slot);
  if (isDefault && !sheets) return null;
  return {
    headerRowIndex: !isDefault && h > 0 ? h : null,
    valueRowIndex: !isDefault && v > 0 ? v : null,
    ...(sheets ? { sheets } : {}),
  };
}

function sheetOverridesFor(slot) {
  const list = Array.isArray(slot.sheets) ? slot.sheets : [];
  if (!list.length) return null;
  const out = {};
  for (const s of list) {
    if (!s?.name) continue;
    const explicitHeaders = s.headerIndexAuto === false;
    const headerIndexes = explicitHeaders && Array.isArray(s.headerIndexes) && s.headerIndexes.length
      ? s.headerIndexes.map(Number).filter((n) => n > 0)
      : null;
    out[s.name] = {
      include: s.include !== false,
      orientation: s.orientation === 'column' ? 'column' : 'row',
      headerIndexes,
      // sheets saved before multi-line headers existed kept a single number
      headerIndex: explicitHeaders && !headerIndexes ? Number(s.headerIndex) || null : null,
      valueSpec: s.valueSpec ? String(s.valueSpec) : null,
    };
  }
  return out;
}
