'use client';

import { parseAllTabs } from './parseWorkbook';
import { parsePdfTabs } from './parsePdf';

// One entry point for every upload — CSV, TSV, TXT, XLSX, XLS and PDF.
// Always returns the parseAllTabs shape:
//   { fileName, sheetNames, byTab: { name: { headerRow, rows, groupRow,
//     infoRow, headerMeta } }, allHeaders }
export const ACCEPT = '.csv,.tsv,.txt,.xlsx,.xls,.pdf';

export async function readAnyFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf' || file.type === 'application/pdf') {
    return parsePdfTabs(file);
  }
  return parseAllTabs(file); // xlsx / xls / csv / tsv / txt all go through SheetJS
}
