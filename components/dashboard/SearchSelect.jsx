'use client';

import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import Popover from './Popover';
import { ListSearchBox, matchesSearch, sortByLabel } from './SearchChecklist';

const TRIGGER = 'flex w-full items-center justify-between gap-2 rounded-md border border-divider bg-background px-2 py-1 text-left text-[12px] text-foreground hover:bg-card-hover focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60';

// A "pick one" dropdown you can search — what a <select> over a long list
// (headers, tabs, …) is everywhere in the tool. The button shows the current
// choice; opening it gives a search box over the options: type to narrow,
// click one (or Enter for the first match / ↑ ↓ to move), Escape to leave.
// The toggle beside the search orders the list A → Z / Z → A (it stays as
// set while the page is open).
// `options` = [{ value, label, hint? }]; `value` = the chosen one's value (a
// value that is no longer an option shows as `missingLabel`).
// `className` sizes the wrapper ("min-w-0 flex-1" to fill a row);
// `triggerClass` replaces the button's own look entirely; `children` (a
// node) replaces the button's label + chevron — for an "Add …" button.
export default function SearchSelect({ value = '', options = [], onChange, placeholder = 'Select…', searchPlaceholder = 'Search…', ariaLabel, disabled = false, align = 'left', className = '', triggerClass = TRIGGER, panelClass = 'w-60', missingLabel = null, children = null }) {
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const [sort, setSort] = useState(null);
  const current = options.find((o) => o.value === value) || null;
  const shown = sortByLabel(options.filter((o) => matchesSearch(o.label, q)), (o) => o.label, sort);
  const active = Math.min(at, Math.max(shown.length - 1, 0));

  const text = current ? current.label : value ? (missingLabel ?? String(value)) : placeholder;

  return (
    <Popover
      align={align}
      className={className}
      panelClass={`${panelClass} p-1`}
      onOpenChange={(open) => { if (!open) { setQ(''); setAt(0); } }}
      trigger={() => (
        <button type="button" disabled={disabled} aria-label={ariaLabel} aria-haspopup="listbox" title={current?.label} className={triggerClass}>
          {children || (
            <>
              <span className={`min-w-0 flex-1 truncate ${current || value ? '' : 'text-muted'}`}>{text}</span>
              <ChevronDown size={13} className="shrink-0 text-subtle" />
            </>
          )}
        </button>
      )}
    >
      {(close) => {
        const pick = (o) => { if (!o) return; if (o.value !== value) onChange(o.value); close(); };
        return (
          <div
            className="flex flex-col gap-1 text-left font-normal whitespace-normal"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setAt(Math.min(active + 1, shown.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setAt(Math.max(active - 1, 0)); }
            }}
          >
            <ListSearchBox value={q} onChange={(v) => { setQ(v); setAt(0); }} onEnter={() => pick(shown[active])} placeholder={searchPlaceholder} label={ariaLabel ? `Search ${ariaLabel}` : 'Search'} sort={sort} onSort={(d) => { setSort(d); setAt(0); }} />
            <ul role="listbox" aria-label={ariaLabel} className="max-h-56 overflow-y-auto">
              {shown.length === 0 && <li className="px-2 py-2 text-center text-[12px] text-subtle">{options.length ? 'Nothing matches.' : 'Nothing to pick yet.'}</li>}
              {shown.map((o, i) => (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.value === value}
                    onClick={() => pick(o)}
                    onMouseEnter={() => setAt(i)}
                    title={o.label}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] ${i === active ? 'bg-card-hover' : ''} ${o.value === value ? 'font-semibold text-foreground' : 'text-muted'}`}
                  >
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.hint && <span className="shrink-0 text-[10.5px] text-subtle">{o.hint}</span>}
                    {o.value === value && <Check size={12} className="shrink-0 text-action" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      }}
    </Popover>
  );
}
