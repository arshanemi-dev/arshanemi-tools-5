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
// It fills the height it's given and each side scrolls on its own — or,
// `fill={false}`, it is as tall as its lists, each scrolling past a height.
// The two sides sit side by side once there is room for both (a container
// query, so a half-width card stacks them).
// `autoFocus` puts the cursor in the search box (the window does). `words`
// = what the items are called (COLUMN_WORDS; Position Settings' other lists
// pass their own — TickOrderList).
export const COLUMN_WORDS = {
  all: 'All headers', order: 'Column order', search: 'Search columns…', searchLabel: 'Search columns',
  none: 'Only one column on this tab.', noMatch: 'No column matches', every: 'every column in',
  empty: 'Tick a column to place it here.', off: 'Take off the table',
};

export default function MyDetailsPanes({ keyHeader = null, headers = [], groups = null, ticked, onTicked, order = null, onOrder, autoFocus = false, fill = true, words: own = null, className = '' }) {
  const positions = Array.isArray(order);
  const words = own ? { ...COLUMN_WORDS, ...own } : COLUMN_WORDS;
  const grow = fill ? 'min-h-0 flex-1' : '';
  const scroll = fill ? 'min-h-0 flex-1 overflow-y-auto pr-1' : 'max-h-[24rem] overflow-y-auto pr-1';
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
    <div className={`@container flex flex-col ${grow} ${className}`}>
    <div className={`flex flex-col gap-4 ${grow} ${positions ? '@3xl:flex-row' : ''}`}>
      <div className={`flex flex-col gap-2 ${grow} ${positions ? '@3xl:flex-[3]' : ''}`}>
        <div className="flex items-center justify-between gap-2">
          <span className={paneTitle}>{words.all}</span>
          <span className="text-[11px] tabular-nums text-subtle">{shownCount} of {total} shown</span>
        </div>
        {headers.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[12rem] flex-1">
              <ListSearchBox value={q} onChange={setQ} placeholder={words.search} label={words.searchLabel} sort={sort} onSort={setSort} autoFocus={autoFocus} />
            </div>
            <button type="button" className={chip} disabled={!listedIds.length || listedIds.every((id) => ticked.has(id))} onClick={() => setMany(listedIds, true)}>
              {searching ? 'Select results' : 'Select all'}
            </button>
            <button type="button" className={chip} disabled={!listedIds.some((id) => ticked.has(id))} onClick={() => setMany(listedIds, false)}>
              {searching ? 'Clear results' : 'Clear all'}
            </button>
          </div>
        )}
        <div className={scroll}>
          <MyDetailsGroupList
            sections={sections}
            ticked={ticked}
            onToggle={toggle}
            onSetMany={setMany}
            keyHeader={keyHeader && !positions && matchesSearch(keyHeader.name, q) ? keyHeader : null}
            total={headers.length}
            query={q}
            words={words}
          />
        </div>
      </div>

      {positions && (
        <div className={`flex flex-col gap-2 border-t border-divider pt-4 ${grow} @3xl:flex-[2] @3xl:border-l @3xl:border-t-0 @3xl:pl-4 @3xl:pt-0`}>
          <div className="flex items-center justify-between gap-2">
            <span className={paneTitle}>{words.order}</span>
            <span className="text-[11px] text-subtle">Drag ⋮⋮ or pick a position</span>
          </div>
          <div className={scroll}>
            <MyDetailsOrderPane
              keyHeader={keyHeader}
              items={placed.map((id) => ({ id, name: byId.get(id).name, groupName: groupName?.get(byId.get(id).groupId || GENERAL_GROUP_ID) || null }))}
              onMove={move}
              onRemove={toggle}
              words={words}
            />
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
