'use client';

// Download the full combined raw sheet data (every row of every uploaded tab,
// every original header) as a CSV — nothing dropped, nothing aggregated.
export function downloadRawCsv(headers, rows, metaLabels = {}, filename) {
  const head = headers.map((h) => csvCell(metaLabels[h] ?? h)).join(',');
  const body = rows
    .map((r) => headers.map((h) => csvCell(r[h] ?? '')).join(','))
    .join('\r\n');
  const blob = new Blob(['﻿' + head + '\r\n' + body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `raw-rows-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
