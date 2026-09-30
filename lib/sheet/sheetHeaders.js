'use client';

import * as XLSX from 'xlsx';
import { cleanCell, detectTable, nonEmptyCount, orientSheet, sheetBase } from './sheetLayout';
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
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  return {
    fileName: file.name,
    isPdf: false,
    sheets: wb.SheetNames.map((name) => {
      const base = sheetBase(wb.Sheets[name]);
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

// → { headers, headerIndex (1-based, effective), dataCount, filled:Set,
//     samples:{header:[values]} } for one sheet under one setting.
// `headerIndex` null = auto-detect; `defaults` = the slot-wide header/value
// row (rowOverrideFor) auto-detect should honour, same as the dashboard.
export function extractSheetHeaders(sheet, { orientation = 'row', headerIndex = null } = {}, defaults = null) {
  const empty = { headers: [], headerIndex: null, dataCount: 0, filled: new Set(), samples: {} };
  if (sheet.pdf) {
    const headers = uniqueNames(sheet.pdf.headerRow || []);
    const rows = sheet.pdf.rows || [];
    const filled = new Set(headers.filter((h) => rows.slice(0, FILLED_CHECK_LINES).some((r) => cleanCell(r[h]) !== '')));
    const samples = Object.fromEntries(headers.map((h) => [h, rows.map((r) => r[h]).filter((v) => cleanCell(v) !== '').slice(0, SAMPLE_VALUES)]));
    return { headers, headerIndex: 1, dataCount: rows.length, filled, samples };
  }
  const oriented = sheet.oriented?.[orientation] || orientSheet(sheet.base, orientation);
  const explicit = headerIndex > 0 ? headerIndex : null;
  const fallbackHeader = orientation === 'row' ? defaults?.headerRowIndex || null : null;
  const v = orientation === 'row' ? defaults?.valueRowIndex || null : null;
  const hIdx = explicit || fallbackHeader;
  const { headerIdx, dataStart } = detectTable(oriented, {
    headerIndex: hIdx,
    valueIndex: v && (!hIdx || v > hIdx) ? v : null,
  });
  if (headerIdx === -1) return empty;

  const line = (oriented.lines[headerIdx] || []).map(cleanCell);
  const positions = new Map(); // header (first spelling) → cell position
  const seen = new Set();
  line.forEach((h, c) => {
    const key = h.toLowerCase();
    if (!h || seen.has(key)) return;
    seen.add(key);
    positions.set(h, c);
  });
  const headers = [...positions.keys()];

  const dataLines = [];
  if (dataStart !== -1) {
    for (let i = dataStart; i < oriented.lines.length; i++) {
      if (oriented.merged.has(i) || !nonEmptyCount(oriented.lines[i])) continue;
      dataLines.push(oriented.lines[i]);
    }
  }
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
  return { headers, headerIndex: headerIdx + 1, dataCount: dataLines.length, filled, samples };
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
