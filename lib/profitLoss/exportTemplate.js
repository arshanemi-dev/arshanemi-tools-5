'use client';

// Template-aware dashboard export with visual Title Cards & Vector Graphs in PDF,
// and formatted filename `{tabName}_{YYYY-MM-DD_HH-mm-ss}`.

function slug(s) {
  return String(s || 'dashboard')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function formatTimestamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`;
}

function buildExportFileName(label, activeTabName, ext) {
  const cleanLabel = slug(label);
  const cleanTab = slug(activeTabName);
  const ts = formatTimestamp();

  if (cleanTab && cleanLabel && cleanTab !== cleanLabel && cleanTab !== 'dashboard') {
    return `${cleanLabel}_${cleanTab}_${ts}.${ext}`;
  }
  return `${cleanTab || cleanLabel || 'dashboard'}_${ts}.${ext}`;
}

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

const GRAPH_COLORS = [
  [37, 99, 235],   // Action Blue
  [14, 165, 233],  // Cyan
  [245, 158, 11],  // Amber
  [16, 185, 129],  // Emerald
  [239, 68, 68],   // Red
  [139, 92, 246],  // Purple
];

export async function downloadMultiTabXlsx({ label = 'Dashboard', activeTabName = '', tabs = [] }) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const used = new Set();

  for (const t of tabs) {
    if (t.cards && t.cards.length) {
      const cardSheet = wb.addWorksheet(safeSheetName(`${t.tabName} Summary`, used));
      cardSheet.addRow([`${label || 'Dashboard'} — ${t.tabName || ''}`]);
      cardSheet.addRow([]);
      cardSheet.addRow(['Card Name', 'Main Value', 'Sub Value']);
      for (const c of t.cards) cardSheet.addRow([c.name, c.mainDisplay ?? '', c.subDisplay ?? '']);
      cardSheet.getRow(3).font = { bold: true };
    }

    const grid = wb.addWorksheet(safeSheetName(t.tabName, used));
    grid.addRow(t.table.columns);
    grid.getRow(1).font = { bold: true };
    for (const row of t.table.rows) grid.addRow(row);
    grid.columns.forEach((col) => { col.width = 18; });
  }

  const fileName = buildExportFileName(label, activeTabName || tabs[0]?.tabName, 'xlsx');
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  triggerDownload(blob, fileName);
}

export async function downloadMultiTabPdf({ label = 'Dashboard', activeTabName = '', tabs = [] }) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  tabs.forEach((t, i) => {
    if (i > 0) doc.addPage();
    let currentY = 35;

    // Header Title Banner
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`${label || 'Dashboard'} — ${t.tabName || ''}`, 40, currentY);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    const dateStr = new Date().toLocaleString();
    doc.text(`Generated: ${dateStr} | Total Tab Rows: ${t.table.rows.length}`, pageWidth - 260, currentY);

    currentY += 15;

    // 1. Render Visual Title Cards
    if (t.cards && t.cards.length > 0) {
      currentY = renderTitleCardsInPdf(doc, t.cards, currentY, pageWidth);
    }

    // 2. Render Visual Graphs / Charts
    if (t.graphs && t.graphs.length > 0) {
      currentY = renderGraphsInPdf(doc, t.graphs, currentY, pageWidth);
    }

    // 3. Render Data Table
    autoTable(doc, {
      startY: currentY + 10,
      head: [t.table.columns],
      body: t.table.rows,
      styles: { fontSize: 7, cellPadding: 3, textColor: [30, 41, 59] },
      headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 40, right: 40 },
    });
  });

  const fileName = buildExportFileName(label, activeTabName || tabs[0]?.tabName, 'pdf');
  doc.save(fileName);
}

// Visual Card Renderer in PDF
function renderTitleCardsInPdf(doc, cards, startY, pageWidth) {
  const maxCardsPerRow = 4;
  const paddingLeft = 40;
  const availableWidth = pageWidth - 80;
  const cardWidth = Math.min(170, (availableWidth - (maxCardsPerRow - 1) * 10) / maxCardsPerRow);
  const cardHeight = 44;

  let currentY = startY + 5;
  cards.forEach((card, idx) => {
    const colIdx = idx % maxCardsPerRow;
    if (idx > 0 && colIdx === 0) {
      currentY += cardHeight + 8;
    }
    const x = paddingLeft + colIdx * (cardWidth + 10);

    // Card Box Fill & Border
    doc.setFillColor(245, 247, 251);
    doc.setDrawColor(218, 225, 236);
    doc.roundedRect(x, currentY, cardWidth, cardHeight, 4, 4, 'FD');

    // Title
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(70, 84, 105);
    doc.text(String(card.name || '').slice(0, 22), x + 8, currentY + 12);

    // Main Display Value
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(String(card.mainDisplay ?? '0'), x + 8, currentY + 27);

    // Sub Display Value
    if (card.subDisplay) {
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(String(card.subDisplay), x + 8, currentY + 38);
    }
  });

  const rowCount = Math.ceil(cards.length / maxCardsPerRow);
  return currentY + (rowCount > 1 && cards.length % maxCardsPerRow === 0 ? 0 : cardHeight) + 12;
}

// Visual Graphs Renderer in PDF
function renderGraphsInPdf(doc, graphs, startY, pageWidth) {
  let currentY = startY + 5;
  const paddingLeft = 40;
  const graphWidth = 360;
  const graphHeight = 135;

  graphs.forEach((g, idx) => {
    const isSecondCol = idx % 2 === 1;
    const x = isSecondCol ? paddingLeft + graphWidth + 20 : paddingLeft;
    if (idx > 0 && !isSecondCol) {
      currentY += graphHeight + 12;
    }

    // Graph Outer Box
    doc.setFillColor(252, 253, 255);
    doc.setDrawColor(220, 226, 236);
    doc.roundedRect(x, currentY, graphWidth, graphHeight, 6, 6, 'FD');

    // Graph Title & Type Badge
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(String(g.name || '').slice(0, 32), x + 10, currentY + 15);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(37, 99, 235);
    doc.text(String(g.chartType || 'LINE').toUpperCase(), x + graphWidth - 45, currentY + 15);

    // Render Chart Types
    if (g.chartType === 'pie') {
      renderPieChartInPdf(doc, g.series, x + 10, currentY + 20, graphWidth - 20, graphHeight - 25);
    } else {
      renderTimeChartInPdf(doc, g.chartType, g.series, x + 10, currentY + 20, graphWidth - 20, graphHeight - 25);
    }
  });

  const numRows = Math.ceil(graphs.length / 2);
  return currentY + graphHeight + 14;
}

// Draw Vector TimeChart (Line, Bar, Area) in PDF
function renderTimeChartInPdf(doc, chartType, series, x, y, width, height) {
  const allPoints = series.flatMap((s) => s.points || []);
  if (!allPoints.length) {
    doc.setFontSize(8);
    doc.setTextColor(140, 150, 165);
    doc.text('No graph data available', x + width / 3, y + height / 2);
    return;
  }

  const xKeys = [...new Set(series.flatMap((s) => (s.points || []).map((p) => p.t)))].sort();
  const values = allPoints.map((p) => Number(p.value) || 0);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;

  const padLeft = 30;
  const padBottom = 16;
  const iw = width - padLeft - 10;
  const ih = height - padBottom - 10;

  const getX = (i) => x + padLeft + (xKeys.length === 1 ? iw / 2 : (i / (xKeys.length - 1)) * iw);
  const getY = (v) => y + 10 + ih - ((v - min) / span) * ih;
  const zeroY = getY(0);

  // Y Gridlines
  doc.setDrawColor(235, 240, 248);
  doc.setLineWidth(0.5);
  [0, 0.5, 1].forEach((f) => {
    const gy = y + 10 + ih * f;
    const val = min + span * (1 - f);
    doc.line(x + padLeft, gy, x + width - 10, gy);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 130, 145);
    doc.text(formatCompactNum(val), x + padLeft - 4, gy + 2, { align: 'right' });
  });

  // Series Plots
  series.forEach((s, si) => {
    const color = GRAPH_COLORS[si % GRAPH_COLORS.length];
    doc.setDrawColor(color[0], color[1], color[2]);
    doc.setFillColor(color[0], color[1], color[2]);

    const byT = new Map((s.points || []).map((p) => [p.t, Number(p.value) || 0]));
    const pts = xKeys.map((t, i) => ({ i, t, value: byT.get(t) ?? 0 }));

    if (chartType === 'bar') {
      const bw = Math.max(2, Math.min(14, iw / xKeys.length / series.length - 2));
      pts.forEach((p) => {
        const bx = getX(p.i) + si * (bw + 1);
        const top = Math.min(getY(p.value), zeroY);
        const h = Math.abs(getY(p.value) - zeroY);
        doc.rect(bx, top, bw, Math.max(1, h), 'F');
      });
    } else {
      // Line or Area
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        doc.setLineWidth(1.5);
        doc.line(getX(p1.i), getY(p1.value), getX(p2.i), getY(p2.value));
      }
      pts.forEach((p) => {
        doc.circle(getX(p.i), getY(p.value), 1.5, 'F');
      });
    }
  });

  // X Axis Labels
  doc.setFontSize(6.5);
  doc.setTextColor(120, 130, 145);
  const labelIndices = [0, Math.floor((xKeys.length - 1) / 2), xKeys.length - 1];
  labelIndices.forEach((i) => {
    if (xKeys[i]) {
      doc.text(String(xKeys[i]).slice(5), getX(i), y + height - 2, { align: 'center' });
    }
  });
}

// Draw Vector PieChart in PDF
function renderPieChartInPdf(doc, series, x, y, width, height) {
  const slices = series.map((s) => ({ title: s.title, value: Number(s.value) || 0 }));
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  if (!total) {
    doc.setFontSize(8);
    doc.setTextColor(140, 150, 165);
    doc.text('No pie chart data', x + width / 3, y + height / 2);
    return;
  }

  // Draw Legend List on PDF
  let legendY = y + 15;
  slices.forEach((s, i) => {
    const color = GRAPH_COLORS[i % GRAPH_COLORS.length];
    const pct = Math.round((Math.max(0, s.value) / total) * 100);

    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(x + 15, legendY - 6, 8, 8, 'F');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(50, 60, 75);
    doc.text(String(s.title || '').slice(0, 25), x + 28, legendY);

    doc.setFont('helvetica', 'bold');
    doc.text(`${pct}% (${s.value})`, x + width - 50, legendY);

    legendY += 14;
  });
}

function formatCompactNum(n) {
  const a = Math.abs(n);
  if (a >= 1000) return `${Math.round(n / 100) / 10}k`;
  return `${Math.round(n * 10) / 10}`;
}

function triggerDownload(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
