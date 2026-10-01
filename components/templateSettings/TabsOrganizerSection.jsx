'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, GripVertical, Loader2, Save } from 'lucide-react';
import { DEFAULT_OVERVIEW_ICON, DEFAULT_TAB_ICON, tabIconFor } from '@/components/dashboard/tabIcons';
import SectionHead from './SectionHead';

const KINDS = {
  tab: { title: 'Tabs Organizer', listKey: 'tabs', anchor: 'section-tabs-organizer', icon: DEFAULT_TAB_ICON, noun: 'tab' },
  overview: { title: 'Overview Organizer', listKey: 'overviewTabs', anchor: 'section-overview-organizer', icon: DEFAULT_OVERVIEW_ICON, noun: 'overview tab' },
};

// The GLOBAL position of every Tab (or Overview Tab): the order the
// dashboard's sidebar lists them in for every user — someone who saved
// their own arrangement with the dashboard's Position Settings keeps theirs.
// Three ways to move one: drag its ⋮⋮ handle onto another row (a green line
// shows where it lands), pick a "Position N" from its dropdown, or ↑ / ↓ one
// step, ⇈ / ⇊ to the top / bottom. Every move renumbers `order` 0..n-1 in
// the Global Settings draft. Save Position saves that draft (Publish puts it
// on the dashboard, like any Global Settings change).
export default function TabsOrganizerSection({ draft, kind = 'tab', onSave, saving = false }) {
  const k = KINDS[kind];
  const items = [...(draft.config[k.listKey] || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const [dragFrom, setDragFrom] = useState(null); // index being dragged
  const [dropAt, setDropAt] = useState(null); // insertion slot 0..n (before row i; n = after the last)

  const moveTo = (from, to) => {
    if (to < 0 || to >= items.length || to === from) return;
    const next = [...items];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    const orderById = new Map(next.map((x, i) => [x.id, i]));
    draft.setConfig((c) => ({ ...c, [k.listKey]: (c[k.listKey] || []).map((x) => ({ ...x, order: orderById.get(x.id) ?? x.order })) }));
  };

  // Drag & drop — the pointer's half of the row decides above / below it.
  const endDrag = () => { setDragFrom(null); setDropAt(null); };
  const onDragOver = (e, i) => {
    if (dragFrom === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const box = e.currentTarget.getBoundingClientRect();
    setDropAt(e.clientY < box.top + box.height / 2 ? i : i + 1);
  };
  const onDrop = (e) => {
    e.preventDefault();
    if (dragFrom !== null && dropAt !== null) moveTo(dragFrom, dropAt > dragFrom ? dropAt - 1 : dropAt);
    endDrag();
  };

  const btn = 'rounded-md p-1 text-subtle hover:bg-card-hover hover:text-foreground disabled:opacity-25 disabled:hover:bg-transparent';

  return (
    <div id={k.anchor} className="scroll-mt-24">
      <SectionHead
        title={k.title}
        right={(
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !items.length}
            title="Saves the Global Settings draft — Publish to show this order on the dashboard"
            className="inline-flex items-center gap-1.5 rounded-full bg-action px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-action-hover disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save Position
          </button>
        )}
      />
      <div className="rounded-xl border border-divider bg-background p-4">
        <p className="mb-3 text-[12px] text-subtle">
          The order every user&rsquo;s dashboard sidebar shows these {k.noun}s in (top = first). A user who saved their own arrangement with Position Settings keeps theirs.
        </p>
        {!items.length ? (
          <p className="py-6 text-center text-[12.5px] text-subtle">No {k.noun}s yet.</p>
        ) : (
          <ol className="divide-y divide-divider rounded-lg border border-divider" onDrop={onDrop}>
            {items.map((it, i) => {
              const Icon = tabIconFor(it.icon, k.icon);
              // Show the landing line only where the drop would actually move something.
              const moves = dragFrom !== null && dropAt !== dragFrom && dropAt !== dragFrom + 1;
              const lineAbove = moves && dropAt === i;
              const lineBelow = moves && i === items.length - 1 && dropAt === items.length;
              return (
                <li
                  key={it.id}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', it.id); setDragFrom(i); }}
                  onDragOver={(e) => onDragOver(e, i)}
                  onDragEnd={endDrag}
                  className={`flex items-center gap-2 px-3 py-2 transition-colors ${dragFrom === i ? 'bg-card opacity-50' : ''} ${
                    lineAbove ? 'border-t-2 border-t-action' : ''
                  } ${lineBelow ? 'border-b-2 border-b-action' : ''}`}
                >
                  <span title="Drag to move" className="shrink-0 cursor-grab text-subtle active:cursor-grabbing"><GripVertical size={15} /></span>
                  <span className="w-6 shrink-0 text-right text-[12px] tabular-nums text-subtle">{i + 1}.</span>
                  <Icon size={15} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{it.name || 'Untitled'}</span>
                  <select
                    value={i}
                    onChange={(e) => moveTo(i, Number(e.target.value))}
                    aria-label={`Position of ${it.name}`}
                    title="Move to position"
                    className="shrink-0 rounded-md border border-divider bg-background px-1.5 py-0.5 text-[11.5px] text-muted focus:border-accent focus:outline-none"
                  >
                    {items.map((_, p) => <option key={p} value={p}>Position {p + 1}</option>)}
                  </select>
                  <button type="button" title="Move to top" aria-label={`Move ${it.name} to top`} disabled={i === 0} onClick={() => moveTo(i, 0)} className={btn}><ChevronsUp size={14} /></button>
                  <button type="button" title="Move up" aria-label={`Move ${it.name} up`} disabled={i === 0} onClick={() => moveTo(i, i - 1)} className={btn}><ArrowUp size={14} /></button>
                  <button type="button" title="Move down" aria-label={`Move ${it.name} down`} disabled={i === items.length - 1} onClick={() => moveTo(i, i + 1)} className={btn}><ArrowDown size={14} /></button>
                  <button type="button" title="Move to bottom" aria-label={`Move ${it.name} to bottom`} disabled={i === items.length - 1} onClick={() => moveTo(i, items.length - 1)} className={btn}><ChevronsDown size={14} /></button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
