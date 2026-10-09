'use client';

import ExcelJS from 'exceljs';
import { SKU_COST_FIELDS } from '@/data/fixedHeaders';
import { isRealSku } from '@/lib/profitLoss/skuCosts';

// Build + download the "SKU Cost" workbook: one row per SKU, one column per
// fixed cost header (data/fixedHeaders.js SKU_COST_FIELDS — COGS (Product
// Cost), Cost GST in, Final Product Cost, Other Expense (per order); Account
// Name is not a cost and isn't here). Lists every SKU seen in the uploaded
// sheets plus any that already has a cost, each with the costs saved for it
// (`costs` — lib/profitLoss/skuCosts.js), so the seller edits the sheet and
// uploads it back (parseSkuCostSheet) without retyping what's already there.
export async function downloadSkuCostTemplate(seenSkus = [], costs = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Barmeto Profit & Loss';
  const ws = wb.addWorksheet('SKU Cost');

  ws.columns = [
    { header: 'SKU', key: 'sku', width: 28 },
    ...SKU_COST_FIELDS.map((f) => ({ header: f.name, key: f.key, width: Math.max(16, f.name.length + 4) })),
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];

  const skus = [...new Set([...seenSkus, ...Object.keys(costs)].map((s) => String(s ?? '').trim()).filter(isRealSku))].sort();
  if (skus.length === 0) {
    ws.addRow({ sku: 'EXAMPLE-SKU-1', cogs: 120, costGst: 6, finalCost: 126, otherExpense: 10 });
  } else {
    for (const sku of skus) {
      const saved = costs[sku] || {};
      ws.addRow({ sku, ...Object.fromEntries(SKU_COST_FIELDS.map((f) => [f.key, saved[f.key] ?? null])) });
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  triggerDownload(new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }), `sku-cost-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// Export the computed dashboard (KPI summary + per-SKU rows) to .xlsx. When
// `rawHeaders`/`rawRows` are supplied, a third "Raw Rows" sheet carries every
// line of every uploaded tab with every original header — nothing dropped.
export async function downloadDashboardXlsx({ summary, skuRows, columns, label, rawHeaders, rawRows, metaLabels = {} }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Barmeto Profit & Loss';

  const kpi = wb.addWorksheet('Summary');
  kpi.columns = [
    { header: 'Metric', key: 'metric', width: 20 },
    { header: 'Count', key: 'count', width: 14 },
    { header: 'Value (₹)', key: 'value', width: 18 },
  ];
  kpi.getRow(1).font = { bold: true };
  const S = summary;
  kpi.addRows([
    { metric: 'Order', count: S.order.count, value: S.order.value },
    { metric: 'Return', count: S.return.count, value: S.return.value },
    { metric: 'Canceled', count: S.canceled.count, value: S.canceled.value },
    { metric: 'RTO', count: S.rto.count, value: S.rto.value },
    { metric: `Ads Cost (${S.ads.pct}%)`, count: '', value: S.ads.value },
    { metric: 'Profit/Loss', count: S.profitLoss.count, value: S.profitLoss.value },
    { metric: 'COGS', count: S.cogs.count, value: S.cogs.value },
  ]);

  const detail = wb.addWorksheet('Details');
  detail.columns = columns.map((c) => ({ header: c.label, key: c.key, width: 16 }));
  detail.getRow(1).font = { bold: true };
  for (const r of skuRows) detail.addRow(r);

  if (Array.isArray(rawHeaders) && rawHeaders.length && Array.isArray(rawRows)) {
    const raw = wb.addWorksheet('Raw Rows');
    raw.columns = rawHeaders.map((h) => ({ header: metaLabels[h] ?? h, key: h, width: 18 }));
    raw.getRow(1).font = { bold: true };
    for (const r of rawRows) {
      raw.addRow(Object.fromEntries(rawHeaders.map((h) => [h, r[h] ?? ''])));
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const slug = (label || 'profit-loss').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  triggerDownload(new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }), `${slug}-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
