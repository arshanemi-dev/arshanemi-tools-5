'use client';

import { ChevronDown, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import Popover from '@/components/dashboard/Popover';
import SearchSelect from '@/components/dashboard/SearchSelect';
import SearchChecklist from '@/components/dashboard/SearchChecklist';

// The reorderable "Add Header ▾ / Add Title Card ▾ / Add Graph ▾" strip from
// image 2's Tab + Overview sections. Every added slot is itself a searchable
// dropdown (SearchSelect) — pick a different item straight from it to swap it
// in — and "Add …" opens a searchable checklist, so several can be added in
// one go (in the order listed). Picking one
// that's already used in another slot swaps the two slots (same idea as the
// sidebar's reorder mode) instead of creating a duplicate; picking an unused
// one just replaces this slot (the old item returns to the "Add" pool).
// `options` = every available item ({ id, name }); `selectedIds` = the
// ordered subset; `onChange(nextIds)`.
export default function HeaderPickerStrip({ label = 'Header', options = [], selectedIds = [], onChange, disabled = false }) {
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
  const addMany = (ids) => onChange([...selectedIds, ...unselected.map((o) => o.id).filter((id) => ids.includes(id))]);
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
          <SearchSelect
            value={id}
            options={options.map((o) => ({ value: o.id, label: o.name, hint: o.id !== id && selectedIds.includes(o.id) ? 'swap' : undefined }))}
            onChange={(newId) => pick(i, newId)}
            disabled={disabled}
            ariaLabel={`${label} ${i + 1}`}
            searchPlaceholder={`Search ${label.toLowerCase()}s…`}
            missingLabel={byId.has(id) ? null : id}
            className="min-w-0 flex-1"
          />
          <button type="button" onClick={() => move(i, 1)} className="shrink-0 text-subtle hover:text-foreground disabled:opacity-30" disabled={disabled || i === selectedIds.length - 1}>
            <ChevronRight size={12} />
          </button>
          <button type="button" onClick={() => remove(id)} disabled={disabled} className="shrink-0 rounded-full p-0.5 text-subtle hover:bg-card-hover hover:text-neg disabled:opacity-30">
            <X size={11} />
          </button>
        </div>
      ))}

      <Popover
        className="self-start"
        trigger={() => (
          <button
            type="button"
            disabled={disabled || !unselected.length}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-divider-light px-2.5 py-1 text-[12px] font-medium text-action hover:bg-action-soft disabled:opacity-40"
          >
            <Plus size={12} /> Add {label} <ChevronDown size={11} />
          </button>
        )}
      >
        {(close) => (
          <SearchChecklist
            label={`${label.toLowerCase()}s to add`}
            options={unselected.map((o) => ({ value: o.id, label: o.name }))}
            onSubmit={addMany}
            onClose={close}
            okLabel={(n) => (n ? `Add ${n}` : 'Add')}
            placeholder={`Search ${label.toLowerCase()}s…`}
          />
        )}
      </Popover>
    </div>
  );
}
