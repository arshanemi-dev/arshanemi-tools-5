'use client';

import { Check, ChevronDown, Store } from 'lucide-react';
import Popover from './Popover';
import { PLATFORMS } from '@/data/platforms/detect';

// "Market Place ▾" — the platform tag applied to the NEXT sheet you upload.
// `detectedId` (if any) shows an "auto-detected" hint chip.
export default function MarketplacePicker({ value, detectedId, onChange }) {
  const selected = PLATFORMS.find((p) => p.id === value);
  const label = selected ? selected.label : 'Market Place';

  return (
    <Popover
      align="left"
      trigger={(open) => (
        <button
          type="button"
          className={`inline-flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors ${
            open ? 'border-accent' : 'border-divider-light hover:border-divider'
          }`}
        >
          <Store size={15} className="text-muted" />
          {label}
          {detectedId && detectedId !== 'manual' && (
            <span className="ml-0.5 rounded-full bg-action-soft px-1.5 py-0.5 text-[10px] font-semibold text-action">
              auto
            </span>
          )}
          <ChevronDown size={15} className="text-muted" />
        </button>
      )}
    >
      {(close) => (
        <div className="py-0.5">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onChange(p.id);
                close();
              }}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-card-hover"
            >
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                {p.label}
              </span>
              {value === p.id && <Check size={14} className="text-action" />}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
