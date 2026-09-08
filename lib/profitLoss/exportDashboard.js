'use client';

import { downloadDashboardXlsx } from '@/lib/sheet/skuCostTemplate';

export { downloadDashboardXlsx };

// PDF export — jspdf + autotable (both already deps). Lazy-imported so the
// ~200KB pair never lands in the main bundle.
export async function downloadDashboardPdf({ summary, skuRows, columns, label }) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(16);
  doc.text(`Profit & Loss — ${label || 'Dashboard'}`, 40, 40);

  const S = summary;
  doc.setFontSize(10);
  const kpiLine = [
    `Order ${S.order.count} / ₹${S.order.value}`,
    `Return ${S.return.count} / ₹${S.return.value}`,
    `Canceled ${S.canceled.count}`,
    `RTO ${S.rto.count}`,
    `Ads ${S.ads.pct}% / ₹${S.ads.value}`,
    `P/L ₹${S.profitLoss.value}`,
    `COGS ₹${S.cogs.value}`,
  ].join('    ');
  doc.text(kpiLine, 40, 60);

  autoTable(doc, {
    startY: 78,
    head: [columns.map((c) => c.label)],
    body: skuRows.map((r) => columns.map((c) => r[c.key])),
    styles: { fontSize: 7, cellPadding: 3 },
    headStyles: { fillColor: [22, 163, 74] },
  });

  const slug = (label || 'profit-loss').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  doc.save(`${slug}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
