'use client';

import { cleanCell, columnLetter, orientSheet, parseLineSpec, readWorkbook, resolveTable, sheetBase } from './sheetLayout';
import { parsePdfTabs } from './parsePdf';

// Template Settings' "upload a marketplace file → every sheet → Save All
// Sheets" flow. Unlike the dashboard parser (parseAllTabs), this lists EVERY
// sheet in the workbook — even one the dashboard would skip for having no
// data table — so the admin decides per sheet: include it or not, headers in
// a row or a column, and which row/column that is. Detection itself is the
// same shared ./sheetLayout.js the dashboard uses.

const FILLED_CHECK_LINES = 30; // how far down to look before calling a column empty
const SAMPLE_VALUES = 3;

export async function readSheetsForHeaders(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf' || file.type === 'application/pdf') {
    const wb = await parsePdfTabs(file);
    return {
      fileName: file.name,
      isPdf: true,
      sheets: wb.sheetNames.map((name) => ({ name, pdf: wb.byTab[name], rowCount: wb.byTab[name]?.rows?.length || 0, colCount: wb.byTab[name]?.headerRow?.length || 0 })),
    };
  }
  const buf = await file.arrayBuffer();
  const wb = readWorkbook(buf, file.name); // same reader as the dashboard (sheetLayout.js)
  return {
    fileName: file.name,
    isPdf: false,
    sheets: wb.SheetNames.map((name) => {
      const base = sheetBase(wb.Sheets[name], wb);
      return { name, base, oriented: { row: orientSheet(base, 'row') }, rowCount: base.matrix.length, colCount: base.width };
    }),
  };
}

// The column orientation is only transposed when first asked for (a big
// settlement sheet is rarely column-oriented) — returns a new sheet object,
// never mutates the one passed in.
export function withOrientation(sheet, orientation) {
  if (sheet.pdf || sheet.oriented?.[orientation]) return sheet;
  return { ...sheet, oriented: { ...sheet.oriented, [orientation]: orientSheet(sheet.base, orientation) } };
}

// → { headers, headerIndexes (1-based, effective), valueFrom / valueTo
//     (1-based, or null), dataCount, valueSpecOk, filled:Set,
//     samples:{header:[values]} } for one sheet under one setting.
// `headerIndexes` null/[] = auto-detect (one header line); several = those
// lines combined into "Group › Header" names. `valueSpec` ("4-end",
// "4, 6-10", "B-D") empty = auto (every line after the headers).
// `defaults` = the slot-wide header/value row (rowOverrideFor) auto-detect
// should honour, same as the dashboard. Same resolveTable the dashboard uses.
export function extractSheetHeaders(sheet, { orientation = 'row', headerIndexes = null, valueSpec = '' } = {}, defaults = null) {
  const empty = { headers: [], headerIndexes: [], valueFrom: null, valueTo: null, dataCount: 0, valueSpecOk: true, filled: new Set(), samples: {} };
  if (sheet.pdf) {
    const headers = uniqueNames(sheet.pdf.headerRow || []);
    const rows = sheet.pdf.rows || [];
    const filled = new Set(headers.filter((h) => rows.slice(0, FILLED_CHECK_LINES).some((r) => cleanCell(r[h]) !== '')));
    const samples = Object.fromEntries(headers.map((h) => [h, rows.map((r) => r[h]).filter((v) => cleanCell(v) !== '').slice(0, SAMPLE_VALUES)]));
    return { ...empty, headers, headerIndexes: [1], valueFrom: rows.length ? 2 : null, valueTo: rows.length ? rows.length + 1 : null, dataCount: rows.length, filled, samples };
  }
  const oriented = sheet.oriented?.[orientation] || orientSheet(sheet.base, orientation);
  const picked = (headerIndexes || []).filter((n) => n > 0);
  const fallbackHeader = orientation === 'row' ? defaults?.headerRowIndex || null : null;
  const v = orientation === 'row' ? defaults?.valueRowIndex || null : null;
  const lastHeader = picked.length ? Math.max(...picked) : fallbackHeader;
  const spec = String(valueSpec || '').trim();
  const valueSpecOk = !spec || parseLineSpec(spec, oriented.lines.length) !== null;
  const table = resolveTable(oriented, {
    headerIndexes: picked.length ? picked : null,
    headerIndex: fallbackHeader,
    valueIndex: v && (!lastHeader || v > lastHeader) ? v : null,
    valueSpec: valueSpecOk ? spec : null,
  });
  if (!table) return { ...empty, valueSpecOk };

  const positions = new Map(); // header (first spelling) → cell position
  const seen = new Set();
  table.headerRow.forEach((h, c) => {
    const key = h.toLowerCase();
    if (!h || seen.has(key)) return;
    seen.add(key);
    positions.set(h, c);
  });
  const headers = [...positions.keys()];
  const dataLines = table.valueIdxs.map((i) => oriented.lines[i]);
  const filled = new Set();
  const samples = {};
  for (const [h, c] of positions) {
    const vals = [];
    for (const l of dataLines.slice(0, FILLED_CHECK_LINES)) {
      const val = l?.[c];
      if (cleanCell(val) === '') continue;
      filled.add(h);
      if (vals.length < SAMPLE_VALUES) vals.push(val instanceof Date ? val.toISOString().slice(0, 10) : val);
    }
    samples[h] = vals;
  }
  const { valueIdxs } = table;
  return {
    headers,
    headerIndexes: table.headerIdxs.map((i) => i + 1),
    valueFrom: valueIdxs.length ? valueIdxs[0] + 1 : null,
    valueTo: valueIdxs.length ? valueIdxs[valueIdxs.length - 1] + 1 : null,
    dataCount: dataLines.length,
    valueSpecOk,
    filled,
    samples,
  };
}

// ── the sheet list's Header Row / Value Row boxes ⇄ what a sheet saves ──────
// Rows are numbers, columns (a Column-direction sheet) letters or numbers.
// An empty box is auto-detect.
//   Header Row  "2" — or "1, 2" for a header spread over two lines ("Group ›
//               Header") → headerIndexes [2] / [1, 2] (1-based).
//   Value Row   "4" — the first data line: rows 4 to the end, saved as the
//               valueSpec "4-end". A range or a list ("4-200", "4, 6-10")
//               is saved exactly as typed.
const MAX_LINES = 100000;
export const lineLabel = (n, isCol) => (isCol ? columnLetter(n) : String(n));

export const headerBoxText = (indexes, isCol) => (indexes || []).map((n) => lineLabel(n, isCol)).join(', ');

// → { ok, indexes } — indexes null = auto; ok false = not understood.
export function parseHeaderBox(text) {
  if (!String(text ?? '').trim()) return { ok: true, indexes: null };
  const parsed = parseLineSpec(text, MAX_LINES);
  return parsed?.length ? { ok: true, indexes: parsed.map((i) => i + 1) } : { ok: false, indexes: null };
}

export function valueSpecFromBox(text) {
  const t = String(text ?? '').trim();
  return /^(\d+|[a-z]+)$/i.test(t) ? `${t}-end` : t;
}

export function valueBoxText(spec) {
  const m = /^\s*(\d+|[a-z]+)\s*-\s*(end)?\s*$/i.exec(String(spec ?? ''));
  return m ? m[1] : String(spec ?? '');
}

// Case-/whitespace-insensitive de-dupe, first spelling wins.
export function uniqueNames(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list || []) {
    const name = cleanCell(raw);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}
