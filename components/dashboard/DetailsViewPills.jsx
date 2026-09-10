'use client';

import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import Popover from './Popover';

// "My Details ▾" / "All Details ▾" — pick the active column set for the table.
//  - All Details = every header the current tab includes.
//  - My Details  = the user's saved subset (checklist here; persisted to
//    /api/profit-loss/settings when signed in). The first header is always
//    shown (it's the row key / sticky column).
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
            active ? 'border-accent bg-accent/5 text-foreground' : 'border-divider-light bg-background text-muted hover:border-divider'
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

export default function DetailsViewPills({ mode, onModeChange, tabHeaders = [], myColumns = [], onMyColumnsChange }) {
  const toggleable = tabHeaders.slice(1); // keep the first (key) column always
  const myCount = 1 + toggleable.filter((h) => myColumns.includes(h.id)).length;

  const toggle = (id) => {
    const next = myColumns.includes(id) ? myColumns.filter((k) => k !== id) : [...myColumns, id];
    onMyColumnsChange(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pill label="My Details" active={mode === 'my'} count={myCount} onClick={() => onModeChange('my')}>
        <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">Columns in “My Details”</div>
        {toggleable.length === 0 && <div className="px-2 py-2 text-sm text-muted">Only one column on this tab.</div>}
        {toggleable.map((h) => (
          <label key={h.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground hover:bg-card-hover">
            <input type="checkbox" checked={myColumns.includes(h.id)} onChange={() => toggle(h.id)} className="accent-[var(--color-action)]" />
            {h.name}
          </label>
        ))}
      </Pill>

      <Pill label="All Details" active={mode === 'all'} onClick={() => onModeChange('all')}>
        <div className="px-2 py-2 text-sm text-muted">Shows every column on this tab.</div>
      </Pill>
    </div>
  );
}
