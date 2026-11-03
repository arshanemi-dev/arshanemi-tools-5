'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import ArrangeControl from './ArrangeControl';
import ColumnFilterButton from './ColumnFilterButton';
import HeaderInfoTip from './HeaderInfoTip';

// One <th> body: label + tri-state sort toggle + a spreadsheet-style menu
// (ColumnFilterButton — the same sort as "Sort A → Z / Z → A", a Min / Max
// range on a number column, then search + tick the values to keep), plus an
// inline ArrangeControl when this column offers one.
// Sort, filter, and info icons are hidden by default to consume minimum space,
// and show smoothly on hover (active sort/filter icons stay visible).
export default function ColumnHeaderCell({
  col,
  sort,
  onSortChange,
  filter,
  onFilterChange,
  getFilterOptions = () => [],
  getFilterRange = null,
  onFilterOpenChange,
  editMode = false,
  showArrange = false,
  items,
  hiddenIds,
  onSwapWith,
  onHide,
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const dir = sort?.key === col.key ? sort.dir : null;

  const cycleSort = () => {
    if (dir === null) onSortChange({ key: col.key, dir: 'asc' });
    else if (dir === 'asc') onSortChange({ key: col.key, dir: 'desc' });
    else onSortChange(null);
  };

  const SortIcon = dir === 'asc' ? ArrowUp : dir === 'desc' ? ArrowDown : ChevronsUpDown;

  const handleFilterOpenChange = (open) => {
    setFilterOpen(open);
    onFilterOpenChange?.(open);
  };

  const hasFilter = !!filter;
  const hasActiveIcon = !!dir || hasFilter || filterOpen || infoOpen;

  return (
    <div className="group/cell relative flex items-center justify-center gap-1">
   <span className="flex-1 text-center break-words overflow-hidden line-clamp-3 max-w-[70px] min-w-full">
  {col.label}
</span>
      {!editMode && (
        <span className={`items-center gap-0.5 shrink-0 ${hasActiveIcon ? 'inline-flex' : 'hidden group-hover/cell:inline-flex'}`}>
          <button
            type="button"
            onClick={cycleSort}
            className={`shrink-0 rounded p-0.5 transition-colors hover:bg-white/15 ${
              dir ? 'inline-flex text-action' : 'hidden group-hover/cell:inline-flex text-white/60 hover:text-white'
            }`}
            aria-label={`Sort by ${col.label}`}
          >
            <SortIcon size={12} />
          </button>
          <span className={hasFilter || filterOpen ? 'inline-flex' : 'hidden group-hover/cell:inline-flex'}>
            <ColumnFilterButton
              label={col.label}
              filter={filter}
              getOptions={getFilterOptions}
              getRange={getFilterRange}
              onChange={onFilterChange}
              onOpenChange={handleFilterOpenChange}
              sortDir={dir}
              onSort={(d) => onSortChange(d ? { key: col.key, dir: d } : null)}
              onDark
            />
          </span>
          {col.description && (
            <span className={infoOpen ? 'inline-flex' : 'hidden group-hover/cell:inline-flex'}>
              <HeaderInfoTip label={col.label} text={col.description} onOpenChange={setInfoOpen} />
            </span>
          )}
        </span>
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
