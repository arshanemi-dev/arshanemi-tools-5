'use client';

import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ChevronsLeft } from 'lucide-react';

export const PAGE_SIZES = [25, 50, 100];
export const DEFAULT_PAGE_SIZE = 100; // what a table opens at — one of PAGE_SIZES

const NAV_BTN = 'inline-flex items-center gap-1 rounded-lg border border-divider-light px-2 py-1 font-medium text-muted transition-colors hover:bg-card-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-40';

// The "1–25 of N rows" summary + rows-per-page picker + First / Previous /
// Next shared by DetailsTable and OverviewTreeTable. Renders as the table's
// own footer bar — summary on the left, the picker + buttons at the bottom
// right — or, when
// `slot` (a DOM node) is given, portals into it instead. Nothing passes a
// slot right now; the dashboard and Template Settings' preview both use the
// footer.
export default function TablePager({ summary, pageSize, onPageSizeChange, currentPage, pageCount, onPageChange, slot = null }) {
  const select = (
    <select
      value={pageSize}
      onChange={(e) => onPageSizeChange(Number(e.target.value))}
      aria-label="Rows per page"
      className="rounded-lg border border-divider-light bg-background px-1.5 py-1 text-xs text-foreground focus:border-accent focus:outline-none hidden"
    >
      {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / page</option>)}
    </select>
  );
  const nav = (
    <>
      <button type="button" onClick={() => onPageChange(1)} disabled={currentPage <= 1} title="First page" className={NAV_BTN}>
        <ChevronsLeft size={14} /> First
      </button>
      <button type="button" onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage <= 1} title="Previous page" className={NAV_BTN}>
        <ChevronLeft size={14} /> Previous
      </button>
      <span className="tabular-nums text-foreground">Page {currentPage} of {pageCount}</span>
      <button type="button" onClick={() => onPageChange(Math.min(pageCount, currentPage + 1))} disabled={currentPage >= pageCount} title="Next page" className={NAV_BTN}>
        Next <ChevronRight size={14} />
      </button>
    </>
  );

  // Two flex items (summary, then the picker + Prev/Next) so on a narrow
  // header row they wrap independently instead of as one over-wide pill.
  if (slot) {
    return createPortal(
      <>
        {/* <span className="inline-flex h-9 items-center rounded-full bg-card px-3 text-xs text-muted tabular-nums">{summary}</span> */}
        <div className="inline-flex h-9 items-center gap-2 rounded-full border border-divider-light bg-background px-1.5 text-xs">
          {select}
          {nav}
        </div>
      </>,
      slot,
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider px-3 py-2 text-xs text-subtle">
      <span>{summary}</span>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {select}
        {nav}
      </div>
    </div>
  );
}
