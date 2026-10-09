'use client';

import { ChevronDown } from 'lucide-react';
import Popover from './Popover';
import SearchChecklist from './SearchChecklist';

// One dropdown value filter — e.g. "All Companies ▾" in the header bar,
// listing the distinct "MarketPlace_Brand" combos tagged onto the loaded
// rows (see resolveTemplate's companyOptions) as a searchable checklist:
// tick one or several, OK. `value` is 'all' or the list of chosen options
// (a single name is read as a list of one); ticking everything is 'all'.
// Disabled (greyed) when there's no data loaded yet.
export default function ValueFilter({ label, allLabel = `All ${label}`, options = [], value = 'all', onChange, align = 'left' }) {
  const disabled = !options.length;
  const chosen = value === 'all' ? null : Array.isArray(value) ? value : [value];
  const current = !chosen ? allLabel : chosen.length === 1 ? chosen[0] : `${chosen.length} ${label}`;

  return (
    <Popover
      align={align}
      panelClass="p-1"
      trigger={() => (
        <button
          type="button"
          disabled={disabled}
          title={disabled ? `${label}: no values in the loaded data` : label}
          className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors ${
            value !== 'all'
              ? 'border-accent bg-accent/5 text-foreground'
              : 'border-divider-light bg-background text-muted hover:border-divider'
          } disabled:opacity-45`}
        >
          <span className="max-w-[9rem] truncate">{current}</span>
          <ChevronDown size={13} className="shrink-0" />
        </button>
      )}
    >
      {(close) => (
        <SearchChecklist
          label={label.toLowerCase()}
          options={options.map((opt) => ({ value: opt, label: opt }))}
          initial={chosen || options}
          onSubmit={(values, { all }) => onChange(all ? 'all' : values)}
          onClose={close}
          placeholder={`Search ${label.toLowerCase()}…`}
          footer={chosen && (
            <button type="button" onClick={() => { onChange('all'); close(); }} className="rounded-lg px-2 py-1 text-[12px] font-medium text-muted hover:bg-card-hover hover:text-foreground">
              {allLabel}
            </button>
          )}
        />
      )}
    </Popover>
  );
}
