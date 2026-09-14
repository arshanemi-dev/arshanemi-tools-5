'use client';

import { ChevronDown } from 'lucide-react';
import Popover from './Popover';

// One dropdown value filter — e.g. "All Companies ▾" in the header bar,
// listing the distinct "MarketPlace_Brand" combos tagged onto the loaded
// rows (see resolveTemplate's companyOptions). `value` is 'all' or one of
// `options`. Disabled (greyed) when there's no data loaded yet.
export default function ValueFilter({ label, allLabel = `All ${label}`, options = [], value = 'all', onChange, align = 'left' }) {
  const disabled = !options.length;
  const current = value === 'all' ? allLabel : value;

  return (
    <Popover
      align={align}
      panelClass="min-w-[13rem] max-h-72 overflow-y-auto p-1"
      trigger={() => (
        <button
          type="button"
          disabled={disabled}
          title={disabled ? `${label}: no values in the loaded data` : label}
          className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors ${
            value !== 'all'
              ? 'border-accent bg-accent/5 text-foreground'
              : 'border-divider-light bg-background text-muted hover:border-divider'
          } disabled:opacity-45`}
        >
          <span className="max-w-[9rem] truncate">{current}</span>
          <ChevronDown size={13} className="shrink-0" />
        </button>
      )}
    >
      {(close) => (
        <>
          <button
            type="button"
            onClick={() => { onChange('all'); close(); }}
            className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-card-hover ${value === 'all' ? 'font-semibold text-foreground' : 'text-muted'}`}
          >
            {allLabel}
          </button>
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); close(); }}
              className={`block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-card-hover ${value === opt ? 'font-semibold text-foreground' : 'text-muted'}`}
            >
              {opt}
            </button>
          ))}
        </>
      )}
    </Popover>
  );
}
