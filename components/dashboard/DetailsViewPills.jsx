'use client';

import { Check, ChevronDown, SlidersHorizontal } from 'lucide-react';
import Popover from './Popover';

// "My Details ▾" / "All Details ▾" — pick the active column set for the table.
// Both dropdowns list every header the table can show (`tabHeaders` — on the
// dashboard that's every header of the active version, see tabColumnDefs),
// in table order, the same rows in both:
//  - All Details = all of them, so its list is read-only (each one ticked).
//  - My Details  = the user's saved subset — a checklist (persisted to
//    /api/profit-loss/settings when signed in).
// The first header is always shown in both (it's the row key / sticky
// column), so it's tagged "key" in each list and locked in My Details.
// `size="md"` matches the h-9 controls of DashboardHeaderBar, where the
// dashboard shows these; the default stays compact for the builder preview.
const SIZES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'h-9 px-3 text-sm',
};

function Pill({ label, active, count, onClick, size, children }) {
  return (
    <Popover
      align="left"
      panelClass="min-w-[15rem] max-h-72 overflow-y-auto p-1"
      trigger={() => (
        <button
          type="button"
          onClick={onClick}
          className={`inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors ${SIZES[size] || SIZES.sm} ${
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

const KeyTag = () => <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wide text-subtle">key</span>;

function ListTitle({ children }) {
  return <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">{children}</div>;
}

export default function DetailsViewPills({ mode, onModeChange, tabHeaders = [], myColumns = [], onMyColumnsChange, size = 'sm' }) {
  const keyHeader = tabHeaders[0] || null;
  const toggleable = tabHeaders.slice(1); // keep the first (key) column always
  const myCount = 1 + toggleable.filter((h) => myColumns.includes(h.id)).length;

  const toggle = (id) => {
    const next = myColumns.includes(id) ? myColumns.filter((k) => k !== id) : [...myColumns, id];
    onMyColumnsChange(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pill label="My Details" active={mode === 'my'} count={myCount} onClick={() => onModeChange('my')} size={size}>
        <ListTitle>Columns in “My Details”</ListTitle>
        {keyHeader && (
          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground" title="Row key — always shown">
            <input type="checkbox" checked disabled readOnly className="accent-[var(--color-action)] opacity-60" />
            <span className="min-w-0 truncate">{keyHeader.name}</span>
            <KeyTag />
          </div>
        )}
        {toggleable.length === 0 && <div className="px-2 py-2 text-sm text-muted">Only one column on this tab.</div>}
        {toggleable.map((h) => (
          <label key={h.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground hover:bg-card-hover">
            <input type="checkbox" checked={myColumns.includes(h.id)} onChange={() => toggle(h.id)} className="accent-[var(--color-action)]" />
            {h.name}
          </label>
        ))}
      </Pill>

      <Pill label="All Details" active={mode === 'all'} count={tabHeaders.length} onClick={() => onModeChange('all')} size={size}>
        <ListTitle>Columns in “All Details”</ListTitle>
        {tabHeaders.map((h, i) => (
          <div key={h.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground">
            <Check size={13} className="shrink-0 text-action" />
            <span className="min-w-0 truncate">{h.name}</span>
            {i === 0 && <KeyTag />}
          </div>
        ))}
      </Pill>
    </div>
  );
}
