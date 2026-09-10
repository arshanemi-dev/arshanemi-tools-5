'use client';

import { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';

// The reorderable "Add Header ▾ / Add Title Card ▾ / Add Graph ▾" strip from
// image 2's Tab + Overview sections. `options` = every available item
// ({ id, name }); `selectedIds` = the ordered subset; `onChange(nextIds)`.
export default function HeaderPickerStrip({ label = 'Header', options = [], selectedIds = [], onChange }) {
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

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selectedIds.map((id, i) => (
        <span key={id} className="inline-flex items-center gap-1 rounded-full border border-divider-light bg-background py-0.5 pl-2 pr-1 text-[12px] text-foreground">
          <button type="button" onClick={() => move(i, -1)} className="text-subtle hover:text-foreground disabled:opacity-30" disabled={i === 0}>
            <ChevronLeft size={12} />
          </button>
          <span className="max-w-[10rem] truncate">{byId.get(id)?.name || id}</span>
          <button type="button" onClick={() => move(i, 1)} className="text-subtle hover:text-foreground disabled:opacity-30" disabled={i === selectedIds.length - 1}>
            <ChevronRight size={12} />
          </button>
          <button type="button" onClick={() => remove(id)} className="rounded-full p-0.5 text-subtle hover:bg-card-hover hover:text-neg">
            <X size={11} />
          </button>
        </span>
      ))}

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={!unselected.length}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-divider-light px-2.5 py-1 text-[12px] font-medium text-action hover:bg-action-soft disabled:opacity-40"
        >
          <Plus size={12} /> Add {label} <ChevronDown size={11} />
        </button>
        {open && (
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
