'use client';

import { useMemo, useState } from 'react';
import { ListSearchBox, matchesSearch, sortByLabel } from './SearchChecklist';
import MyDetailsGroupList, { groupSections } from './MyDetailsGroupList';
import MyDetailsOrderPane from './MyDetailsOrderPane';
import { inSlots } from '@/lib/profitLoss/layoutSections';
import { GENERAL_GROUP_ID } from '@/lib/profitLoss/headerGroups';

// The two sides of My Details, shared by the My Details window
// (MyDetailsModal) and the Position Settings page's Columns section:
//  - left: every header it can show, group by group (MyDetailsGroupList),
//    searchable, A → Z / Z → A within each group, a tick per header and per
//    group, Select all / Clear for what's listed;
//  - right, with `order` (an array): the ticked columns in table order,
//    moved the way Template Settings' lists are (MyDetailsOrderPane).
//    Ticking one puts it where the table would.
// Controlled — the caller keeps the copy being edited: `ticked` (a Set) +
// `onTicked(set)`, `order` (every header id, arranged) + `onOrder(ids)`.
// `headers` = { id, name, groupId }; `keyHeader` = the locked first column.
// It fills the height it's given; each side scrolls on its own.
// `autoFocus` puts the cursor in the search box (the window does).
export default function MyDetailsPanes({ keyHeader = null, headers = [], groups = null, ticked, onTicked, order = null, onOrder, autoFocus = false, className = '' }) {
  const positions = Array.isArray(order);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(null);

  const byId = useMemo(() => new Map(headers.map((h) => [h.id, h])), [headers]);
  const groupName = useMemo(() => (Array.isArray(groups) && groups.length > 1 ? new Map(groups.map((g) => [g.id, g.name])) : null), [groups]);
  const listed = useMemo(() => sortByLabel(headers.filter((h) => matchesSearch(h.name, q)), (h) => h.name, sort), [headers, q, sort]);
  const sections = useMemo(() => groupSections(listed, groups), [listed, groups]);
  const placed = positions ? order.filter((id) => ticked.has(id) && byId.has(id)) : [];

  const setMany = (ids, on) => {
    const next = new Set(ticked);
    for (const id of ids) { if (on) next.add(id); else next.delete(id); }
    onTicked(next);
  };
  const toggle = (id) => setMany([id], !ticked.has(id));
  // A move on the Column order list trades places among the ticked ones
  // only — an unticked header keeps its place for when it's ticked again.
  const move = (from, to) => {
    const next = [...placed];
    const [id] = next.splice(from, 1);
    next.splice(to, 0, id);
    onOrder(inSlots(order, next));
  };

  const searching = q.trim() !== '';
  const listedIds = listed.map((h) => h.id);
  const total = headers.length + (keyHeader ? 1 : 0);
  const shownCount = [...ticked].filter((id) => byId.has(id)).length + (keyHeader ? 1 : 0);
  const paneTitle = 'text-[11px] font-semibold uppercase tracking-wide text-subtle';
  const chip = 'shrink-0 rounded-lg border border-divider-light px-2.5 py-1.5 text-[12px] font-medium text-muted transition-colors hover:bg-card-hover disabled:opacity-40';

  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-4 ${positions ? 'lg:flex-row' : ''} ${className}`}>
      <div className={`flex min-h-0 flex-1 flex-col gap-2 ${positions ? 'lg:flex-[3]' : ''}`}>
        <div className="flex items-center justify-between gap-2">
          <span className={paneTitle}>All headers</span>
          <span className="text-[11px] tabular-nums text-subtle">{shownCount} of {total} shown</span>
        </div>
        {headers.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[12rem] flex-1">
              <ListSearchBox value={q} onChange={setQ} placeholder="Search columns…" label="Search columns" sort={sort} onSort={setSort} autoFocus={autoFocus} />
            </div>
            <button type="button" className={chip} disabled={!listedIds.length || listedIds.every((id) => ticked.has(id))} onClick={() => setMany(listedIds, true)}>
              {searching ? 'Select results' : 'Select all'}
            </button>
            <button type="button" className={chip} disabled={!listedIds.some((id) => ticked.has(id))} onClick={() => setMany(listedIds, false)}>
              {searching ? 'Clear results' : 'Clear all'}
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <MyDetailsGroupList
            sections={sections}
            ticked={ticked}
            onToggle={toggle}
            onSetMany={setMany}
            keyHeader={keyHeader && !positions && matchesSearch(keyHeader.name, q) ? keyHeader : null}
            total={headers.length}
            query={q}
          />
        </div>
      </div>

      {positions && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 border-t border-divider pt-4 lg:flex-[2] lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
          <div className="flex items-center justify-between gap-2">
            <span className={paneTitle}>Column order</span>
            <span className="text-[11px] text-subtle">Drag ⋮⋮ or pick a position</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <MyDetailsOrderPane
              keyHeader={keyHeader}
              items={placed.map((id) => ({ id, name: byId.get(id).name, groupName: groupName?.get(byId.get(id).groupId || GENERAL_GROUP_ID) || null }))}
              onMove={move}
              onRemove={toggle}
            />
          </div>
        </div>
      )}
    </div>
  );
}
