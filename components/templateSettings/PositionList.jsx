'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, GripVertical } from 'lucide-react';

const BTN = 'rounded-md p-1 text-subtle hover:bg-card-hover hover:text-foreground disabled:opacity-25 disabled:hover:bg-transparent';

// One ordered list, arranged the way the Tabs / Overview Organizers are —
// the single pattern for every "what comes first" list in Template Settings
// (the organizers themselves, and a Tab's / Overview Tab's / Graph's own
// headers, title cards and graphs — HeaderPickerStrip).
// Three ways to move a row: drag its ⋮⋮ handle onto another row (a green line
// shows where it lands), pick a "Position N" from its dropdown, or ↑ / ↓ one
// step, ⇈ / ⇊ to the top / bottom.
//
// `items` = the rows, in order (each needs an `id`). `onMove(from, to)` gets
// two indexes and is only called for a move that changes something.
// `renderRow(item, i)` is the row's own content, between its number and the
// move controls; `renderEnd(item, i)` an optional control after them (a
// remove button, say); `nameOf(item)` names the row for screen readers.
// `dragHandleOnly` — only the ⋮⋮ handle starts a drag, for rows whose content
// has things of its own to click and drag in (a dropdown with a search box);
// without it the whole row can be picked up.
// `compact` — the move controls sit closer together, for a list inside a
// narrower card. Either way they drop onto a line of their own once the
// row's content would otherwise be squeezed out (a phone, half a screen).
export default function PositionList({ items = [], onMove, renderRow, renderEnd, nameOf = (item) => item.name, dragHandleOnly = false, compact = false, disabled = false, className = '' }) {
  const [dragFrom, setDragFrom] = useState(null); // index being dragged
  const [dropAt, setDropAt] = useState(null); // insertion slot 0..n (before row i; n = after the last)
  const [armed, setArmed] = useState(null); // dragHandleOnly: the row whose handle is being pressed

  // A handle that was pressed and let go without dragging — the row must not
  // stay draggable (a drag itself ends in endDrag, which disarms too).
  useEffect(() => {
    if (armed === null) return undefined;
    const disarm = () => setArmed(null);
    window.addEventListener('mouseup', disarm);
    return () => window.removeEventListener('mouseup', disarm);
  }, [armed]);

  const moveTo = (from, to) => {
    if (disabled || to < 0 || to >= items.length || to === from) return;
    onMove(from, to);
  };

  // Drag & drop — the pointer's half of the row decides above / below it.
  const endDrag = () => { setDragFrom(null); setDropAt(null); setArmed(null); };
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

  return (
    <ol className={`divide-y divide-divider rounded-lg border border-divider ${className}`} onDrop={onDrop}>
      {items.map((it, i) => {
        const name = nameOf(it) || 'Untitled';
        const last = i === items.length - 1;
        // Show the landing line only where the drop would actually move something.
        const moves = dragFrom !== null && dropAt !== dragFrom && dropAt !== dragFrom + 1;
        const lineAbove = moves && dropAt === i;
        const lineBelow = moves && last && dropAt === items.length;
        return (
          <li
            key={it.id}
            draggable={!disabled && (!dragHandleOnly || armed === i)}
            onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', it.id); setDragFrom(i); }}
            onDragOver={(e) => onDragOver(e, i)}
            onDragEnd={endDrag}
            className={`flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-2 transition-colors ${dragFrom === i ? 'bg-card opacity-50' : ''} ${
              lineAbove ? 'border-t-2 border-t-action' : ''
            } ${lineBelow ? 'border-b-2 border-b-action' : ''}`}
          >
            <span
              title="Drag to move"
              onMouseDown={dragHandleOnly && !disabled ? () => setArmed(i) : undefined}
              className={`shrink-0 text-subtle ${disabled ? 'opacity-30' : 'cursor-grab active:cursor-grabbing'}`}
            >
              <GripVertical size={15} />
            </span>
            <span className="w-6 shrink-0 text-right text-[12px] tabular-nums text-subtle">{i + 1}.</span>
            <div className="flex min-w-[7rem] flex-1 items-center gap-2">{renderRow(it, i)}</div>
            <div className={`ml-auto flex shrink-0 items-center ${compact ? 'gap-0.5' : 'gap-2'}`}>
              <select
                value={i}
                onChange={(e) => moveTo(i, Number(e.target.value))}
                disabled={disabled}
                aria-label={`Position of ${name}`}
                title="Move to position"
                className="shrink-0 rounded-md border border-divider bg-background px-1.5 py-0.5 text-[11.5px] text-muted focus:border-accent focus:outline-none disabled:opacity-60"
              >
                {items.map((_, p) => <option key={p} value={p}>Position {p + 1}</option>)}
              </select>
              <button type="button" title="Move to top" aria-label={`Move ${name} to top`} disabled={disabled || i === 0} onClick={() => moveTo(i, 0)} className={BTN}><ChevronsUp size={14} /></button>
              <button type="button" title="Move up" aria-label={`Move ${name} up`} disabled={disabled || i === 0} onClick={() => moveTo(i, i - 1)} className={BTN}><ArrowUp size={14} /></button>
              <button type="button" title="Move down" aria-label={`Move ${name} down`} disabled={disabled || last} onClick={() => moveTo(i, i + 1)} className={BTN}><ArrowDown size={14} /></button>
              <button type="button" title="Move to bottom" aria-label={`Move ${name} to bottom`} disabled={disabled || last} onClick={() => moveTo(i, items.length - 1)} className={BTN}><ChevronsDown size={14} /></button>
              {renderEnd?.(it, i)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
