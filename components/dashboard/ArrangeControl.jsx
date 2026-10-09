'use client';

import { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import Popover from './Popover';
import { ListSearchBox, matchesSearch, sortByLabel } from './SearchChecklist';

// Inline per-item edit-mode control, rendered on the item itself (a tab row,
// a title card, a graph panel, a table column header). The chevron opens a
// dropdown listing every OTHER item in this section — currently-shown ones
// first, hidden ones after (marked "hidden") — and picking one swaps this
// item's position with it. If the picked item was already shown, it's a
// plain reorder; if it was hidden, this item takes its hidden spot and the
// picked one is revealed here instead — one action covers both. The corner
// × still hides this item outright, independent of any swap.
export default function ArrangeControl({ currentId, items = [], hiddenIds = [], onSwapWith, onHide, className = '' }) {
  const others = items.filter((it) => it.id !== currentId);
  const shown = others.filter((it) => !hiddenIds.includes(it.id));
  const hidden = others.filter((it) => hiddenIds.includes(it.id));
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(null);
  const ordered = sortByLabel([...shown, ...hidden].filter((it) => matchesSearch(it.name, q)), (it) => it.name, sort);
  const any = others.length > 0;

  return (
    <span className={`inline-flex shrink-0 items-center gap-0.5 ${className}`}>
      {any && (
        <Popover
          align="right"
          panelClass="min-w-[13rem] max-h-72 overflow-y-auto p-1 text-left font-normal"
          onOpenChange={(open) => { if (!open) setQ(''); }}
          trigger={() => (
            <button
              type="button"
              className="rounded p-0.5 text-subtle hover:bg-card-hover hover:text-foreground"
              title="Swap with…"
            >
              <ChevronDown size={12} />
            </button>
          )}
        >
          {(close) => (
            <>
              <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">Swap with</div>
              <div className="px-1 pb-1" onClick={(e) => e.stopPropagation()}>
                <ListSearchBox value={q} onChange={setQ} onEnter={() => { if (ordered[0]) { onSwapWith(ordered[0].id); close(); } }} placeholder="Search…" label="Search items to swap with" sort={sort} onSort={setSort} />
              </div>
              {ordered.length === 0 && <p className="px-2 py-2 text-sm text-muted">Nothing matches.</p>}
              {ordered.map((it) => {
                const isHidden = hiddenIds.includes(it.id);
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSwapWith(it.id); close(); }}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-foreground hover:bg-card-hover"
                  >
                    <span className={`truncate ${isHidden ? 'text-subtle' : ''}`}>{it.name}</span>
                    {isHidden && <span className="shrink-0 text-[10px] uppercase tracking-wide text-subtle">hidden</span>}
                  </button>
                );
              })}
            </>
          )}
        </Popover>
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onHide(); }}
        className="rounded p-0.5 text-subtle hover:bg-red-500/10 hover:text-red-500"
        title="Hide"
        aria-label="Hide"
      >
        <X size={12} />
      </button>
    </span>
  );
}
