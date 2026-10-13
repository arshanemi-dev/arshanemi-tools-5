'use client';

import { ChevronDown, Plus, X } from 'lucide-react';
import Popover from '@/components/dashboard/Popover';
import SearchSelect from '@/components/dashboard/SearchSelect';
import SearchChecklist from '@/components/dashboard/SearchChecklist';
import PositionList from './PositionList';

// The "pick some, put them in order" list from image 2's Tab + Overview
// sections (and a Graph's headers): the Headers / Title Cards / Graphs a tab
// shows, top = first. Arranged exactly like the Tabs / Overview Organizers —
// drag a row's ⋮⋮ handle, pick its "Position N", or ↑ / ↓ / ⇈ / ⇊
// (PositionList) — plus two things an organizer row has no use for: every
// row is itself a searchable dropdown (SearchSelect) — pick a different item
// straight from it to swap it in — and × takes it off the list. "Add …"
// opens a searchable checklist, so several can be added in one go (in the
// order listed). Picking one that's already used in another row swaps the
// two rows instead of creating a duplicate; picking an unused one just
// replaces this row (the old item returns to the "Add" pool).
// `options` = every available item ({ id, name }); `selectedIds` = the
// ordered subset; `onChange(nextIds)`.
export default function HeaderPickerStrip({ label = 'Header', options = [], selectedIds = [], onChange, disabled = false }) {
  const byId = new Map(options.map((o) => [o.id, o]));
  const unselected = options.filter((o) => !selectedIds.includes(o.id));

  const moveTo = (from, to) => {
    const next = [...selectedIds];
    const [id] = next.splice(from, 1);
    next.splice(to, 0, id);
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
    if (j !== -1) next[j] = oldId; // already used elsewhere — swap the two rows
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {selectedIds.length > 0 && (
        <PositionList
          items={selectedIds.map((id) => ({ id }))}
          onMove={moveTo}
          nameOf={(it) => byId.get(it.id)?.name || it.id}
          disabled={disabled}
          dragHandleOnly // the row's dropdown has a search box and a list of its own to click and drag in
          compact // these sit inside a card, often in half the screen (the live preview takes the other half)
          className="bg-background"
          renderRow={(it, i) => (
            <SearchSelect
              value={it.id}
              options={options.map((o) => ({ value: o.id, label: o.name, hint: o.id !== it.id && selectedIds.includes(o.id) ? 'swap' : undefined }))}
              onChange={(newId) => pick(i, newId)}
              disabled={disabled}
              ariaLabel={`${label} ${i + 1}`}
              searchPlaceholder={`Search ${label.toLowerCase()}s…`}
              missingLabel={byId.has(it.id) ? null : it.id}
              className="min-w-0 flex-1"
            />
          )}
          renderEnd={(it) => (
            <button
              type="button"
              title="Remove"
              aria-label={`Remove ${byId.get(it.id)?.name || it.id}`}
              onClick={() => remove(it.id)}
              disabled={disabled}
              className="rounded-md p-1 text-subtle hover:bg-card-hover hover:text-neg disabled:opacity-25 disabled:hover:bg-transparent"
            >
              <X size={14} />
            </button>
          )}
        />
      )}

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
