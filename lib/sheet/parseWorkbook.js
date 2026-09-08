'use client';

import * as XLSX from 'xlsx';

// Turn one worksheet matrix into { headerRow, rows } (rows keyed by header).
function readSheet(ws) {
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: false, defval: '' });
  const headerIdx = detectHeaderRow(matrix);
  const headerRow = (matrix[headerIdx] || []).map((c) => String(c ?? '').trim());
  const rows = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const arr = matrix[i] || [];
    if (arr.every((c) => c === '' || c == null)) continue;
    const obj = {};
    headerRow.forEach((h, c) => {
      if (h) obj[h] = arr[c] ?? '';
    });
    rows.push(obj);
  }
  return { headerRow, rows };
}

// Parse an uploaded .csv/.xlsx/.xls File entirely in the browser — EVERY tab.
// Returns { fileName, sheetNames, byTab: { tab: { headerRow, rows } },
//           allHeaders: string[] (union across tabs) }.
export async function parseAllTabs(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const byTab = {};
  const headerSet = new Set();
  for (const name of wb.SheetNames) {
    const parsed = readSheet(wb.Sheets[name]);
    byTab[name] = parsed;
    parsed.headerRow.forEach((h) => h && headerSet.add(h));
  }
  return {
    fileName: file.name,
    sheetNames: wb.SheetNames,
    byTab,
    allHeaders: [...headerSet],
  };
}

// Back-compat single-sheet helper (first / named tab only).
export async function parseWorkbook(file, { sheetName } = {}) {
  const { fileName, sheetNames, byTab } = await parseAllTabs(file);
  const name = sheetName && sheetNames.includes(sheetName) ? sheetName : sheetNames[0];
  const { headerRow, rows } = byTab[name] || { headerRow: [], rows: [] };
  return { fileName, sheetName: name, sheetNames, headerRow, rows };
}

// Some marketplace exports prepend banner / metadata rows before the real
// header. Pick the row (within the first 20) with the most non-empty,
// mostly-text cells — that's the header.
function detectHeaderRow(matrix) {
  let best = 0;
  let bestScore = -1;
  const limit = Math.min(matrix.length, 20);
  for (let i = 0; i < limit; i++) {
    const row = matrix[i] || [];
    const cells = row.filter((c) => c !== '' && c != null);
    if (cells.length < 2) continue;
    const textCells = cells.filter((c) => typeof c === 'string' && !/^-?\d[\d,.]*$/.test(c.trim()));
    const score = cells.length + textCells.length;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
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
