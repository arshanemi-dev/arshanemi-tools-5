'use client';

import { SKU_COST_FIELDS } from '@/data/fixedHeaders';
import { costKeyParts, isRealSku } from '@/lib/profitLoss/skuCosts';

// Build + download the "SKU Cost" workbook: one row per SKU, one column per
// fixed cost header (data/fixedHeaders.js SKU_COST_FIELDS — COGS (Product
// Cost), Product GST In, Final Product Cost, Office Expense (Per Order); Account
// Name is not a cost and isn't here). Lists every SKU seen in the uploaded
// sheets plus any that already has a cost, each with the costs saved for it
// (`costs` — lib/profitLoss/skuCosts.js), so the seller edits the sheet and
// uploads it back (parseSkuCostSheet) without retyping what's already there.
export async function downloadSkuCostTemplate(seenSkus = [], costs = {}) {
  // Loaded on the click, not with the page — exceljs is far too large to
  // ship in the dashboard's first load for a download button.
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Barmeto Profit & Loss';
  const ws = wb.addWorksheet('SKU Cost');

  ws.columns = [
    { header: 'SKU', key: 'sku', width: 28 },
    // Blank = every size of this SKU; filled = only that size — it wins over
    // the blank row for orders of that size.
    { header: 'Size', key: 'size', width: 12 },
    // Blank = this SKU in every account; filled = only in that Account Name
    // (Market Place_Brand) — it wins over the blank row for that account.
    { header: 'Account Name', key: 'accountName', width: 24 },
    ...SKU_COST_FIELDS.map((f) => ({ header: f.name, key: f.key, width: Math.max(16, f.name.length + 4) })),
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];

  // `seenSkus` / costs' keys are cost keys: a SKU, or SKU + Account Name
  // (lib/profitLoss/skuCosts.js costKey). SKU-wide row first, then its accounts.
  const skus = [...new Set([...seenSkus, ...Object.keys(costs)].map((s) => String(s ?? '').trim()).filter((k) => isRealSku(costKeyParts(k).sku)))]
    .sort((a, b) => {
      const x = costKeyParts(a);
      const y = costKeyParts(b);
      return x.sku.localeCompare(y.sku, undefined, { numeric: true }) || x.size.localeCompare(y.size, undefined, { numeric: true }) || x.accountName.localeCompare(y.accountName);
    });
  if (skus.length === 0) {
    ws.addRow({ sku: 'EXAMPLE-SKU-1', cogs: 120, costGst: 6, finalCost: 126, otherExpense: 10 });
  } else {
    for (const sku of skus) {
      const saved = costs[sku] || {};
      const { sku: code, size, accountName } = costKeyParts(sku);
      ws.addRow({ sku: code, size, accountName, ...Object.fromEntries(SKU_COST_FIELDS.map((f) => [f.key, saved[f.key] ?? null])) });
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  triggerDownload(new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }), `sku-cost-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
