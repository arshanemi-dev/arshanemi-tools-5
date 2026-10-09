'use client';

import { useState } from 'react';
import { ChevronDown, Store } from 'lucide-react';
import Popover from './Popover';
import { ListSearchBox, matchesSearch, sortByLabel } from './SearchChecklist';

// "Market Place ▾" — picks which published marketplace template drives the
// dashboard, from GET /api/marketplace-templates/live.
export default function MarketplacePicker({ templates = [], activeId, onChange }) {
  const active = templates.find((t) => t.id === activeId) || templates[0];
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(null);
  const listed = sortByLabel(templates.filter((t) => matchesSearch(t.marketplaceName, q)), (t) => t.marketplaceName, sort);

  return (
    <Popover
      align="left"
      panelClass="min-w-[14rem] max-h-80 overflow-y-auto p-1"
      onOpenChange={(open) => { if (!open) setQ(''); }}
      trigger={() => (
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-action px-3 text-sm font-semibold text-white transition-colors hover:bg-action-hover"
        >
          <Store size={15} className="shrink-0" />
          <span className="max-w-[10rem] truncate">{active?.marketplaceName || 'Market Place'}</span>
          <ChevronDown size={13} className="shrink-0" />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="pb-1">
            <ListSearchBox value={q} onChange={setQ} onEnter={() => { if (listed[0]) { onChange(listed[0].id); close(); } }} placeholder="Search market places…" label="Search market places" sort={sort} onSort={setSort} />
          </div>
          {listed.length === 0 && <p className="px-2.5 py-2 text-xs text-subtle">No market place matches.</p>}
          {listed.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { onChange(t.id); close(); }}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-card-hover ${
                t.id === active?.id ? 'font-semibold text-foreground' : 'text-muted'
              }`}
            >
              <span className="truncate">{t.marketplaceName}</span>
            </button>
          ))}
        </>
      )}
    </Popover>
  );
}
