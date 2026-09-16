'use client';

import * as XLSX from 'xlsx';

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

function mergedRowSet(ws) {
  const set = new Set();
  for (const m of ws['!merges'] || []) {
    // only spans that actually merge something (multi-column or multi-row)
    if (m.e.c > m.s.c || m.e.r > m.s.r) {
      for (let r = m.s.r; r <= m.e.r; r++) set.add(r);
    }
  }
  return set;
}

function nonEmptyCount(row) {
  return (row || []).filter((c) => c !== '' && c != null).length;
}

function readSheet(ws, override) {
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: true, defval: '' });
  const merged = mergedRowSet(ws);
  const clean = (row) => (row || []).map((c) => String(c ?? '').trim());

  // Rule 1 — first un-merged row that actually looks like headers, unless
  // the slot's own headerRowIndex overrides it.
  let headerIdx = override?.headerRowIndex > 0 ? override.headerRowIndex - 1 : -1;
  if (headerIdx === -1) {
    for (let i = 0; i < matrix.length; i++) {
      if (!merged.has(i) && nonEmptyCount(matrix[i]) >= 2) {
        headerIdx = i;
        break;
      }
    }
  }
  if (headerIdx === -1 || headerIdx >= matrix.length) {
    return { headerRow: [], rows: [], groupRow: [], infoRow: [], headerMeta: {}, skip: true };
  }

  // Rule 2 — next un-merged row with any content → data starts here, unless
  // the slot's own valueRowIndex overrides it.
  let dataStart = override?.valueRowIndex > 0 ? override.valueRowIndex - 1 : -1;
  if (dataStart === -1) {
    for (let j = headerIdx + 1; j < matrix.length; j++) {
      if (!merged.has(j) && nonEmptyCount(matrix[j]) >= 1) {
        dataStart = j;
        break;
      }
    }
  }
  // Rule 3 — no un-merged data row → this sheet has no table, skip it.
  if (dataStart === -1 || dataStart >= matrix.length) {
    return { headerRow: [], rows: [], groupRow: [], infoRow: [], headerMeta: {}, skip: true };
  }

  const headerRow = clean(matrix[headerIdx]);
  const groupRow = headerIdx > 0 ? clean(matrix[headerIdx - 1]) : [];
  const infoRow = dataStart > headerIdx + 1 ? clean(matrix[headerIdx + 1]) : [];

  const rows = [];
  for (let i = dataStart; i < matrix.length; i++) {
    if (merged.has(i)) continue; // stray merged footer/subtotal band
    const arr = matrix[i] || [];
    if (arr.every((c) => c === '' || c == null)) continue;
    const obj = {};
    headerRow.forEach((h, c) => {
      if (h) obj[h] = arr[c] ?? '';
    });
    rows.push(obj);
  }

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

// Parse an uploaded .csv/.xlsx/.xls File in the browser — every readable tab.
// `override` (headerRowIndex/valueRowIndex, from lib/sheet/rowOverride.js)
// applies to every tab alike, since a marketplace's quirky layout (e.g.
// Meesho's formula-legend row) is consistent across all its sheets.
export async function parseAllTabs(file, override) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });

  const byTab = {};
  const sheetNames = [];
  const headerSet = new Set();
  for (const name of wb.SheetNames) {
    const parsed = readSheet(wb.Sheets[name], override);
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
