'use client';

import { EyeOff } from 'lucide-react';
import Popover from './Popover';

// The only way back for an item hidden via ArrangeControl's × — a small
// chip that only exists when something actually is hidden (nothing shows
// otherwise), listing each by name with a one-click Show.
export default function HiddenItemsChip({ hidden = [], onShow }) {
  if (!hidden.length) return null;

  return (
    <Popover
      align="left"
      panelClass="min-w-[12rem] max-h-60 overflow-y-auto p-1"
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
          {hidden.map((it) => (
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
