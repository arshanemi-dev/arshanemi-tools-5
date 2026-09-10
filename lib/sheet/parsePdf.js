'use client';

// Best-effort table extraction from a PDF. PDFs have no real table structure —
// we cluster text by vertical position into lines, infer columns from the
// header line's x-positions, and bin every later line's tokens into those
// columns. Good enough for most marketplace statement PDFs; the result always
// lands in the Raw rows view even if the P&L mapper can't use it.
export async function parsePdfTabs(file) {
  const pdfjs = await import('pdfjs-dist');
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  } catch {
    /* already set */
  }

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;

  const lines = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      lines.push(...groupIntoLines(tc.items));
    }
  } finally {
    await doc.destroy();
  }

  if (lines.length === 0) throw new Error('No selectable text in this PDF (it may be a scan).');

  const headerLineIdx = pickHeaderLine(lines);
  if (headerLineIdx === -1) throw new Error('Could not find a table header in this PDF.');

  const header = lines[headerLineIdx];
  const bounds = columnBounds(header.tokens);
  const headerRow = header.tokens.map((t) => t.str.trim()).filter(Boolean);

  const rows = [];
  for (let i = headerLineIdx + 1; i < lines.length; i++) {
    const cells = new Array(bounds.length).fill('');
    for (const tok of lines[i].tokens) {
      const col = colIndex(tok.xCenter, bounds);
      cells[col] = (cells[col] ? cells[col] + ' ' : '') + tok.str.trim();
    }
    const filled = cells.filter(Boolean).length;
    if (filled < 2) continue; // page header/footer noise
    const obj = {};
    headerRow.forEach((h, c) => { if (h) obj[h] = cells[c] ?? ''; });
    rows.push(obj);
  }

  if (rows.length === 0) throw new Error('Found a header but no data rows in this PDF.');

  const sheet = { headerRow, rows, groupRow: [], infoRow: [], headerMeta: {}, skip: false };
  return {
    fileName: file.name,
    sheetNames: ['PDF'],
    allSheetNames: ['PDF'],
    byTab: { PDF: sheet },
    allHeaders: headerRow,
  };
}

function groupIntoLines(items) {
  const rows = [];
  const TOL = 3;
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    const tok = { str: it.str, x, xCenter: x + (it.width || 0) / 2 };
    let line = rows.find((r) => Math.abs(r.y - y) <= TOL);
    if (!line) {
      line = { y, tokens: [] };
      rows.push(line);
    }
    line.tokens.push(tok);
  }
  rows.sort((a, b) => b.y - a.y); // top-to-bottom
  for (const r of rows) r.tokens.sort((a, b) => a.x - b.x);
  return rows;
}

// The header is the first line whose token count roughly matches the next
// couple of lines (a real table row), and has >= 2 tokens.
function pickHeaderLine(lines) {
  for (let i = 0; i < lines.length - 1; i++) {
    const n = lines[i].tokens.length;
    if (n < 2) continue;
    const near = lines.slice(i + 1, i + 4).filter((l) => Math.abs(l.tokens.length - n) <= 2).length;
    if (near >= 1) return i;
  }
  return lines.findIndex((l) => l.tokens.length >= 2);
}

function columnBounds(tokens) {
  // one bound per header token; boundary = midpoint between adjacent centers
  const centers = tokens.map((t) => t.xCenter);
  const bounds = [];
  for (let i = 0; i < centers.length; i++) {
    const lo = i === 0 ? -Infinity : (centers[i - 1] + centers[i]) / 2;
    const hi = i === centers.length - 1 ? Infinity : (centers[i] + centers[i + 1]) / 2;
    bounds.push([lo, hi]);
  }
  return bounds;
}

function colIndex(x, bounds) {
  for (let i = 0; i < bounds.length; i++) {
    if (x >= bounds[i][0] && x < bounds[i][1]) return i;
  }
  return bounds.length - 1;
}
