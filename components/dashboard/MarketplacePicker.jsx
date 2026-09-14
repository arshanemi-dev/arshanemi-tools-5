'use client';

import { ChevronDown, Store } from 'lucide-react';
import Popover from './Popover';

// "Market Place ▾" — picks which published marketplace template drives the
// dashboard, from GET /api/marketplace-templates/live.
export default function MarketplacePicker({ templates = [], activeId, onChange }) {
  const active = templates.find((t) => t.id === activeId) || templates[0];

  return (
    <Popover
      align="left"
      panelClass="min-w-[14rem] max-h-72 overflow-y-auto p-1"
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
          {templates.map((t) => (
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
