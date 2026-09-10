'use client';

import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';

// The recurring left column in image 2's builder sections: a title, a search
// box, an "+ Add …" button, and a click-to-select list. Used by Header /
// Title Card / Graph Design / Graph Data / Tab / Market Place.
export default function ListEditorColumn({ title, items = [], activeId, onSelect, onAdd, addLabel = 'Add', renderMeta }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? items.filter((it) => (it.label || '').toLowerCase().includes(s)) : items;
  }, [q, items]);

  return (
    <div className="flex w-52 shrink-0 flex-col rounded-xl border border-divider bg-card">
      <div className="border-b border-divider px-3 py-2 text-[13px] font-bold text-foreground">{title}</div>
      <div className="space-y-2 p-2">
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="flex w-full items-center gap-1.5 rounded-lg border border-dashed border-divider-light px-2.5 py-1.5 text-[12.5px] font-medium text-action hover:bg-action-soft"
          >
            <Plus size={13} /> {addLabel}
          </button>
        )}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="w-full rounded-lg border border-divider bg-background py-1.5 pl-7 pr-2 text-[12px] focus:border-accent focus:outline-none"
          />
        </div>
      </div>
      <ul className="max-h-72 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
        {filtered.length === 0 && <li className="px-2 py-3 text-center text-[12px] text-subtle">Nothing yet.</li>}
        {filtered.map((it) => (
          <li key={it.id}>
            <button
              type="button"
              onClick={() => onSelect(it.id)}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors ${
                it.id === activeId ? 'bg-accent/10 font-semibold text-foreground' : 'text-muted hover:bg-card-hover'
              }`}
            >
              <span className="truncate">{it.label || 'Untitled'}</span>
              {renderMeta?.(it)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
