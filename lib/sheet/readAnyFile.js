'use client';


// One entry point for every upload — CSV, TSV, TXT, XLSX, XLS and PDF.
// Always returns the parseAllTabs shape:
//   { fileName, sheetNames, byTab: { name: { headerRow, rows, groupRow,
//     infoRow, headerMeta } }, allHeaders }
// `override` (see lib/sheet/rowOverride.js) only applies to the
// spreadsheet/CSV path — PDF export layouts aren't row-indexed the same way.
export const ACCEPT = '.csv,.tsv,.txt,.xlsx,.xls,.pdf';

export async function readAnyFile(file, override) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf' || file.type === 'application/pdf') {
    const { parsePdfTabs } = await import('./parsePdf');
    return parsePdfTabs(file);
  }
  const { parseAllTabs } = await import('./parseWorkbook');
  return parseAllTabs(file, override); // xlsx / xls / csv / tsv / txt all go through SheetJS
}
