// A file slot's headerRowIndex/valueRowIndex (Template Settings, 1-based like
// a spreadsheet row number) only means something once an admin has actually
// moved it away from makeFileSlot()'s factory default (1, 2) — otherwise
// every untouched slot would force-disable the auto-detect heuristic in
// parseWorkbook.js, including plain sheets it already handles correctly.
// Once set, it wins outright over auto-detect: exact beats guessed, and it's
// the fix for a sheet like Meesho Payments, which inserts a per-column
// formula-legend row between the header row and the real data — a row the
// merged-cell heuristic can't tell apart from an actual data row.
export function rowOverrideFor(slot) {
  if (!slot) return null;
  const h = Number(slot.headerRowIndex) || 0;
  const v = Number(slot.valueRowIndex) || 0;
  const isDefault = (h === 0 || h === 1) && (v === 0 || v === 2);
  if (isDefault) return null;
  return { headerRowIndex: h > 0 ? h : null, valueRowIndex: v > 0 ? v : null };
}
