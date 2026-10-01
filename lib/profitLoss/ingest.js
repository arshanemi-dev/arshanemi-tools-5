import { detectPlatform, mapRowsForPlatform, pickBestTab } from '@/data/platforms/index';
import { guessMapping } from '@/data/platforms/manual';
import { normHeader, toISODate } from '@/data/platforms/canonical';
import { matchSlotHeaders } from '@/lib/sheet/matchSlotHeaders';
import { RESERVED_HEADER_IDS } from '@/data/templateSchema';

// One uploaded workbook → canonical rows, read the way the marketplace's
// Template Settings say (pure — DashboardWorkspace.onUpload calls it; the
// node tests call it directly).
//
//   - Sheets: a file slot saved with "Save All Sheets" reads EVERY included
//     sheet it named (each a separate part, so rows from different sheets of
//     one file merge by Order Id exactly like rows from different files do —
//     see mergeUploadsAcrossSlots' `mergeKey`). A slot from before sheets
//     existed — or an upload whose sheet names match none of the saved ones —
//     keeps the old rule: the one sheet that best fingerprints the platform.
//   - Template keys: the marketplace's own mappings for the template's Order
//     Id / SKU / Order Date headers drive the row's identity, SKU grouping and
//     date filter — over the platform mapper's built-in guess — but only for
//     a column the sheet being read actually has.
//
// `wb` = readAnyFile/parseAllTabs result (already parsed with the slot's
// per-sheet settings). `config` = the merged dashboard config (global headers
// with this marketplace's `mappedFrom`). → { ok: false, missing } when the
// file lacks columns the template expects, else { ok: true, parts: [{
// sheetName, platform, rows }] }.

const SKU_NAMES = new Set(['sku', 'skuname', 'sellersku', 'skucode', 'skuid']);

// The template headers that act as the upload's keys (each may be null).
export function templateKeyHeaders(config) {
  const headers = config?.headers || [];
  return {
    orderId: headers.find((h) => h.id === RESERVED_HEADER_IDS.orderId) || null,
    sku: headers.find((h) => h.primitive === 'sku') || headers.find((h) => SKU_NAMES.has(normHeader(h.name))) || null,
    orderDate: headers.find((h) => h.primitive === 'orderDate') || headers.find((h) => normHeader(h.name) === 'orderdate') || null,
  };
}

// This marketplace's mapped column(s) for a header that the given sheet has.
function mappedColumnsIn(header, headerRow) {
  const cols = header?.mappedFrom?.sheetHeaders || (header?.mappedFrom?.sheetHeader ? [header.mappedFrom.sheetHeader] : []);
  return cols.filter((c) => headerRow.includes(c));
}

function firstValue(row, cols) {
  for (const c of cols) {
    const v = row.meta?.[c];
    if (v != null && String(v).trim() !== '') return v;
  }
  return undefined;
}

function tabsToRead(slotDef, wb, platform) {
  const saved = (Array.isArray(slotDef?.sheets) ? slotDef.sheets : []).filter((s) => s && s.include !== false).map((s) => s.name);
  const present = saved.filter((n) => wb.sheetNames.includes(n));
  return present.length ? present : [pickBestTab(platform, wb.byTab, wb.sheetNames)];
}

export function ingestWorkbook(wb, { slotDef = null, config = {}, tag = null, fileName = '' } = {}) {
  const firstTab = wb.byTab[wb.sheetNames[0]] || { headerRow: [] };
  const filePlatform = detectPlatform(firstTab.headerRow, fileName || wb.fileName);
  const tabs = tabsToRead(slotDef, wb, filePlatform);

  const { ok, missing } = matchSlotHeaders(slotDef, wb.byTab[tabs[0]]?.headerRow || [], { wb });
  if (!ok) return { ok: false, missing };

  const keys = templateKeyHeaders(config);
  const parts = tabs.map((sheetName) => {
    const tab = wb.byTab[sheetName] || { headerRow: [], rows: [] };
    const headerRow = tab.headerRow || [];
    // A sheet that fingerprints a platform on its own wins; otherwise the
    // file's (e.g. the file name says "meesho").
    const own = detectPlatform(headerRow, '');
    const platform = own !== 'manual' ? own : filePlatform;

    const mapping = guessMapping(headerRow);
    const orderCols = mappedColumnsIn(keys.orderId, headerRow);
    const skuCols = mappedColumnsIn(keys.sku, headerRow);
    const dateCols = mappedColumnsIn(keys.orderDate, headerRow);
    if (orderCols.length) mapping.orderId = orderCols[0];
    if (skuCols.length) mapping.sku = skuCols[0];
    if (dateCols.length) mapping.orderDate = dateCols[0];

    const rows = mapRowsForPlatform(platform, tab.rows || [], { tag, mapping });
    if (skuCols.length || dateCols.length) {
      for (const r of rows) {
        const sku = skuCols.length ? firstValue(r, skuCols) : undefined;
        if (sku !== undefined) r.sku = String(sku).trim() || r.sku;
        const date = dateCols.length ? toISODate(firstValue(r, dateCols)) : null;
        if (date) r.orderDate = date;
      }
    }
    return { sheetName, platform, rows };
  });
  return { ok: true, parts };
}
