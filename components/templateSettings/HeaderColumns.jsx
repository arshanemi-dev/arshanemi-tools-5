'use client';

const COLS = 4;
const MIN_PER_COL = 20;

// Split a list into 4 columns filled top-to-bottom: each column takes at
// least 20 before the next one starts; past 80 the 4 share them evenly.
export function splitColumns(list) {
  const per = Math.max(MIN_PER_COL, Math.ceil(list.length / COLS));
  return { per, cols: Array.from({ length: COLS }, (_, i) => list.slice(i * per, (i + 1) * per)) };
}

// A file's total extracted headers (every included sheet, de-duped) as a
// numbered 4-column list — nothing hidden behind "+N more". `filled`
// (optional Set of lower-cased names) greys out headers with no values in
// the sample.
export default function HeaderColumns({ headers = [], filled = null, title = 'Extracted headers' }) {
  if (!headers.length) return null;
  const { per, cols } = splitColumns(headers);
  return (
    <div className="rounded-lg border border-divider bg-background p-3">
      <p className="mb-2 text-[12px] font-semibold text-foreground">
        {title} <span className="font-normal text-subtle">· {headers.length} unique, all sheets</span>
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {cols.map((col, ci) => (
          <ol key={ci} className="min-w-0 space-y-0.5">
            {col.map((h, i) => {
              const empty = filled && !filled.has(h.toLowerCase());
              return (
                <li key={h} className="flex min-w-0 items-baseline gap-1.5 text-[11.5px]" title={empty ? `${h} — no values in the first rows of this sample` : h}>
                  <span className="w-6 shrink-0 text-right tabular-nums text-subtle">{ci * per + i + 1}.</span>
                  <span className={`truncate ${empty ? 'text-subtle' : 'text-foreground'}`}>{h}</span>
                </li>
              );
            })}
          </ol>
        ))}
      </div>
    </div>
  );
}
