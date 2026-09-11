'use client';

import { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';

// The reorderable "Add Header ▾ / Add Title Card ▾ / Add Graph ▾" strip from
// image 2's Tab + Overview sections. Every added slot is itself a <select> —
// pick a different item straight from the dropdown to swap it in. Picking one
// that's already used in another slot swaps the two slots (same idea as the
// sidebar's reorder mode) instead of creating a duplicate; picking an unused
// one just replaces this slot (the old item returns to the "Add" pool).
// `options` = every available item ({ id, name }); `selectedIds` = the
// ordered subset; `onChange(nextIds)`.
export default function HeaderPickerStrip({ label = 'Header', options = [], selectedIds = [], onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const byId = new Map(options.map((o) => [o.id, o]));
  const unselected = options.filter((o) => !selectedIds.includes(o.id));

  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= selectedIds.length) return;
    const next = [...selectedIds];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const remove = (id) => onChange(selectedIds.filter((x) => x !== id));
  const add = (id) => { onChange([...selectedIds, id]); setOpen(false); };
  const pick = (i, newId) => {
    const oldId = selectedIds[i];
    if (!newId || newId === oldId) return;
    const j = selectedIds.indexOf(newId);
    const next = [...selectedIds];
    next[i] = newId;
    if (j !== -1) next[j] = oldId; // already used elsewhere — swap the two slots
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {selectedIds.map((id, i) => (
        <div key={id} className="flex items-center gap-1 rounded-lg border border-divider-light bg-background py-1 pl-1.5 pr-1">
          <button type="button" onClick={() => move(i, -1)} className="shrink-0 text-subtle hover:text-foreground disabled:opacity-30" disabled={disabled || i === 0}>
            <ChevronLeft size={12} />
          </button>
          <select
            value={id}
            disabled={disabled}
            onChange={(e) => pick(i, e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-divider bg-background px-2 py-1 text-[12px] text-foreground focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            {!byId.has(id) && <option value={id}>{id}</option>}
            {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <button type="button" onClick={() => move(i, 1)} className="shrink-0 text-subtle hover:text-foreground disabled:opacity-30" disabled={disabled || i === selectedIds.length - 1}>
            <ChevronRight size={12} />
          </button>
          <button type="button" onClick={() => remove(id)} disabled={disabled} className="shrink-0 rounded-full p-0.5 text-subtle hover:bg-card-hover hover:text-neg disabled:opacity-30">
            <X size={11} />
          </button>
        </div>
      ))}

      <div className="relative self-start">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={disabled || !unselected.length}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-divider-light px-2.5 py-1 text-[12px] font-medium text-action hover:bg-action-soft disabled:opacity-40"
        >
          <Plus size={12} /> Add {label} <ChevronDown size={11} />
        </button>
        {open && !disabled && (
          <ul className="absolute z-30 mt-1 max-h-60 w-56 overflow-y-auto rounded-lg border border-divider-light bg-background p-1 shadow-lg">
            {unselected.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => add(o.id)}
                  className="block w-full truncate rounded px-2 py-1 text-left text-[12px] text-muted hover:bg-card-hover"
                >
                  {o.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
