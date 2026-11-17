'use client';

import { useState } from 'react';
import { Filter } from 'lucide-react';
import Popover from './Popover';
import ColumnFilterMenu from './ColumnFilterMenu';
import { rangeText } from '@/lib/profitLoss/columnFilter';

const MENU_WIDTH = 272; // px — the menu's w-64 plus its padding and border
const WIDE_WIDTH = 680; // px — the `wide` menu (SearchChecklist columns={3}) plus padding and border

// The funnel in a table column header + its spreadsheet-style menu
// (ColumnFilterMenu — Sort A → Z / Z → A, a Min / Max range on a number
// column, then search + tick the values to keep). Used by the
// dashboard tables (ColumnHeaderCell) and Template Settings' Header table.
// filter shape: { values: [text, ...], min, max } | null — any of the three
// (lib/profitLoss/columnFilter.js)
// `getOptions()` → the column's distinct values, read when the menu opens.
// `getRange()` → { min, max } the column's numbers span, or null — pass it
// only for a column that can hold numbers; without it there is no range.
// `sortDir` ('asc' | 'desc' | null) + `onSort(dir | null)` = the table's
// sort on this column; the funnel is lit while either a filter or a sort is on.
// `onOpenChange(open)` lets the table make room for the menu: it opens
// inside the table's scroll area (mark that element `data-table-scroll`),
// hanging left instead of right near its right edge so it stays in view.
// `onDark` = the header it sits in is the dark navy band (the dashboard
// tables) — white idle/hover tones instead of the page's grey ones.
// `wide` = the value list in 3 columns (a wider menu, for long lists — the
// Template Settings Header table); it still opens right, or left near the end.
// `highlight` = red (the dashboard tables' white icon pill, ColumnHeaderCell):
// solid red while a filter or sort is on.
export default function ColumnFilterButton({ label, filter, getOptions = () => [], getRange = null, onChange, onOpenChange, size = 12, sortDir = null, onSort = null, onDark = false, highlight = false, wide = false }) {
  const [align, setAlign] = useState('left');
  const active = !!filter;
  const sorted = sortDir ? `sorted ${sortDir === 'asc' ? 'A → Z' : 'Z → A'}` : '';
  const range = rangeText(filter);
  const narrowed = [
    filter?.values && `${filter.values.length} value${filter.values.length === 1 ? '' : 's'} shown`,
    range,
    sorted,
  ].filter(Boolean).join(' · ');

  const placeMenu = (e) => {
    const at = e.currentTarget.getBoundingClientRect();
    const area = e.currentTarget.closest('[data-table-scroll]')?.getBoundingClientRect();
    const right = Math.min(area ? area.right : window.innerWidth, window.innerWidth);
    const left = Math.max(area ? area.left : 0, 0);
    const width = Math.min(wide ? WIDE_WIDTH : MENU_WIDTH, window.innerWidth - 32);
    // Spread to the right; a column near the end spreads left instead — and
    // when neither side has room, the side with more of it.
    const roomRight = right - at.left;
    const roomLeft = at.right - left;
    setAlign(roomRight >= width ? 'left' : roomLeft >= width || roomLeft > roomRight ? 'right' : 'left');
  };

  return (
    <Popover
      align={align}
      onOpenChange={onOpenChange}
      trigger={() => (
        <button
          type="button"
          onClick={placeMenu}
          className={`rounded p-0.5 transition-colors ${highlight
            ? (active || sortDir ? 'bg-neg text-white' : 'text-neg hover:bg-neg/10')
            : `${onDark ? 'hover:bg-white/15' : 'hover:bg-card-hover'} ${active || sortDir ? 'text-action' : onDark ? 'text-white/60 hover:text-white' : 'text-subtle'}`
          }`}
          aria-label={`Filter ${label}`}
          title={active
            ? `Filtered — ${narrowed}`
            : sorted ? `${label} — ${sorted}` : `Sort / filter ${label}`}
        >
          <Filter size={size} fill={active ? 'currentColor' : 'none'} />
        </button>
      )}
    >
      {(close) => (
        <ColumnFilterMenu
          label={label}
          getOptions={getOptions}
          selected={filter?.values || null}
          getRange={getRange}
          range={range ? filter : null}
          onApply={onChange}
          onClose={close}
          sortDir={sortDir}
          onSort={onSort}
          columns={wide ? 3 : 1}
        />
      )}
    </Popover>
  );
}
