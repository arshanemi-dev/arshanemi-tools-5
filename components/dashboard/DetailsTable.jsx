'use client';

import { useEffect, useMemo, useState } from 'react';
import ColumnHeaderCell from './ColumnHeaderCell';
import CostCell from './CostCell';
import styles from './DataTable.module.css';
import TableText from './TableText';
import TablePager, { DEFAULT_PAGE_SIZE } from './TablePager';
import useCostFill from './useCostFill';
import useFillHeight from './useFillHeight';
import { HL_CELL, HL_HEAD, isHighlighted, usePreviewHighlight } from './previewHighlight';
import { activeFilters, cellNumber, cellPasses, cellText, columnOptions, columnRange, isNumberHeader } from '@/lib/profitLoss/columnFilter';
import { costCellKey, costFieldOf, isRealSku } from '@/lib/profitLoss/skuCosts';
import { tableTotals } from '@/lib/profitLoss/tableTotals';

// The Total row's cells — black on light green, right under the blue header row, pinned with it.
const TOTAL_CELL = 'bg-[#dcfce7] px-3 py-2 font-semibold text-black whitespace-nowrap';
const TOTAL_VALUE = 'bg-[#dcfce7] px-3 py-2 font-semibold whitespace-nowrap'; // its colour set per value — black, or red when negative

// Template-driven details table. `columns` = resolved header defs
// ({ id, name, type, format, signed, primitive }) in display order; `rows` =
// resolveTemplate().tableRows ({ key, company, cells: { [headerId]: {
// raw, display } } }). First real header column is sticky/linked; every
// column sorts and has a spreadsheet-style filter (search + tick the values
// to keep, and on a number column a Min / Max range — ColumnHeaderCell /
// lib/profitLoss/columnFilter.js). A column's checklist and range offer what
// the OTHER columns' filters leave, the way a sheet does.
//
// Only the template's own columns show — the upload's "MarketPlace_Brand"
// tag is the built-in "Account Name" header (data/fixedHeaders.js), there
// when a tab picks it.
//
// Costs are typed in the table itself, per SKU, instead of only via the SKU
// Cost sheet upload: the column of each of the four cost headers (COGS
// (Product Cost), Cost GST in, Final Product Cost, Other Expense (per order)
// — costFieldOf) is an input box on every SKU's row (CostCell — it saves by
// itself, one cost at a time). The box holds the SKU's DEFAULT (`skuCosts` =
// { [sku]: { cogs, costGst, finalCost, otherExpense } }) — what the next
// upload is priced at; the column's own cell, shown beside it, adds up what
// the SKU's orders actually carry. `onCostChange(sku, field, text)`; a box's
// fill handle copies its value into the rows dragged over, Excel-style
// (`onCostFill(field, skus, text)` — useCostFill.js). While the
// COGS header isn't one of the columns, a "Cost" input for it is injected
// right after whichever header is bound to the `sku` engine primitive, if
// any. `disableCostColumn` = the rows aren't SKUs (Transactions, a table
// grouped by something else): no inputs, the cost columns show as numbers.
//
// Row selection (the checkboxes) is controlled from DashboardWorkspace, not
// local state — the header bar's Delete button acts on `selectedKeys`
// regardless of which tab/table it was checked in.
//
// `dirtyKeys` (a Set of row keys — SKUs with a just-typed cost) tints a row
// light blue — "edited, not saved yet" — and `dirtyCostCells` (a Set of
// costCellKey) the exact box. Each goes back to normal once that cost's own
// save succeeds (lib/profitLoss/useSkuCosts.js); for a signed-out
// user nothing ever saves, so it correctly stays on.
//
// Paginated client-side — `pageSize` rows at a time, with Prev/Next + a
// page-size picker (TablePager) in the footer, or wherever `pagerSlot`
// points. The page resets whenever the underlying row set, a filter, or the
// sort changes, so it never gets stuck showing an out-of-range empty page.

export default function DetailsTable({
  columns = [], rows = [], editMode = false, arrange, skuCosts = {}, onCostChange, onCostFill,
  selectedKeys, onToggleRow = () => {}, onToggleAll = () => {}, dirtyKeys, dirtyCostCells, disableCostColumn = false, totalCount = null,
  pagerSlot = null, fillHeight = false,
  // Every header of the template — what a ratio formula's Total reads
  // (lib/profitLoss/tableTotals.js); defaults to just the columns shown.
  headers = null,
}) {
  const cols = columns.map((h, i) => ({
    id: h.id,
    key: h.id,
    label: h.name,
    type: h.format === 'text' ? 'text' : 'num',
    numeric: isNumberHeader(h),
    sticky: i === 0,
    signed: !!h.signed,
    isSku: h.primitive === 'sku',
    costField: disableCostColumn ? null : costFieldOf(h),
  }));

  // A cost input keyed by SKU only makes sense on a table actually grouped
  // by SKU — never on a per-transaction table (see resolveTransactionRows),
  // where the row key is an Order Id, not a SKU. The injected one steps
  // aside when the COGS header's own column is here to type into.
  const showCost = !disableCostColumn && cols.some((c) => c.isSku) && !cols.some((c) => c.costField === 'cogs');
  const dirtyCells = dirtyCostCells || new Set();
  const startFill = useCostFill(onCostFill); // Excel's fill handle on the cost boxes
  const costInput = (sku, field, name, total = null) => (
    <CostCell
      value={skuCosts[sku]?.[field]}
      total={total}
      onCommit={onCostChange && ((text) => onCostChange(sku, field, text))}
      dirty={dirtyCells.has(costCellKey(sku, field))}
      label={`${name} for ${sku}`}
      fill={onCostFill ? { col: field, sku, start: startFill } : null}
    />
  );
  const displayCols = [];
  for (const c of cols) {
    displayCols.push({ ...c, kind: 'header' });
    if (c.isSku && showCost) displayCols.push({ id: '__cost__', key: '__cost__', kind: 'cost' });
  }

  const [sort, setSort] = useState(null); // { key, dir }
  const [filters, setFilters] = useState({}); // { [columnKey]: { values, min, max } | null }
  const [filterOpen, setFilterOpen] = useState(false); // a filter menu is open — the table makes room for it
  const [page, setPage] = useState(1);
  const fillRef = useFillHeight(fillHeight);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const selected = selectedKeys || new Set();
  const dirty = dirtyKeys || new Set();
  const hl = usePreviewHighlight();

  // Only the filters of columns that are on screen count.
  const colKeys = columns.map((h) => h.id).join('\u0000');
  const applied = useMemo(() => activeFilters(filters, colKeys.split('\u0000')), [filters, colKeys]);
  const passes = (r, except = null) => applied.every(([key, f]) => key === except || cellPasses(f, r.cells[key]));
  // One column's checklist: the values in the rows every OTHER filter leaves
  // — and its Min / Max range: the numbers those same rows span.
  const optionsFor = (key) => columnOptions(rows.filter((r) => passes(r, key)), (r) => cellText(r.cells[key]), (r) => r.cells[key]?.raw);
  const rangeFor = (key) => columnRange(rows.filter((r) => passes(r, key)), (r) => cellNumber(r.cells[key]));

  const view = useMemo(() => {
    let out = applied.length
      ? rows.filter((r) => applied.every(([key, f]) => cellPasses(f, r.cells[key])))
      : rows;
    if (sort?.key) {
      const dir = sort.dir === 'asc' ? 1 : -1;
      out = [...out].sort((a, b) => {
        const av = a.cells[sort.key]?.raw;
        const bv = b.cells[sort.key]?.raw;
        if (typeof av === 'string' || typeof bv === 'string') return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
        return ((Number(av) || 0) - (Number(bv) || 0)) * dir;
      });
    }
    return out;
  }, [rows, applied, sort]);

  // The Total row: every filtered row, every page — not just this one.
  const totals = useMemo(() => tableTotals(headers || columns, view, columns.map((h) => h.id)), [headers, columns, view]);

  // Reset to page 1 whenever the filtered/sorted set changes shape, so a
  // filter that shrinks the result set can't strand the view on an
  // out-of-range page.
  useEffect(() => { (() => setPage(1))(); }, [rows, filters, sort, pageSize]);

  const pageCount = Math.max(1, Math.ceil(view.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = view.slice(pageStart, pageStart + pageSize);

  // "Select all" scopes to the current page, like Delete already scopes to
  // whatever's selected — selecting hundreds of off-screen rows in one click
  // would be a surprising way to load the confirm dialog.
  const allChecked = pageRows.length > 0 && pageRows.every((r) => selected.has(r.key));
  const toggleAll = () => onToggleAll(pageRows.map((r) => r.key));
  const toggleOne = (k) => onToggleRow(k);

  if (!cols.length) {
    return (
      <div className="rounded-xl border border-divider bg-background px-4 py-10 text-center text-sm text-muted">
        This tab has no columns yet — add headers to it in Template Settings.
      </div>
    );
  }

  return (
    <div ref={fillRef} className={`rounded-xl border border-divider bg-background ${fillHeight ? 'flex min-h-[var(--page-h,20rem)] grow flex-col overflow-clip' : 'overflow-hidden'}`}>
      {/* fillHeight (the dashboard): always the page's full visible height
          (--page-h, useFillHeight) however many rows there are — once the
          page has scrolled the cards / graphs away it fills the screen,
          pager on the bottom edge. Only the rows scroll, inside it, under
          the pinned (sticky) header and Total rows; the sideways scrollbar
          sits under the last row. */}
      {/* Filters on: say so on the table itself, with a one-click way out. */}
      {applied.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider bg-action-soft px-3 py-1.5 text-xs text-foreground">
          <span>
            {applied.length} filter{applied.length === 1 ? '' : 's'} on — showing <span className="font-semibold">{view.length}</span> of {rows.length} row{rows.length === 1 ? '' : 's'}
          </span>
          <button type="button" onClick={() => setFilters({})} className="font-semibold text-link hover:underline">
            Clear all filters
          </button>
        </div>
      )}
      {/* min-h while a filter menu is open: with only a few rows the menu (taller on a number column — its Min / Max range) would otherwise be cut off by this scroll area */}
      {/* h-0 + grow (fillHeight): the rows never make the table taller — it takes the room it's given and scrolls them */}
      <div data-table-scroll className={`overflow-auto ${fillHeight ? 'h-0 grow' : 'max-h-[65vh]'} ${filterOpen ? 'min-h-[30rem]' : ''}`}>
        <table className={`${styles.table} text-sm`}>
          {/* The whole head is what's pinned (sticky) — the header row and, right
              under it, the Total row — so the two stay together at the top
              whatever height the header labels wrap to. */}
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-divider">
              <th className="w-10 bg-[#1565C0] px-1 py-1">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-[var(--color-action)]" aria-label="Select all rows" />
              </th>
              {displayCols.map((col) => {
                if (col.kind === 'cost') {
                  return (
                    <th key="__cost__" className="bg-[#1565C0] px-1 py-1 text-center font-medium text-white whitespace-nowrap">
                      Cost
                    </th>
                  );
                }
                const hlCol = isHighlighted(hl, 'header', col.id);
                return (
                  <th key={col.key} data-preview-hl={hlCol || undefined} className={`bg-[#1565C0] px-1 py-1 text-center font-medium ${hlCol ? HL_HEAD : 'text-white'}`}>
                    <ColumnHeaderCell
                      col={col}
                      sort={sort}
                      onSortChange={setSort}
                      filter={filters[col.key]}
                      onFilterChange={(f) => setFilters((prev) => ({ ...prev, [col.key]: f }))}
                      getFilterOptions={() => optionsFor(col.key)}
                      getFilterRange={col.numeric ? () => rangeFor(col.key) : null}
                      onFilterOpenChange={setFilterOpen}
                      editMode={editMode}
                      showArrange={editMode && !col.sticky}
                      items={arrange?.allItems}
                      hiddenIds={arrange?.hiddenIds}
                      onSwapWith={(targetId) => arrange?.swapWith(col.id, targetId)}
                      onHide={() => arrange?.hide(col.id)}
                    />
                  </th>
                );
              })}
            </tr>
            {view.length > 0 && (
              <tr>
                <td className={TOTAL_CELL} />
                {displayCols.map((col, i) => {
                  if (col.kind === 'cost') return <td key="__cost__" className={TOTAL_CELL} />;
                  if (i === 0) return <td key={col.key} className={`${TOTAL_CELL} text-center uppercase tracking-wide`}>Total</td>;
                  const t = totals[col.key];
                  const neg = col.signed && Number(t?.raw) < 0;
                  return (
                    <td key={col.key} className={`${TOTAL_VALUE} text-center tabular-nums ${neg ? 'text-[#b91c1c]' : 'text-black'}`}>
                      <TableText>{t?.display ?? ''}</TableText>
                    </td>
                  );
                })}
              </tr>
            )}
          </thead>
          <tbody>
            {view.length === 0 && (
              <tr>
                <td colSpan={displayCols.length + 1} className="px-4 py-10 text-center text-sm text-muted">
                  {rows.length === 0 ? 'No data yet — upload a sheet to see rows here.' : 'No rows match the current filters.'}
                </td>
              </tr>
            )}
            {pageRows.map((r) => (
              <tr
                key={r.key}
                data-selected={selected.has(r.key)}
                data-dirty={dirty.has(r.key)}
                className="transition-colors"
                title={dirty.has(r.key) ? 'Edited — not saved yet' : undefined}
              >
                <td className="px-3 py-2.5">
                  <input type="checkbox" checked={selected.has(r.key)} onChange={() => toggleOne(r.key)} className="accent-[var(--color-action)]" aria-label={`Select ${r.key}`} />
                </td>
                {displayCols.map((col) => {
                  if (col.kind === 'cost') {
                    return (
                      <td key="__cost__" className="px-3 py-2.5 whitespace-nowrap">
                        {isRealSku(r.key) && costInput(r.key, 'cogs', 'Cost')}
                      </td>
                    );
                  }
                  const cell = r.cells[col.key] || {};
                  if (col.costField && isRealSku(r.key)) {
                    return (
                      <td key={col.key} className={`px-3 py-1.5 whitespace-nowrap ${isHighlighted(hl, 'header', col.id) ? HL_CELL : ''}`}>
                        {costInput(r.key, col.costField, col.label, cell)}
                      </td>
                    );
                  }
                  const neg = col.signed && Number(cell.raw) < 0;
                  return (
                    <td
                      key={col.key}
                      className={`px-3 py-2.5 whitespace-nowrap ${isHighlighted(hl, 'header', col.id) ? HL_CELL : ''} ${
                        col.sticky
                          ? 'font-medium text-link underline decoration-link/30'
                          : neg
                          ? 'text-neg'
                          : 'text-foreground'
                      }`}
                    >
                      <TableText>{cell.display ?? ''}</TableText>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePager
        slot={pagerSlot}
        summary={(
          <>
            {view.length === 0 ? '0 rows' : `${pageStart + 1}–${Math.min(pageStart + pageSize, view.length)} of ${view.length} row${view.length === 1 ? '' : 's'}`}
            {totalCount != null && totalCount > view.length && (
              <span className="ml-1 font-semibold text-action">(Total: {totalCount} rows)</span>
            )}
            {selected.size > 0 && ` · ${selected.size} selected`}
          </>
        )}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        currentPage={currentPage}
        pageCount={pageCount}
        onPageChange={setPage}
      />
    </div>
  );
}
