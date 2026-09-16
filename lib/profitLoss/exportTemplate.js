'use client';

// Template-aware dashboard export. `tabs` = [{ tabName, cards:[{ name,
// mainDisplay, subDisplay }], table:{ columns:[name], rows:[[display]] } }] —
// one entry per visible Tab/Overview Tab (see DashboardWorkspace.buildTabView),
// each already trimmed to just "My Details" or the full header set exactly as
// the screen currently shows it. Writes an .xlsx (exceljs) or .pdf (jspdf +
// autotable), one sheet/section per tab. Both libs are already deps; both are
// lazy-imported. Chart images aren't embedded (yet) — every tab's title cards
// and table are, in full.

function slug(s) {
  return String(s || 'dashboard').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}
const stamp = () => new Date().toISOString().slice(0, 10);

// Excel sheet names: <=31 chars, no \/*?[]:, and unique within the workbook.
function safeSheetName(name, used) {
  const base = (String(name || 'Sheet').replace(/[\\/*?[\]:]/g, '').trim() || 'Sheet').slice(0, 28);
  let candidate = base;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base}-${i}`.slice(0, 31);
    i += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export async function downloadMultiTabXlsx({ label, tabs = [] }) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const used = new Set();

  for (const t of tabs) {
    if (t.cards.length) {
      const cardSheet = wb.addWorksheet(safeSheetName(`${t.tabName} Summary`, used));
      cardSheet.addRow([`${label || 'Dashboard'} — ${t.tabName || ''}`]);
      cardSheet.addRow([]);
      cardSheet.addRow(['Card', 'Value', 'Sub']);
      for (const c of t.cards) cardSheet.addRow([c.name, c.mainDisplay ?? '', c.subDisplay ?? '']);
      cardSheet.getRow(3).font = { bold: true };
    }

    const grid = wb.addWorksheet(safeSheetName(t.tabName, used));
    grid.addRow(t.table.columns);
    grid.getRow(1).font = { bold: true };
    for (const row of t.table.rows) grid.addRow(row);
    grid.columns.forEach((col) => { col.width = 16; });
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  triggerDownload(blob, `${slug(label)}-${stamp()}.xlsx`);
}

export async function downloadMultiTabPdf({ label, tabs = [] }) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  tabs.forEach((t, i) => {
    if (i > 0) doc.addPage();
    doc.setFontSize(15);
    doc.text(`${label || 'Dashboard'} — ${t.tabName || ''}`, 40, 40);

    doc.setFontSize(9);
    const cardLine = t.cards.map((c) => `${c.name}: ${c.mainDisplay ?? ''}${c.subDisplay ? ` (${c.subDisplay})` : ''}`).join('    ');
    const cardLines = cardLine ? doc.splitTextToSize(cardLine, 760) : [];
    if (cardLines.length) doc.text(cardLines, 40, 58);

    autoTable(doc, {
      startY: 58 + cardLines.length * 12 + 14,
      head: [t.table.columns],
      body: t.table.rows,
      styles: { fontSize: 7, cellPadding: 3 },
      headStyles: { fillColor: [22, 163, 74] },
    });
  });

  doc.save(`${slug(label)}-${stamp()}.pdf`);
}

function triggerDownload(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
