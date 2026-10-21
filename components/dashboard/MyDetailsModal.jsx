'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import MyDetailsPanes from './MyDetailsPanes';

// The My Details window (DetailsViewPills opens it): which columns a tab's
// table shows — and, given `orderIds`, in what order. Its two sides are
// MyDetailsPanes (shared with the Position Settings page): every header it
// can show, group by group, and — with `orderIds` — the ticked columns in
// table order, to move.
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
  const [start] = useState(() => ({ ticks: new Set(shownIds), order: positions ? orderIds.join(',') : '' }));
  const [ticked, setTicked] = useState(() => new Set(shownIds));
  const [order, setOrder] = useState(() => (positions ? [...orderIds] : []));

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ticksChanged = !sameSet(ticked, start.ticks);
  const orderChanged = positions && order.join(',') !== start.order;
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

        <MyDetailsPanes
          keyHeader={keyHeader}
          headers={headers}
          groups={groups}
          ticked={ticked}
          onTicked={setTicked}
          order={positions ? order : null}
          onOrder={setOrder}
          autoFocus
          className="px-5 py-4"
        />

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
            {!canApply ? 'Tick at least one column.' : ''}
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
