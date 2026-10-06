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

// A cell that starts with = + - @ is run as a FORMULA when the file is opened
// in Excel / Sheets — and these cells come straight from a marketplace sheet,
// some of them typed by a buyer (a name, an address). A leading apostrophe
// makes the spreadsheet show it as plain text instead. A plain number
// ("-455.76") is left alone so the column still sums.
function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s) && !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s.trim())) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
