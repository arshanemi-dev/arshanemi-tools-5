'use client';

import { useState } from 'react';
import { EyeOff } from 'lucide-react';
import Popover from './Popover';
import { ListSearchBox, matchesSearch, sortByLabel } from './SearchChecklist';

// The only way back for an item hidden via ArrangeControl's × — a small
// chip that only exists when something actually is hidden (nothing shows
// otherwise), listing each by name with a one-click Show.
export default function HiddenItemsChip({ hidden = [], onShow }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(null);
  if (!hidden.length) return null;
  const listed = sortByLabel(hidden.filter((it) => matchesSearch(it.name, q)), (it) => it.name, sort);

  return (
    <Popover
      align="left"
      panelClass="min-w-[13rem] max-h-72 overflow-y-auto p-1"
      onOpenChange={(open) => { if (!open) setQ(''); }}
      trigger={() => (
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-divider-light px-2 py-1 text-[11px] font-medium text-subtle hover:border-divider hover:text-muted"
        >
          <EyeOff size={11} /> {hidden.length} hidden
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">Hidden</div>
          <div className="px-1 pb-1">
            <ListSearchBox value={q} onChange={setQ} onEnter={() => { if (listed[0]) { onShow(listed[0].id); close(); } }} placeholder="Search hidden…" label="Search hidden items" sort={sort} onSort={setSort} />
          </div>
          {listed.length === 0 && <p className="px-2 py-2 text-sm text-muted">Nothing matches.</p>}
          {listed.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => { onShow(it.id); close(); }}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-muted hover:bg-card-hover"
            >
              <span className="truncate">{it.name}</span>
              <span className="shrink-0 text-[11px] font-medium text-accent">Show</span>
            </button>
          ))}
        </>
      )}
    </Popover>
  );
}
