'use client';

import { GENERAL_GROUP, GENERAL_GROUP_ID, groupIdOf } from '@/lib/profitLoss/headerGroups';
import { headerUsages, isOurHeader } from '@/lib/profitLoss/headerUsage';

// Template Settings › Header › Download Excel: every header of the Global
// Settings draft, documented — an "All Headers" sheet, then one sheet per
// category (header group: General + the admin's own), each header with its
// type, format, formula, description, Show / Hide, kind, the marketplace
// columns mapped to it and everything that uses it. Read-only paperwork:
// nothing is uploaded back from it.
//
// `config` = the Global Settings draft; `marketplaces` = [{ marketplaceName,
// config: { fileSlots } }] (their mappings); `headerGroups` = { groups,
// members } or null; `isHidden(headerId)` = the Show / Hide switch.

const COLUMNS = [
  { header: '#', key: 'n', width: 5 },
  { header: 'Header', key: 'name', width: 28 },
  { header: 'Category', key: 'category', width: 16 },
  { header: 'Type', key: 'type', width: 13 },
  { header: 'Format', key: 'format', width: 9 },
  { header: 'Formula', key: 'formula', width: 48 },
  { header: 'Description', key: 'description', width: 40 },
  { header: 'Dashboard', key: 'shown', width: 11 },
  { header: 'Show in table', key: 'inTable', width: 13 },
  { header: 'Kind', key: 'kind', width: 22 },
  { header: 'Mapped columns (Marketplace › File › Sheet › Column)', key: 'mapped', width: 50 },
  { header: 'Used in', key: 'usedIn', width: 44 },
  { header: 'Created', key: 'created', width: 12 },
];

const TYPE_LABELS = { formula: 'Formula', number: 'Number', text: 'Text', alphanumeric: 'Alphanumeric', date: 'Date' };
const FORMAT_LABELS = { money: '₹ Money', int: 'Count', pct: '%', text: 'Text' };

function kindOf(h) {
  if (h.reserved && !h.fixedKey) return 'Required (built-in)';
  if (h.fixedKey) return 'Built-in';
  return isOurHeader(h) ? 'Our header' : 'Sheet column (auto-imported)';
}

// Every marketplace column mapped to `headerId`, one per line.
function mappedColumns(marketplaces, headerId) {
  const out = [];
  for (const t of marketplaces || []) {
    for (const slot of t.config?.fileSlots || []) {
      for (const m of slot.mappings || []) {
        if (m.headerId !== headerId) continue;
        out.push([t.marketplaceName || 'Marketplace', slot.label || 'File', m.sheet, m.sheetHeader].filter(Boolean).join(' › '));
      }
    }
  }
  return out.join('\n');
}

// Excel sheet names: ≤ 31 characters, none of : \ / ? * [ ], unique.
function sheetName(name, taken) {
  const base = String(name || 'Sheet').replace(/[:\\/?*[\]]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';
  let out = base;
  for (let i = 2; taken.has(out.toLowerCase()); i += 1) out = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
  taken.add(out.toLowerCase());
  return out;
}

function addSheet(wb, name, rows) {
  const ws = wb.addWorksheet(name);
  ws.columns = COLUMNS;
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1565C0' } };
  head.alignment = { vertical: 'middle', wrapText: true };
  rows.forEach((r, i) => ws.addRow({ ...r, n: i + 1 }));
  // Long formulas, descriptions and mapping lists wrap inside their cells.
  ws.eachRow((row, i) => { if (i > 1) row.alignment = { vertical: 'top', wrapText: true }; });
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];
  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length + 1, column: COLUMNS.length } };
  return ws;
}

export async function downloadHeadersWorkbook({ config, marketplaces = [], headerGroups = null, isHidden = () => false }) {
  // Loaded on the click — exceljs is far too large for the page's first load.
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Barmeto Profit & Loss';

  const groups = [...(headerGroups?.groups?.length ? headerGroups.groups : [GENERAL_GROUP])]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const groupName = (id) => groups.find((g) => g.id === id)?.name || GENERAL_GROUP.name;
  const headers = config?.headers || [];

  const rows = headers.map((h) => {
    const groupId = (headerGroups && groupIdOf(headerGroups, h.id)) || GENERAL_GROUP_ID;
    return {
      groupId,
      name: h.name,
      category: groupName(groupId),
      type: TYPE_LABELS[h.type] || h.type || '',
      format: h.type === 'date' ? 'Date' : FORMAT_LABELS[h.format] || h.format || '',
      formula: h.type === 'formula' ? h.formula || '' : '',
      description: h.description || '',
      shown: isHidden(h.id) ? 'Hidden' : 'Shown',
      inTable: h.showInTable === false ? 'No' : 'Yes',
      kind: kindOf(h),
      mapped: mappedColumns(marketplaces, h.id),
      usedIn: headerUsages(config, h).join('\n'),
      created: h.createdAt ? String(h.createdAt).slice(0, 10) : '',
    };
  });

  const taken = new Set();
  addSheet(wb, sheetName('All Headers', taken), rows);
  for (const g of groups) {
    const mine = rows.filter((r) => r.groupId === g.id);
    if (mine.length) addSheet(wb, sheetName(g.name, taken), mine);
  }

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `headers-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
