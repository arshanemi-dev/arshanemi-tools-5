'use client';

import { useMemo, useState } from 'react';
import { readHeaderFromRow } from '@/lib/profitLoss/resolveTemplate';

// What DashboardWorkspace's cross-file merge (mergeUploadsAcrossSlots, same
// function, not a re-implementation) would actually produce from whichever
// files are currently open in the debugger — every global header as its
// own column (alphabetical, same as the Template Headers table), against
// the ALREADY-MERGED rows: a Payment file's line items enriched with their
// Order-sheet match (Order Id normalized across files — a trailing "_1"/
// "_2" suffix one sheet has and the other doesn't no longer blocks the
// match), same-slot duplicates dropped. Lets you verify the real merge
// before it ever touches the live dashboard.
export default function SheetDebugMergedPanel({ headers, rows }) {
  const sortedHeaders = useMemo(() => [...headers].sort((a, b) => a.name.localeCompare(b.name)), [headers]);
  const [limit, setLimit] = useState(50);
  const view = rows.slice(0, limit);

  return (
    <div className="space-y-3 rounded-xl border border-divider bg-background p-4">
      <div className="text-[12.5px] font-semibold text-foreground">
        Merged preview — {rows.length} row{rows.length === 1 ? '' : 's'} after combining every open file, the same Order Id / Transaction Id rule the live dashboard uses
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg bg-card px-3 py-6 text-center text-[12px] text-subtle">
          Nothing to merge yet — open at least two files (each with a parsed sheet selected) and map Order Id for both.
        </p>
      ) : (
        <>
          <div className="max-h-[28rem] overflow-auto rounded-lg border border-divider">
            <table className="w-full min-w-max text-[11.5px]">
              <thead className="sticky top-0 bg-th">
                <tr>
                  <th className="border-b border-divider px-2 py-1.5 text-left font-medium text-subtle">#</th>
                  {sortedHeaders.map((h) => (
                    <th key={h.id} className="border-b border-divider px-2 py-1.5 text-left font-medium text-muted whitespace-nowrap">{h.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.map((r, ri) => (
                  <tr key={ri} className="border-t border-divider hover:bg-card-hover">
                    <td className="px-2 py-1.5 text-subtle">{ri + 1}</td>
                    {sortedHeaders.map((h) => {
                      const v = readHeaderFromRow(h, r);
                      return <td key={h.id} className="whitespace-nowrap px-2 py-1.5 text-foreground">{v == null ? '' : String(v)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > view.length && (
            <button type="button" onClick={() => setLimit((n) => n + 100)} className="text-[11.5px] font-medium text-action hover:underline">
              Show 100 more rows ({view.length} of {rows.length} shown)
            </button>
          )}
        </>
      )}
    </div>
  );
}
