'use client';

import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import Popover from './Popover';
import { myDetailColumns } from '@/lib/profitLoss/tabColumns';

// "My Details ▾" — the column set the table shows. Its dropdown is a
// checklist of every header the table can show (`tabHeaders` — on the
// dashboard that's every header of the active version, see tabColumnDefs),
// in table order; the ticked ones are the user's own ticks for this tab
// (`myColumns` — persisted to /api/profit-loss/settings when signed in).
// Until they tick something, it's the tab's default (`defaultIds` — the
// headers the template picked for this tab; see myDetailColumns), which is
// also what Reset Position brings back.
// The first header is always shown (it's the row key / sticky column — on an
// Overview tab, its hierarchy), so it's tagged "key" and locked.
// `emptyShowsAll={false}` (Overview tabs) — with no ticks and no default,
// nothing is ticked, instead of everything.
// `size="md"` matches the h-9 controls of DashboardHeaderBar, where the
// dashboard shows this; the default stays compact for the builder preview.
const SIZES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'h-9 px-3 text-sm',
};

const KeyTag = () => <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wide text-subtle">key</span>;

function ListTitle({ children }) {
  return <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">{children}</div>;
}

export default function DetailsViewPills({ tabHeaders = [], myColumns = [], defaultIds = [], emptyShowsAll = true, onMyColumnsChange, size = 'sm' }) {
  const keyHeader = tabHeaders[0] || null;
  const toggleable = tabHeaders.slice(1); // keep the first (key) column always
  const shown = new Set(myDetailColumns(toggleable, myColumns, defaultIds, emptyShowsAll ? toggleable : []).map((h) => h.id));
  const ownTicks = toggleable.some((h) => myColumns.includes(h.id));

  // Until the user has ticks of their own here, the default is what's
  // showing — so the first tick / untick starts from that, not from nothing.
  const toggle = (id) => {
    const picked = ownTicks ? myColumns : [...shown];
    onMyColumnsChange(picked.includes(id) ? picked.filter((k) => k !== id) : [...picked, id]);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover
        align="left"
        panelClass="min-w-[15rem] max-h-72 overflow-y-auto p-1"
        trigger={() => (
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent/5 font-medium text-foreground transition-colors ${SIZES[size] || SIZES.sm}`}
          >
            <SlidersHorizontal size={12} />
            My Details
            <span className="text-subtle">· {1 + shown.size}</span>
            <ChevronDown size={12} />
          </button>
        )}
      >
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
            <input type="checkbox" checked={shown.has(h.id)} onChange={() => toggle(h.id)} className="accent-[var(--color-action)]" />
            {h.name}
          </label>
        ))}
      </Popover>
    </div>
  );
}
