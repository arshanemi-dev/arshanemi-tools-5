'use client';

import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import MyDetailsModal from './MyDetailsModal';
import { myDetailColumns } from '@/lib/profitLoss/tabColumns';

// "My Details" — the column set the table shows. The pill opens the My
// Details window (MyDetailsModal): every header the table can show
// (`tabHeaders` — on the dashboard that's every header of the active
// version, see tabColumnDefs), group by group, each a tick; the ticked ones
// are the user's own ticks for this tab (`myColumns` — persisted to
// /api/profit-loss/settings when signed in). Until they tick something, it's
// the tab's default (`defaultIds` — the headers the template picked for this
// tab; see myDetailColumns), which is also what Reset Position brings back.
// The first header is always shown (it's the row key / sticky column — on an
// Overview tab, its hierarchy), so it's locked.
// `emptyShowsAll={false}` (Overview tabs) — with no ticks and no default,
// nothing is ticked, instead of everything.
// The list offers every header the table can show — every one NOT switched
// to Hidden (Template Settings › Header's Show / Hide switch; tabColumns.js
// leaves hidden ones out of `tabHeaders`), picked by a tab or not.
// `groups` (the config's headerGroups — Template Settings › Header › Our
// Groups, in order) sorts the list into its groups (every header carries
// its `groupId` — effectiveConfig.js); search and the A → Z order apply
// within each group.
//
// Position Settings on (`onReorder` passed — the toolbar's Position toggle):
// the window also has a Column order list to move the ticked columns with —
// drag, "Position N", ↑ / ↓ — like Template Settings' lists. `orderIds` =
// the ids that list arranges, in their current order (default: the table
// order of `tabHeaders`). `onReorder(ids)` gets them all in their new order;
// like every edit-mode change it's kept once Save Position is pressed.
// `size="md"` matches the h-9 buttons of DashboardToolbar, where the
// dashboard shows this (Position Settings on, after Reset Position); the
// default stays compact for the builder preview.
const SIZES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'h-9 px-3 text-sm',
};

export default function DetailsViewPills({ tabHeaders = [], myColumns = [], defaultIds = [], emptyShowsAll = true, onMyColumnsChange, onReorder = null, orderIds = null, size = 'sm', groups = null }) {
  const [open, setOpen] = useState(false);
  const keyHeader = tabHeaders[0] || null;
  const toggleable = tabHeaders.slice(1); // keep the first (key) column always
  const fallback = emptyShowsAll ? toggleable : [];
  const shown = myDetailColumns(toggleable, myColumns, defaultIds, fallback).map((h) => h.id);
  const tabDefault = myDetailColumns(toggleable, [], defaultIds, fallback).map((h) => h.id);
  const ownTicks = toggleable.some((h) => myColumns.includes(h.id));

  // A tick this list can't show (a column hidden in edit mode, say) stays
  // ticked — only the ones the window offered are replaced.
  const apply = ({ ticks, order }) => {
    if (ticks) {
      const offered = new Set(toggleable.map((h) => h.id));
      const kept = ownTicks ? myColumns.filter((id) => !offered.has(id)) : [];
      onMyColumnsChange([...kept, ...ticks]);
    }
    if (order && onReorder) onReorder(order);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        title={onReorder ? 'Pick the columns this tab shows and put them in order' : 'Pick the columns this tab shows'}
        className={`inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent/5 font-medium text-foreground transition-colors hover:bg-accent/10 ${SIZES[size] || SIZES.sm}`}
      >
        <SlidersHorizontal size={12} />
        My Details
        <span className="text-subtle">· {(keyHeader ? 1 : 0) + shown.length}</span>
      </button>
      <MyDetailsModal
        open={open}
        onClose={() => setOpen(false)}
        keyHeader={keyHeader}
        headers={toggleable}
        shownIds={shown}
        defaultIds={tabDefault}
        orderIds={onReorder ? (orderIds || toggleable.map((h) => h.id)) : null}
        groups={groups}
        onApply={apply}
      />
    </div>
  );
}
