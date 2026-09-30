import * as XLSX from 'xlsx';

// Orientation-aware sheet layout — shared by the dashboard's parser
// (parseWorkbook.js) and Template Settings' multi-sheet header extraction
// (sheetHeaders.js), so both read a sheet exactly the same way.
//
// A sheet's headers either run along a ROW (a normal table: headers across
// the top, one record per row below) or down a COLUMN (a key/value style
// sheet: headers down the left, one record per column to the right). A
// column sheet is simply transposed first, so every detection rule below is
// written once, in "line" terms, and applies to both.
//
// Merged-cell rule (see parseWorkbook.js for the full story): a line that is
// part of a merged banner is never the header line. For rows that's any
// real merge touching the row (unchanged from before orientations existed).
// For columns only merges that span several ROWS mark a column — a title
// banner merged ACROSS the top of a column-oriented sheet would otherwise
// disqualify every column underneath it, header column included.

export const ORIENTATIONS = ['row', 'column'];

export function cleanCell(c) {
  return String(c ?? '').trim();
}

export function nonEmptyCount(line) {
  let n = 0;
  for (const c of line || []) if (c !== '' && c != null) n += 1;
  return n;
}

// Spreadsheet column letter for a 1-based column number (1 → A, 28 → AB).
export function columnLetter(n) {
  return n > 0 ? XLSX.utils.encode_col(n - 1) : '';
}

// Raw grid + real merges, merges re-based onto the grid's own origin
// (sheet_to_json starts at the sheet's !ref, which isn't always A1).
export function sheetBase(ws) {
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: true, defval: '' });
  const origin = ws?.['!ref'] ? XLSX.utils.decode_range(ws['!ref']).s : { r: 0, c: 0 };
  const merges = (ws?.['!merges'] || [])
    .filter((m) => m.e.c > m.s.c || m.e.r > m.s.r)
    .map((m) => ({ s: { r: m.s.r - origin.r, c: m.s.c - origin.c }, e: { r: m.e.r - origin.r, c: m.e.c - origin.c } }));
  let width = 0;
  for (const row of matrix) if (row && row.length > width) width = row.length;
  return { matrix, merges, width };
}

// → { lines, merged } where `lines` are rows (row orientation) or columns
// (column orientation) and `merged` is the set of line indexes in a banner.
export function orientSheet(base, orientation = 'row') {
  const { matrix, merges, width } = base;
  const merged = new Set();
  if (orientation !== 'column') {
    for (const m of merges) for (let r = m.s.r; r <= m.e.r; r++) merged.add(r);
    return { lines: matrix, merged };
  }
  const lines = [];
  for (let c = 0; c < width; c++) {
    const line = new Array(matrix.length);
    for (let r = 0; r < matrix.length; r++) line[r] = matrix[r]?.[c] ?? '';
    lines.push(line);
  }
  for (const m of merges) {
    if (m.e.r > m.s.r) for (let c = m.s.c; c <= m.e.c; c++) merged.add(c);
  }
  return { lines, merged };
}

// Header line + first data line (0-based, -1 = not found). `headerIndex` /
// `valueIndex` are 1-based explicit overrides (a spreadsheet row or column
// number); null/0 = auto-detect. The header is still returned when there's
// no data after it — callers decide whether a header-only sheet counts.
export function detectTable({ lines, merged }, { headerIndex = null, valueIndex = null } = {}) {
  let headerIdx = headerIndex > 0 ? headerIndex - 1 : -1;
  if (headerIdx === -1) {
    for (let i = 0; i < lines.length; i++) {
      if (!merged.has(i) && nonEmptyCount(lines[i]) >= 2) { headerIdx = i; break; }
    }
  }
  if (headerIdx === -1 || headerIdx >= lines.length) return { headerIdx: -1, dataStart: -1 };

  let dataStart = valueIndex > 0 ? valueIndex - 1 : -1;
  if (dataStart === -1) {
    for (let j = headerIdx + 1; j < lines.length; j++) {
      if (!merged.has(j) && nonEmptyCount(lines[j]) >= 1) { dataStart = j; break; }
    }
  }
  if (dataStart >= lines.length) dataStart = -1;
  return { headerIdx, dataStart };
}
