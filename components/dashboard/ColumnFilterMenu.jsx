'use client';

import { useState } from 'react';
import { ArrowDownAZ, ArrowDownZA, Check } from 'lucide-react';
import SearchChecklist from './SearchChecklist';
import { BLANK_LABEL } from '@/lib/profitLoss/columnFilter';

const SORTS = [
  ['asc', ArrowDownAZ, 'Sort A → Z', 'smallest · oldest first'],
  ['desc', ArrowDownZA, 'Sort Z → A', 'largest · newest first'],
];

// A column's dropdown, spreadsheet-style: sort the table by this column
// (A → Z / Z → A — picking the one already on clears it), then a
// SearchChecklist over every value the column holds (with how many rows have
// each) to filter it:
//  - No filter yet → everything starts ticked; untick what to hide.
//  - Ticking everything (with no search) is the same as no filter.
//  - "Clear filter" (only while one is on) removes it.
// `getOptions()` → [{ text, count }] ('' = blank cells), read once when the
// menu opens (it walks every row); `selected` = the current filter's values,
// or null. `onApply({ values } | null)`; `onClose()`. `sortDir` ('asc' |
// 'desc' | null) + `onSort(dir | null)` — leave `onSort` out for a column
// that can't be sorted.
export default function ColumnFilterMenu({ label, getOptions, selected = null, onApply, onClose, sortDir = null, onSort = null }) {
  const [options] = useState(() => getOptions().map((o) => ({ value: o.text, label: o.text === '' ? BLANK_LABEL : o.text, count: o.count, muted: o.text === '' })));

  return (
    <SearchChecklist
      label={`${label} values`}
      options={options}
      initial={selected || options.map((o) => o.value)}
      onSubmit={(values, { all }) => onApply(all ? null : { values })}
      onClose={onClose}
      emptyText="This column has no values."
      sortable={false}
      header={onSort && (
        <div className="border-b border-divider pb-1">
          {SORTS.map(([dir, Icon, text, hint]) => (
            <button
              key={dir}
              type="button"
              onClick={() => { onSort(sortDir === dir ? null : dir); onClose(); }}
              aria-pressed={sortDir === dir}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-card-hover ${sortDir === dir ? 'font-semibold text-action' : 'text-foreground'}`}
            >
              <Icon size={14} className="shrink-0" />
              <span>{text}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] font-normal text-subtle">{hint}</span>
              {sortDir === dir && <Check size={13} className="shrink-0" />}
            </button>
          ))}
        </div>
      )}
      footer={selected && (
        <button type="button" onClick={() => { onApply(null); onClose(); }} className="rounded-lg px-2 py-1 text-[12px] font-medium text-muted hover:bg-card-hover hover:text-foreground">
          Clear filter
        </button>
      )}
    />
  );
}
