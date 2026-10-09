'use client';

import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import ArrangeControl from './ArrangeControl';
import ColumnFilterButton from './ColumnFilterButton';

// One <th> body: label + tri-state sort toggle + a spreadsheet-style menu
// (ColumnFilterButton — the same sort as "Sort A → Z / Z → A", then search +
// tick the values to keep), plus an inline
// ArrangeControl when this column offers one (never for the sticky first
// column — see DetailsTable). Sort/filter hide entirely while the table is
// in edit mode — arranging is the only thing to do with a header then, on
// every column including the sticky one.
// filter shape: { values: [text, ...] } | null (lib/profitLoss/columnFilter.js)
// `getFilterOptions()` → the column's distinct values, read when the menu
// opens. `onFilterOpenChange(open)` lets the table make room for the menu.
export default function ColumnHeaderCell({ col, sort, onSortChange, filter, onFilterChange, getFilterOptions = () => [], onFilterOpenChange, editMode = false, showArrange = false, items, hiddenIds, onSwapWith, onHide }) {
  const dir = sort?.key === col.key ? sort.dir : null;

  const cycleSort = () => {
    if (dir === null) onSortChange({ key: col.key, dir: 'asc' });
    else if (dir === 'asc') onSortChange({ key: col.key, dir: 'desc' });
    else onSortChange(null);
  };

  const SortIcon = dir === 'asc' ? ArrowUp : dir === 'desc' ? ArrowDown : ChevronsUpDown;

  return (
    <div className="flex items-center gap-1">
      <span>{col.label}</span>
      {!editMode && (
        <>
          <button
            type="button"
            onClick={cycleSort}
            className={`rounded p-0.5 transition-colors hover:bg-card-hover ${dir ? 'text-action' : 'text-subtle'}`}
            aria-label={`Sort by ${col.label}`}
          >
            <SortIcon size={12} />
          </button>
          <ColumnFilterButton
            label={col.label}
            filter={filter}
            getOptions={getFilterOptions}
            onChange={onFilterChange}
            onOpenChange={onFilterOpenChange}
            sortDir={dir}
            onSort={(d) => onSortChange(d ? { key: col.key, dir: d } : null)}
          />
        </>
      )}
      {showArrange && (
        <ArrangeControl
          currentId={col.id}
          items={items}
          hiddenIds={hiddenIds}
          onSwapWith={onSwapWith}
          onHide={onHide}
        />
      )}
    </div>
  );
}
