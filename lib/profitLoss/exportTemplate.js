'use client';

// Template-aware dashboard export. Takes the resolved view of one tab —
// `cards` [{ name, mainDisplay, subDisplay }] and `table` { columns:[name],
// rows:[[display]] } — and writes an .xlsx (exceljs) or .pdf (jspdf +
// autotable). Both libs are already deps; both are lazy-imported.

function slug(s) {
  return String(s || 'dashboard').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}
const stamp = () => new Date().toISOString().slice(0, 10);

export async function downloadTemplateXlsx({ label, tabName, cards = [], table = { columns: [], rows: [] } }) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();

  const cardSheet = wb.addWorksheet('Summary');
  cardSheet.addRow([`${label || 'Dashboard'} — ${tabName || ''}`]);
  cardSheet.addRow([]);
  cardSheet.addRow(['Card', 'Value', 'Sub']);
  for (const c of cards) cardSheet.addRow([c.name, c.mainDisplay ?? '', c.subDisplay ?? '']);
  cardSheet.getRow(3).font = { bold: true };

  const grid = wb.addWorksheet(tabName || 'Table');
  grid.addRow(table.columns);
  grid.getRow(1).font = { bold: true };
  for (const row of table.rows) grid.addRow(row);
  grid.columns.forEach((col) => { col.width = 16; });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  triggerDownload(blob, `${slug(label)}-${slug(tabName)}-${stamp()}.xlsx`);
}

export async function downloadTemplatePdf({ label, tabName, cards = [], table = { columns: [], rows: [] } }) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(15);
  doc.text(`${label || 'Dashboard'} — ${tabName || ''}`, 40, 40);

  doc.setFontSize(9);
  const cardLine = cards.map((c) => `${c.name}: ${c.mainDisplay ?? ''}${c.subDisplay ? ` (${c.subDisplay})` : ''}`).join('    ');
  doc.text(doc.splitTextToSize(cardLine, 760), 40, 58);

  autoTable(doc, {
    startY: 58 + Math.ceil(cardLine.length / 150) * 12 + 14,
    head: [table.columns],
    body: table.rows,
    styles: { fontSize: 7, cellPadding: 3 },
    headStyles: { fillColor: [22, 163, 74] },
  });

  doc.save(`${slug(label)}-${slug(tabName)}-${stamp()}.pdf`);
}

function triggerDownload(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
