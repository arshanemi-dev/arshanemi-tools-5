'use client';

import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const PAGE_SIZES = [25, 50, 100];

// The "1–25 of N rows" summary + rows-per-page picker + Prev/Next shared by
// DetailsTable and OverviewTreeTable. Renders as the table's own footer bar,
// or — when `slot` (a DOM node) is given — portals into it instead: the
// /profit-loss dashboard hands over a spot in DashboardHeaderBar just before
// "All Companies", so the page limit and row counts sit with the filters.
// Template Settings' live preview passes no slot and keeps the footer.
export default function TablePager({ summary, pageSize, onPageSizeChange, currentPage, pageCount, onPageChange, slot = null }) {
  const select = (
    <select
      value={pageSize}
      onChange={(e) => onPageSizeChange(Number(e.target.value))}
      aria-label="Rows per page"
      className="rounded-lg border border-divider-light bg-background px-1.5 py-1 text-xs text-foreground focus:border-accent focus:outline-none"
    >
      {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / page</option>)}
    </select>
  );
  const nav = (
    <>
      <button
        type="button"
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage <= 1}
        aria-label="Previous page"
        className="rounded-lg border border-divider-light p-1 text-muted transition-colors hover:bg-card-hover disabled:opacity-40"
      >
        <ChevronLeft size={14} />
      </button>
      <span className="tabular-nums text-foreground">Page {currentPage} of {pageCount}</span>
      <button
        type="button"
        onClick={() => onPageChange(Math.min(pageCount, currentPage + 1))}
        disabled={currentPage >= pageCount}
        aria-label="Next page"
        className="rounded-lg border border-divider-light p-1 text-muted transition-colors hover:bg-card-hover disabled:opacity-40"
      >
        <ChevronRight size={14} />
      </button>
    </>
  );

  // Two flex items (summary, then the picker + Prev/Next) so on a narrow
  // header row they wrap independently instead of as one over-wide pill.
  if (slot) {
    return createPortal(
      <>
        <span className="inline-flex h-9 items-center rounded-full bg-card px-3 text-xs text-muted tabular-nums">{summary}</span>
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
      <div className="flex items-center gap-2">
        {select}
        {nav}
      </div>
    </div>
  );
}
