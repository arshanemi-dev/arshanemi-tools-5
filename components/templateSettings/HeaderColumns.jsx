'use client';

import { FileSpreadsheet } from 'lucide-react';

const COLS = 4;
const MIN_PER_COL = 20;

// Split a list into 4 columns filled top-to-bottom: each column takes at
// least 20 before the next one starts; past 80 the 4 share them evenly.
export function splitColumns(list) {
  const per = Math.max(MIN_PER_COL, Math.ceil(list.length / COLS));
  return { per, cols: Array.from({ length: COLS }, (_, i) => list.slice(i * per, (i + 1) * per)) };
}

// One sheet's headers as a numbered 4-column list. `filled` (optional Set
// of lower-cased names) greys out headers with no values in the sample.
function NumberedList({ headers, filled }) {
  const { per, cols } = splitColumns(headers);
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
      {cols.map((col, ci) => (
        <ol key={ci} className="min-w-0 space-y-0.5">
          {col.map((h, i) => {
            const empty = filled && !filled.has(h.toLowerCase());
            return (
              <li key={`${ci}:${i}`} className="flex min-w-0 items-baseline gap-1.5 text-[11.5px]" title={empty ? `${h} — no values in the first rows of this sample` : h}>
                <span className="w-6 shrink-0 text-right tabular-nums text-subtle">{ci * per + i + 1}.</span>
                <span className={`truncate ${empty ? 'text-subtle' : 'text-foreground'}`}>{h}</span>
              </li>
            );
          })}
        </ol>
      ))}
    </div>
  );
}

// A file's extracted headers SHEET BY SHEET — `sheets` = [{ name, headers,
// filled? }], each under its own "File › Sheet" heading (`file` = the
// file's label, the same path the Header section's matrix shows) with its
// own numbered list and every header it has: nothing is de-duplicated
// across sheets (an "Amount" in two sheets is listed under both), nothing
// hidden behind "+N more". A file saved before sheets existed passes one
// sheet with `name` null — headed by the file alone.
export default function HeaderColumns({ sheets = [], file = 'File', title = 'Extracted headers' }) {
  const shown = sheets.filter((s) => s.headers?.length);
  const total = shown.reduce((n, s) => n + s.headers.length, 0);
  if (!total) return null;
  const named = shown.some((s) => s.name != null);
  return (
    <div className="space-y-3 rounded-lg border border-divider bg-background p-3">
      <p className="text-[12px] font-semibold text-foreground">
        {title}{' '}
        <span className="font-normal text-subtle">
          · {total} header{total === 1 ? '' : 's'}{named ? ` in ${shown.length} sheet${shown.length === 1 ? '' : 's'} — File › Sheet › Headers` : ''}
        </span>
      </p>
      {shown.map((s, i) => (
        <div key={s.name ?? `sheet-${i}`} className={i ? 'border-t border-divider pt-3' : ''}>
          <p className="mb-1.5 flex min-w-0 items-center gap-1.5 text-[11.5px]" title={s.name != null ? `${file} › ${s.name}` : file}>
            <FileSpreadsheet size={12} className="shrink-0 text-subtle" />
            <span className="min-w-0 truncate">
              <span className="text-muted">{file}</span>
              {s.name != null && <> <span className="text-subtle">›</span> <span className="font-semibold text-foreground" data-sheet>{s.name}</span></>}
            </span>
            <span className="shrink-0 text-subtle">· {s.headers.length} header{s.headers.length === 1 ? '' : 's'}</span>
          </p>
          <NumberedList headers={s.headers} filled={s.filled || null} />
        </div>
      ))}
    </div>
  );
}
