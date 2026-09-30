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

// → { lines, merged, boxes } where `lines` are rows (row orientation) or
// columns (column orientation), `merged` is the set of line indexes in a
// banner, and `boxes` are the merges in line terms ({ l1, l2, p1, p2 }: line
// range × position range) — used to spread a merged group label across
// every column it covers when several header lines are combined.
export function orientSheet(base, orientation = 'row') {
  const { matrix, merges, width } = base;
  const merged = new Set();
  if (orientation !== 'column') {
    for (const m of merges) for (let r = m.s.r; r <= m.e.r; r++) merged.add(r);
    const boxes = merges.map((m) => ({ l1: m.s.r, l2: m.e.r, p1: m.s.c, p2: m.e.c }));
    return { lines: matrix, merged, boxes };
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
  const boxes = merges.map((m) => ({ l1: m.s.c, l2: m.e.c, p1: m.s.r, p2: m.e.r }));
  return { lines, merged, boxes };
}

// ── explicit header / value line picks (Template Settings, per sheet) ──────

// A 1-based line number from "4" or, for columns, a letter like "B".
function lineNumber(tok) {
  if (/^\d+$/.test(tok)) return Number(tok);
  if (/^[a-z]+$/i.test(tok)) return XLSX.utils.decode_col(tok.toUpperCase()) + 1;
  return NaN;
}

// "4-end", "4-200", "4, 6-10, 15", "4 to end", "B-D" (columns) → sorted
// unique 0-based line indexes, or null when empty / not understood.
export function parseLineSpec(spec, max) {
  const s = String(spec ?? '').trim().toLowerCase().replace(/\s+to\s+/g, '-');
  if (!s) return null;
  const out = new Set();
  for (const tok of s.split(/[\s,;]+/).filter(Boolean)) {
    const [aRaw, bRaw, extra] = tok.split('-');
    if (extra !== undefined) return null;
    const a = lineNumber(aRaw);
    const toEnd = bRaw === '' || bRaw === 'end';
    const b = bRaw === undefined ? a : toEnd ? max : lineNumber(bRaw);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 1) return null;
    if (!toEnd && b < a) return null; // "9-2" is backwards; "9-end" past a short sheet just matches nothing
    for (let i = a; i <= Math.min(b, max); i++) out.add(i - 1);
  }
  return [...out].sort((x, y) => x - y);
}

function filledLine(oriented, L) {
  const cells = (oriented.lines[L] || []).map(cleanCell);
  for (const b of oriented.boxes || []) {
    if (L < b.l1 || L > b.l2) continue;
    const v = cleanCell(oriented.lines[b.l1]?.[b.p1]);
    for (let p = b.p1; p <= b.p2; p++) cells[p] = v;
  }
  return cells;
}

// Several header lines → one name per position, "Group › Header" (merged
// group labels spread across the columns they cover; a repeated part — e.g.
// from a vertical merge — only appears once).
export function combineHeaderLines(oriented, idxs) {
  const lines = idxs.map((L) => filledLine(oriented, L));
  let width = 0;
  for (const l of lines) if (l.length > width) width = l.length;
  const out = [];
  for (let p = 0; p < width; p++) {
    const parts = [];
    for (const l of lines) { const v = l[p] || ''; if (v && parts[parts.length - 1] !== v) parts.push(v); }
    out.push(parts.join(' › '));
  }
  return out;
}

// The whole table for one sheet: header line(s), the header names, and the
// value lines. Explicit picks win (`headerIndexes` 1-based, several allowed;
// `valueSpec` like "4-end"); otherwise the merged-cell auto-detect decides,
// honouring the single `headerIndex` / `valueIndex` overrides exactly as
// before. Value lines never include a header line, a merged banner line or
// a blank line. → { headerIdxs, headerRow, valueIdxs } or null (no header).
export function resolveTable(oriented, { headerIndexes = null, headerIndex = null, valueIndex = null, valueSpec = null } = {}) {
  const { lines, merged } = oriented;
  const picked = [...new Set((headerIndexes || []).map((n) => Number(n) - 1))]
    .filter((i) => i >= 0 && i < lines.length)
    .sort((a, b) => a - b);
  let headerIdxs;
  let dataStart = -1;
  if (picked.length) {
    headerIdxs = picked;
    const last = picked[picked.length - 1];
    const v = valueIndex > 0 ? valueIndex - 1 : -1;
    if (v > last && v < lines.length) dataStart = v;
    else for (let j = last + 1; j < lines.length; j++) if (!merged.has(j) && nonEmptyCount(lines[j]) >= 1) { dataStart = j; break; }
  } else {
    const d = detectTable(oriented, { headerIndex, valueIndex });
    if (d.headerIdx === -1) return null;
    headerIdxs = [d.headerIdx];
    dataStart = d.dataStart;
  }
  const headerRow = headerIdxs.length === 1 ? (lines[headerIdxs[0]] || []).map(cleanCell) : combineHeaderLines(oriented, headerIdxs);

  const explicit = valueSpec ? parseLineSpec(valueSpec, lines.length) : null;
  let candidates = explicit || [];
  if (!explicit && dataStart !== -1) {
    candidates = [];
    for (let i = dataStart; i < lines.length; i++) candidates.push(i);
  }
  const isHeader = new Set(headerIdxs);
  const valueIdxs = candidates.filter((i) => !isHeader.has(i) && !merged.has(i)
    && !(lines[i] || []).every((c) => c === '' || c == null));
  return { headerIdxs, headerRow, valueIdxs };
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
