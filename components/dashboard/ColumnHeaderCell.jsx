'use client';

import { ArrowDown, ArrowUp, ChevronsUpDown, Filter } from 'lucide-react';
import Popover from './Popover';

// One <th> body: label + filter popover + tri-state sort toggle.
// filter shape: { op:'contains'|'gte'|'lte'|'between', a, b } | null
export default function ColumnHeaderCell({ col, sort, onSortChange, filter, onFilterChange }) {
  const dir = sort?.key === col.key ? sort.dir : null;
  const isText = col.type === 'text';

  const cycleSort = () => {
    if (dir === null) onSortChange({ key: col.key, dir: 'asc' });
    else if (dir === 'asc') onSortChange({ key: col.key, dir: 'desc' });
    else onSortChange(null);
  };

  const SortIcon = dir === 'asc' ? ArrowUp : dir === 'desc' ? ArrowDown : ChevronsUpDown;
  const active = !!filter;

  return (
    <div className="flex items-center gap-1">
      <span>{col.label}</span>
      <button
        type="button"
        onClick={cycleSort}
        className={`rounded p-0.5 transition-colors hover:bg-card-hover ${dir ? 'text-action' : 'text-subtle'}`}
        aria-label={`Sort by ${col.label}`}
      >
        <SortIcon size={12} />
      </button>
      <Popover
        align="left"
        panelClass="min-w-[13rem] p-2"
        trigger={() => (
          <button
            type="button"
            className={`rounded p-0.5 transition-colors hover:bg-card-hover ${active ? 'text-action' : 'text-subtle'}`}
            aria-label={`Filter ${col.label}`}
          >
            <Filter size={12} />
          </button>
        )}
      >
        {(close) => (
          <div className="space-y-2">
            {isText ? (
              <input
                autoFocus
                placeholder="Contains…"
                defaultValue={filter?.a ?? ''}
                onChange={(e) =>
                  onFilterChange(e.target.value ? { op: 'contains', a: e.target.value } : null)
                }
                className="w-full rounded-lg border border-divider-light bg-background px-2.5 py-1.5 text-sm text-foreground focus:border-accent focus:outline-none"
              />
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  placeholder="min"
                  defaultValue={filter?.a ?? ''}
                  onChange={(e) => {
                    const a = e.target.value;
                    onFilterChange(mergeRange(filter, { a }));
                  }}
                  className="w-full rounded-lg border border-divider-light bg-background px-2 py-1.5 text-sm text-foreground focus:border-accent focus:outline-none"
                />
                <span className="text-xs text-subtle">–</span>
                <input
                  type="number"
                  placeholder="max"
                  defaultValue={filter?.b ?? ''}
                  onChange={(e) => {
                    const b = e.target.value;
                    onFilterChange(mergeRange(filter, { b }));
                  }}
                  className="w-full rounded-lg border border-divider-light bg-background px-2 py-1.5 text-sm text-foreground focus:border-accent focus:outline-none"
                />
              </div>
            )}
            {active && (
              <button
                type="button"
                onClick={() => {
                  onFilterChange(null);
                  close();
                }}
                className="w-full rounded-lg border border-divider-light px-2 py-1 text-xs text-muted hover:bg-card-hover"
              >
                Clear filter
              </button>
            )}
          </div>
        )}
      </Popover>
    </div>
  );
}

function mergeRange(prev, patch) {
  const a = patch.a ?? prev?.a ?? '';
  const b = patch.b ?? prev?.b ?? '';
  if (a === '' && b === '') return null;
  return { op: 'between', a: a === '' ? null : Number(a), b: b === '' ? null : Number(b) };
}
