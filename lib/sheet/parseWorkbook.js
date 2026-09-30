'use client';

import * as XLSX from 'xlsx';
import { cleanCell, orientSheet, resolveTable, sheetBase } from './sheetLayout';

// ── Header / data detection (merged-cell rule) ─────────────────────────────
// Marketplace exports put a merged "group" banner on row 1 (and sometimes a
// merged notes row). Plain CSVs have no merges at all.
//
//   Rule 1 — the 1st row with NO merged cells is the HEADER row
//            (every cell there is its own column = a real header).
//   Rule 2 — the next row with NO merged cells is where VALUES start.
//   Rule 3 — if there is no such 2nd un-merged row, the sheet has no data
//            table → skip it entirely (its headers are never shown).
//
// A CSV / flat sheet has zero merges, so rule 1 → row 0, rule 2 → row 1.
//
// Both rules are a heuristic and can be fooled — e.g. Meesho's Payments
// export inserts a per-column formula-legend row (real, non-empty, non-
// merged text) between the header row and the real data, which Rule 2 can't
// tell apart from an actual data row. A file slot's `override`
// (headerRowIndex/valueRowIndex, 1-based — see lib/sheet/rowOverride.js)
// skips the guess entirely for that row when the admin has told us exactly
// where it is in Template Settings.

// Orientation (row vs column headers), the merged-line set and the header /
// data detection itself all live in ./sheetLayout.js, shared with Template
// Settings' multi-sheet header extraction so both read a sheet identically.
function readSheet(ws, override) {
  const oriented = orientSheet(sheetBase(ws), override?.orientation);
  const { lines: matrix } = oriented;
  const clean = (row) => (row || []).map(cleanCell);

  // Rule 1 + Rule 2 — header line(s) / value lines, unless overridden
  // (per-sheet picks from Template Settings: several header lines, explicit
  // value lines like "4-end"). Merged footer/subtotal bands and blank lines
  // are never values.
  const table = resolveTable(oriented, {
    headerIndexes: override?.headerIndexes,
    headerIndex: override?.headerRowIndex,
    valueIndex: override?.valueRowIndex,
    valueSpec: override?.valueSpec,
  });
  // Rule 3 — no header or no value line → this sheet has no table, skip it.
  if (!table || !table.valueIdxs.length) {
    return { headerRow: [], rows: [], groupRow: [], infoRow: [], headerMeta: {}, skip: true };
  }

  const { headerIdxs, headerRow, valueIdxs } = table;
  const headerIdx = headerIdxs[0];
  const lastHeaderIdx = headerIdxs[headerIdxs.length - 1];
  const dataStart = valueIdxs[0];
  const groupRow = headerIdx > 0 ? clean(matrix[headerIdx - 1]) : [];
  const infoRow = dataStart > lastHeaderIdx + 1 ? clean(matrix[lastHeaderIdx + 1]) : [];

  const rows = valueIdxs.map((i) => {
    const arr = matrix[i] || [];
    const obj = {};
    headerRow.forEach((h, c) => {
      if (h) obj[h] = arr[c] ?? '';
    });
    return obj;
  });

  const headerMeta = {};
  headerRow.forEach((h, c) => {
    if (h) headerMeta[h] = { group: groupRow[c] || '', info: infoRow[c] || '' };
  });

  // 1-based, same convention as a file slot's own headerRowIndex/
  // valueRowIndex — whatever actually decided this parse, whether that was
  // the merged-cell auto-detect or an explicit override, so a caller (the
  // Sheet Debugger) can show it back as the "this is what's in effect"
  // default instead of leaving the override fields looking unset.
  return { headerRow, rows, groupRow, infoRow, headerMeta, headerRowIndex: headerIdx + 1, valueRowIndex: dataStart + 1, skip: rows.length === 0 };
}

// One tab's effective override. The slot-wide headerRowIndex/valueRowIndex
// apply to every tab alike (a marketplace's quirky layout, e.g. Meesho's
// formula-legend row, is consistent across its sheets) — unless Template
// Settings saved per-sheet settings for this tab name (`override.sheets`,
// see lib/sheet/rowOverride.js): its orientation, its own explicit header
// row/column, or `include: false` to ignore the tab entirely. A slot-wide
// value row that isn't past the sheet's own header line is dropped (auto).
function overrideForSheet(override, name) {
  const own = override?.sheets?.[name];
  if (!own) return override;
  if (own.include === false) return { skip: true };
  const headerIndexes = Array.isArray(own.headerIndexes) && own.headerIndexes.length ? own.headerIndexes : null;
  const headerRowIndex = headerIndexes ? null : own.headerIndex > 0 ? own.headerIndex : override.headerRowIndex || null;
  const lastHeader = headerIndexes ? Math.max(...headerIndexes) : headerRowIndex;
  const v = override.valueRowIndex;
  const valueRowIndex = v > 0 && (!lastHeader || v > lastHeader) ? v : null;
  return { orientation: own.orientation === 'column' ? 'column' : 'row', headerIndexes, headerRowIndex, valueRowIndex, valueSpec: own.valueSpec || null };
}

// Parse an uploaded .csv/.xlsx/.xls File in the browser — every readable tab.
// `override` (from lib/sheet/rowOverride.js) — see overrideForSheet.
export async function parseAllTabs(file, override) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });

  const byTab = {};
  const sheetNames = [];
  const headerSet = new Set();
  for (const name of wb.SheetNames) {
    const sheetOverride = overrideForSheet(override, name);
    if (sheetOverride?.skip) continue; // excluded in Template Settings
    const parsed = readSheet(wb.Sheets[name], sheetOverride);
    if (parsed.skip) continue; // Rule 3 — a sheet with no data table is dropped
    byTab[name] = parsed;
    sheetNames.push(name);
    parsed.headerRow.forEach((h) => h && headerSet.add(h));
  }
  return {
    fileName: file.name,
    sheetNames,
    allSheetNames: wb.SheetNames,
    byTab,
    allHeaders: [...headerSet],
  };
}

// Back-compat single-sheet helper (first readable tab).
export async function parseWorkbook(file, { sheetName } = {}) {
  const { fileName, sheetNames, byTab } = await parseAllTabs(file);
  const name = sheetName && sheetNames.includes(sheetName) ? sheetName : sheetNames[0];
  const { headerRow = [], rows = [] } = byTab[name] || {};
  return { fileName, sheetName: name, sheetNames, headerRow, rows };
}

// Read a SKU-cost sheet (SKU, Cost[, Currency]) → { SKU: number } map.
export async function parseSkuCostSheet(file) {
  const { headerRow, rows } = await parseWorkbook(file);
  const norm = (s) => String(s).trim().toLowerCase().replace(/[\s_-]+/g, '');
  const skuKey = headerRow.find((h) => ['sku', 'skucode', 'skuname', 'sellersku'].includes(norm(h)));
  const costKey = headerRow.find((h) =>
    ['cost', 'unitcost', 'productcost', 'costprice', 'cogs', 'purchaseprice', 'buyprice'].includes(norm(h)),
  );
  const map = {};
  if (!skuKey || !costKey) return { map, skuKey, costKey, count: 0 };
  for (const r of rows) {
    const sku = String(r[skuKey] ?? '').trim();
    const cost = parseFloat(String(r[costKey] ?? '').replace(/[₹$,\s]/g, ''));
    if (sku && Number.isFinite(cost)) map[sku] = cost;
  }
  return { map, skuKey, costKey, count: Object.keys(map).length };
}
