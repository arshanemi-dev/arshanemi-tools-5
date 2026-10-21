'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { ListSearchBox, matchesSearch, sortByLabel } from './SearchChecklist';
import MyDetailsGroupList, { groupSections } from './MyDetailsGroupList';
import MyDetailsOrderPane from './MyDetailsOrderPane';
import { inSlots } from '@/lib/profitLoss/layoutSections';
import { GENERAL_GROUP_ID } from '@/lib/profitLoss/headerGroups';

// The My Details window (DetailsViewPills opens it): which columns a tab's
// table shows — and, while Position Settings is on, in what order.
//  - Left: every header it can show, group by group (MyDetailsGroupList),
//    searchable, A → Z / Z → A within each group, a tick per header and per
//    group, Select all / Clear for what's listed.
//  - Right, only with `orderIds` (Position Settings on): the ticked columns
//    in table order, moved the way Template Settings' lists are
//    (MyDetailsOrderPane). Ticking one puts it where the table would.
// Works on a copy: nothing changes until Apply (Cancel / × / Escape / a
// click outside drop it). `onApply({ ticks, order })` — `ticks` = the ticked
// header ids, `order` = every id of `orderIds` in its new order; each is null
// when it didn't change. Mounted only while open, so each open starts fresh.
//
// `headers` = the toggleable columns ({ id, name, groupId }, table order);
// `keyHeader` = the locked first column; `shownIds` = what shows now;
// `defaultIds` = what the tab shows by default (the "Tab default" button);
// `orderIds` = the ids Column order arranges, in their current order.
export default function MyDetailsModal({ open, ...props }) {
  if (!open || typeof document === 'undefined') return null;
  return createPortal(<MyDetailsWindow {...props} />, document.body);
}

const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

function MyDetailsWindow({ keyHeader = null, headers = [], shownIds = [], defaultIds = [], orderIds = null, groups = null, onApply, onClose }) {
  const positions = Array.isArray(orderIds);
  const [start] = useState(() => ({ ticks: new Set(shownIds), order: positions ? orderIds.join('\n') : '' }));
  const [ticked, setTicked] = useState(() => new Set(shownIds));
  const [order, setOrder] = useState(() => (positions ? [...orderIds] : []));
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const byId = useMemo(() => new Map(headers.map((h) => [h.id, h])), [headers]);
  const groupName = useMemo(() => (Array.isArray(groups) && groups.length > 1 ? new Map(groups.map((g) => [g.id, g.name])) : null), [groups]);
  const listed = useMemo(() => sortByLabel(headers.filter((h) => matchesSearch(h.name, q)), (h) => h.name, sort), [headers, q, sort]);
  const sections = useMemo(() => groupSections(listed, groups), [listed, groups]);
  const placed = positions ? order.filter((id) => ticked.has(id) && byId.has(id)) : [];

  const setMany = (ids, on) => setTicked((prev) => {
    const next = new Set(prev);
    for (const id of ids) { if (on) next.add(id); else next.delete(id); }
    return next;
  });
  const toggle = (id) => setTicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  // A move on the Column order list trades places among the ticked ones
  // only — an unticked header keeps its place for when it's ticked again.
  const move = (from, to) => {
    const next = [...placed];
    const [id] = next.splice(from, 1);
    next.splice(to, 0, id);
    setOrder((prev) => inSlots(prev, next));
  };

  const searching = q.trim() !== '';
  const listedIds = listed.map((h) => h.id);
  const ticksChanged = !sameSet(ticked, start.ticks);
  const orderChanged = positions && order.join('\n') !== start.order;
  const canApply = (!ticksChanged && !orderChanged) || ticked.size > 0;
  const atDefault = sameSet(ticked, new Set(defaultIds));

  const apply = () => {
    if (!canApply) return;
    onApply({
      ticks: ticksChanged ? headers.map((h) => h.id).filter((id) => ticked.has(id)) : null,
      order: orderChanged ? order : null,
    });
    onClose();
  };

  const total = headers.length + (keyHeader ? 1 : 0);
  const shownCount = ticked.size + (keyHeader ? 1 : 0);
  const paneTitle = 'text-[11px] font-semibold uppercase tracking-wide text-subtle';
  const chip = 'shrink-0 rounded-lg border border-divider-light px-2.5 py-1.5 text-[12px] font-medium text-muted transition-colors hover:bg-card-hover disabled:opacity-40';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="my-details-title"
        className={`flex w-full flex-col rounded-2xl border border-divider bg-card shadow-2xl ${
          positions ? 'h-[92vh] max-w-6xl lg:h-[82vh]' : 'max-h-[90vh] max-w-4xl'
        }`}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-divider px-5 py-4">
          <span className="mt-0.5 rounded-lg bg-accent/10 p-2 text-accent"><SlidersHorizontal size={16} /></span>
          <div className="min-w-0 flex-1">
            <h2 id="my-details-title" className="font-bold text-foreground">My Details</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {positions
                ? 'Tick the columns this tab shows, then put them in order on the right.'
                : 'Tick the columns this tab shows, group by group.'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-subtle hover:bg-card-hover hover:text-muted">
            <X size={18} />
          </button>
        </div>

        <div className={`flex min-h-0 flex-1 flex-col gap-4 px-5 py-4 ${positions ? 'lg:flex-row' : ''}`}>
          <div className={`flex min-h-0 flex-1 flex-col gap-2 ${positions ? 'lg:flex-[3]' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <span className={paneTitle}>All headers</span>
              <span className="text-[11px] tabular-nums text-subtle">{shownCount} of {total} shown</span>
            </div>
            {headers.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-[12rem] flex-1">
                  <ListSearchBox value={q} onChange={setQ} placeholder="Search columns…" label="Search columns" sort={sort} onSort={setSort} />
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

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-divider px-5 py-3">
          <button
            type="button"
            onClick={() => setTicked(new Set(defaultIds))}
            disabled={atDefault}
            title="Tick just the columns this tab starts with"
            className={`inline-flex items-center gap-1.5 ${chip}`}
          >
            <RotateCcw size={13} /> Tab default
          </button>
          <span className="min-w-0 flex-1 text-[11.5px] text-subtle">
            {!canApply
              ? 'Tick at least one column.'
              : positions && orderChanged ? 'New positions stay once you press Save Position.' : ''}
          </span>
          <button type="button" onClick={onClose} className="rounded-full border border-divider px-4 py-1.5 text-[13px] font-medium text-muted hover:bg-card-hover">
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!canApply}
            className="inline-flex items-center gap-1.5 rounded-full bg-action px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-action-hover disabled:opacity-40"
          >
            <Check size={14} /> Apply
          </button>
        </div>
      </div>
    </div>
  );
}
