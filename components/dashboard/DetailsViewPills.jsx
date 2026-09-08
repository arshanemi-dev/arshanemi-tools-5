'use client';

import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import Popover from './Popover';
import { SKU_COLUMNS } from '@/data/platforms/canonical';

// "My Details ▾"  "All Details ▾" — pick the active column set for the table.
//  - All Details = every column.
//  - My Details  = the user's saved subset (editable via the checklist here;
//    persisted to /api/profit-loss/settings when signed in).
const TOGGLEABLE = SKU_COLUMNS.filter((c) => !c.sticky);

function Pill({ label, active, count, onClick, children }) {
  return (
    <Popover
      align="left"
      panelClass="min-w-[15rem] max-h-72 overflow-y-auto p-1"
      trigger={() => (
        <button
          type="button"
          onClick={onClick}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            active
              ? 'border-accent bg-accent/5 text-foreground'
              : 'border-divider-light bg-background text-muted hover:border-divider'
          }`}
        >
          <SlidersHorizontal size={12} />
          {label}
          {count != null && <span className="text-subtle">· {count}</span>}
          <ChevronDown size={12} />
        </button>
      )}
    >
      {children}
    </Popover>
  );
}

export default function DetailsViewPills({ mode, onModeChange, myColumns, onMyColumnsChange }) {
  const myShown = SKU_COLUMNS.filter((c) => c.sticky || myColumns.includes(c.key));

  const toggle = (key) => {
    const next = myColumns.includes(key)
      ? myColumns.filter((k) => k !== key)
      : [...myColumns, key];
    onMyColumnsChange(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pill
        label="My Details"
        active={mode === 'my'}
        count={myShown.length}
        onClick={() => onModeChange('my')}
      >
        <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">
          Columns in “My Details”
        </div>
        {TOGGLEABLE.map((c) => (
          <label
            key={c.key}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground hover:bg-card-hover"
          >
            <input
              type="checkbox"
              checked={myColumns.includes(c.key)}
              onChange={() => toggle(c.key)}
              className="accent-[var(--color-action)]"
            />
            {c.label}
          </label>
        ))}
      </Pill>

      <Pill label="All Details" active={mode === 'all'} onClick={() => onModeChange('all')}>
        <div className="px-2 py-2 text-sm text-muted">Shows every metric column.</div>
      </Pill>
    </div>
  );
}
