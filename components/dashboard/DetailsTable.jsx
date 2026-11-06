'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import ColumnHeaderCell from './ColumnHeaderCell';
import CostCell from './CostCell';
import { ReasonInput, ReviewSelect } from './ReviewCells';
import styles from './DataTable.module.css';
import TableText from './TableText';
import TablePager, { DEFAULT_PAGE_SIZE } from './TablePager';
import useCostFill from './useCostFill';
import useFillHeight from './useFillHeight';
import useHeldOrder from './useHeldOrder';
import { HL_CELL, HL_HEAD, isHighlighted, usePreviewHighlight } from './previewHighlight';
import { activeFilters, cellNumber, cellPasses, cellText, columnOptions, columnRange, isNumberHeader } from '@/lib/profitLoss/columnFilter';
import { costCellKey, costFieldOf, isRealSku, isTextCostField, rowCostKey } from '@/lib/profitLoss/skuCosts';
import { tableTotals } from '@/lib/profitLoss/tableTotals';
import { REVIEW_KEY, isReviewField } from '@/data/fixedHeaders';

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
// (Product Cost), Product GST In, Final Product Cost, Office Expense (Per Order)
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
// `review` = { onChange(cells, patch) } makes the Review / Reason columns
// (data/fixedHeaders.js) editable — only on a table whose row IS one
// transaction (Transactions): a Yes / No pick, and a reason box that opens
// once it is Yes. `patch` = { review: 'yes' | 'no' } or { reviewReason }.
// Elsewhere they show as text (a SKU's Review reads "3/10 Yes").
//
// `loadChildren(rowKey)` → a Promise of that row's own transactions (rows
// with the same cells). A row stands for many orders, so a column whose
// orders differ shows "first +N more"; clicking such a cell opens the row
// like a hierarchy — its transactions listed under it, one each, every
// column at its own value — and clicking again closes it. Opened rows close
// when the table's rows are worked out again (a filter, a cost, an upload).
//
// Row selection (the checkboxes) is controlled by the caller, not local
// state, and only shown when it passes `selectedKeys` — the dashboard
// doesn't (saved rows are deleted in Position Settings › Orders).
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
// sort changes, so it never gets stuck showing an out-of-range empty page —
// not when only values change (a cost typed), which would throw the user
// back to page 1 mid-edit.
//
// Typing a cost keeps every row where it is (useHeldOrder): the default
// order (biggest P&L first — engine.js), a column's sort and a filter would
// otherwise move the edited row away, or drop it. The rows stay in that
// order until the user sorts, filters, or presses "Sort rows again" — which
// shows once the order is out of date.

// "first value +N more" — a column whose orders differ in this row.
const MORE_RE = /\s\+\d+ more$/;
// How many of an opened row's transactions are listed under it at most.
const CHILD_LIMIT = 200;

// One opened row's transactions, under it: indented, tinted, read-only.
function ChildRows({ state, cols, selectable, colSpan }) {
  if (state.status !== 'done') {
    return (
      <tr data-child="true">
        <td colSpan={colSpan} className="px-3 py-2 text-[12px] text-muted">
          {state.status === 'loading'
            ? <span className="inline-flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Opening…</span>
            : <span className="text-neg">Could not open this row — try again.</span>}
        </td>
      </tr>
    );
  }
  const shown = state.rows.slice(0, CHILD_LIMIT);
  return (
    <>
      {shown.map((child) => (
        <tr key={child.key} data-child="true" className="text-[12.5px]">
          {selectable && <td aria-hidden="true" />}
          {cols.map((col, i) => {
            if (col.kind === 'cost') return <td key="__cost__" />;
            const cell = child.cells[col.key] || {};
            const neg = col.signed && Number(cell.raw) < 0;
            return (
              <td key={col.key} className={`px-3 py-1.5 whitespace-nowrap ${neg ? 'text-neg' : 'text-foreground'} ${i === 0 ? 'border-l-4 border-l-link/50 pl-5' : ''}`}>
                <TableText>{cell.display ?? ''}</TableText>
              </td>
            );
          })}
        </tr>
      ))}
      {state.rows.length > CHILD_LIMIT && (
        <tr data-child="true">
          <td colSpan={colSpan} className="px-3 py-1.5 text-[12px] text-muted">
            Showing {CHILD_LIMIT} of {state.rows.length} — the Transactions page lists every one.
          </td>
        </tr>
      )}
      {!state.rows.length && (
        <tr data-child="true">
          <td colSpan={colSpan} className="px-3 py-1.5 text-[12px] text-muted">No orders to show for this row.</td>
        </tr>
      )}
    </>
  );
}

export default function DetailsTable({
  columns = [], rows = [], editMode = false, arrange, skuCosts = {}, onCostChange, onCostFill,
  selectedKeys, onToggleRow = () => {}, onToggleAll = () => {}, dirtyKeys, dirtyCostCells, disableCostColumn = false, totalCount = null,
  pagerSlot = null, fillHeight = false, review = null, loadChildren = null,
  // Every header of the template — what a ratio formula's Total reads
  // (lib/profitLoss/tableTotals.js); defaults to just the columns shown.
  headers = null,
  // The tab's own Total-row rules ({ [headerId]: { mode, formula } } —
  // tableTotals.js); none = Auto for every column.
  totalRules = null,
}) {
  const cols = columns.map((h, i) => ({
    id: h.id,
    key: h.id,
    label: h.name,
    description: h.description || '',
    type: h.format === 'text' ? 'text' : 'num',
    numeric: isNumberHeader(h),
    sticky: i === 0,
    signed: !!h.signed,
    isSku: h.primitive === 'sku',
    costField: disableCostColumn ? null : costFieldOf(h),
    reviewField: review && isReviewField(h) ? h.fixedKey : null,
  }));
  // The row's own Review, which the Reason box opens on — read off the row
  // even when the Review column itself isn't shown.
  const reviewId = review ? (columns.find((h) => h.fixedKey === REVIEW_KEY)?.id ?? review.headerId ?? null) : null;

  // A cost input keyed by SKU only makes sense on a table actually grouped
  // by SKU — never on a per-transaction table (see resolveTransactionRows),
  // where the row key is an Order Id, not a SKU. The injected one steps
  // aside when the COGS header's own column is here to type into.
  const showCost = !disableCostColumn && cols.some((c) => c.isSku) && !cols.some((c) => c.costField === 'cogs');
  const dirtyCells = dirtyCostCells || new Set();
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
  const selectable = !!selectedKeys;
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

  const fresh = useMemo(() => {
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
  const order = useHeldOrder(rows, fresh);
  const view = order.view;
  // A sort or filter the user picks is a new order — the held one goes.
  const changeSort = (next) => { order.release(); setSort(next); };
  const changeFilters = (update) => { order.release(); setFilters(update); };

  const startFill = useCostFill(onCostFill && ((field, skus, text) => { order.hold(); onCostFill(field, skus, text); })); // Excel's fill handle on the cost boxes
  // A row's box edits its Account Name's value when the row is one account
  // (rowCostKey), else its SKU's for every account — and shows the SKU's
  // value greyed when that account has none of its own.
  const costInput = (row, field, name) => {
    const sku = rowCostKey(row.key, row.company);
    const account = sku !== row.key ? ` (${row.company})` : '';
    return (
      <CostCell
        value={skuCosts[sku]?.[field]}
        fallback={account ? skuCosts[row.key]?.[field] : null}
        onCommit={onCostChange && ((text) => { order.hold(); onCostChange(sku, field, text); })}
        dirty={dirtyCells.has(costCellKey(sku, field))}
        label={`${name} for ${row.key}${account}`}
        text={isTextCostField(field)}
        fill={onCostFill ? { col: field, sku, start: startFill } : null}
      />
    );
  };

  // The Total row: every filtered row, every page — not just this one.
  const totals = useMemo(() => tableTotals(headers || columns, view, columns.map((h) => h.id), totalRules), [headers, columns, view, totalRules]);

  // Reset to page 1 whenever the filtered/sorted set changes shape, so a
  // filter that shrinks the result set can't strand the view on an
  // out-of-range page.
  useEffect(() => { (() => setPage(1))(); }, [order.rowSet, filters, sort, pageSize]);

  const pageCount = Math.max(1, Math.ceil(view.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = view.slice(pageStart, pageStart + pageSize);

  // Opened rows: key → { status: 'loading' | 'done' | 'error', rows }.
  const [opened, setOpened] = useState(() => new Map());
  useEffect(() => { (() => setOpened(new Map()))(); }, [rows]);
  // Rows the user closed — every other "+N more" row on the page opens by
  // itself (below), and one closed by hand stays closed.
  const [closedByUser, setClosedByUser] = useState(() => new Set());
  const openChildren = (key) => {
    setOpened((cur) => new Map(cur).set(key, { status: 'loading', rows: [] }));
    loadChildren(key).then(
      (kids) => setOpened((cur) => (cur.has(key) ? new Map(cur).set(key, { status: 'done', rows: kids }) : cur)),
      () => setOpened((cur) => (cur.has(key) ? new Map(cur).set(key, { status: 'error', rows: [] }) : cur)),
    );
  };
  const toggleChildren = (key) => {
    if (opened.has(key)) {
      setOpened((cur) => { const next = new Map(cur); next.delete(key); return next; });
      setClosedByUser((cur) => new Set(cur).add(key));
      return;
    }
    setClosedByUser((cur) => { const next = new Set(cur); next.delete(key); return next; });
    openChildren(key);
  };
  // Open by default: every row on THIS page with a "+N more" cell in a
  // shown column (just this page — opening thousands of rows at once would
  // be all work and no view). Rows asked for together load as one job
  // (DashboardWorkspace loadRowChildren).
  const autoOpenKeys = loadChildren
    ? pageRows
      .filter((r) => !opened.has(r.key) && !closedByUser.has(r.key))
      .filter((r) => displayCols.some((c) => c.kind === 'header' && !c.costField && !c.reviewField && MORE_RE.test(String(r.cells[c.key]?.display ?? ''))))
      .map((r) => r.key)
    : [];
  const autoOpenSig = autoOpenKeys.join('\u0000');
  useEffect(() => {
    if (!autoOpenSig) return;
    autoOpenSig.split('\u0000').forEach(openChildren);
    // openChildren only reads loadChildren, which autoOpenSig already follows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenSig]);
  const colSpan = displayCols.length + (selectable ? 1 : 0);

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
          <button type="button" onClick={() => changeFilters({})} className="font-semibold text-link hover:underline">
            Clear all filters
          </button>
        </div>
      )}
      {order.moved && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider bg-link/10 px-3 py-1.5 text-xs text-foreground">
          <span>Rows stay where they are while you type costs{sort?.key || applied.length ? ' — the sort and filters catch up when you ask' : ''}.</span>
          <button type="button" onClick={() => { order.release(); setPage(1); }} className="font-semibold text-link hover:underline">
            Sort rows again
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
              {selectable && (
                <th className="w-10 bg-[#1565C0] px-1 py-1">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-[var(--color-action)]" aria-label="Select all rows" />
                </th>
              )}
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
                  <th key={col.key} data-preview-hl={hlCol || undefined} className={`group/cell bg-[#1565C0] px-1 py-1 text-center font-medium ${hlCol ? HL_HEAD : 'text-white'}`}>
                    <ColumnHeaderCell
                      col={col}
                      sort={sort}
                      onSortChange={changeSort}
                      filter={filters[col.key]}
                      onFilterChange={(f) => changeFilters((prev) => ({ ...prev, [col.key]: f }))}
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
                {selectable && <td className={TOTAL_CELL} />}
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
                <td colSpan={displayCols.length + (selectable ? 1 : 0)} className="px-4 py-10 text-center text-sm text-muted">
                  {rows.length === 0 ? 'No data yet — upload a sheet to see rows here.' : 'No rows match the current filters.'}
                </td>
              </tr>
            )}
            {pageRows.map((r) => (
              <Fragment key={r.key}>
              <tr
                data-selected={selected.has(r.key)}
                data-dirty={dirty.has(r.key)}
                className="transition-colors"
                title={dirty.has(r.key) ? 'Edited — not saved yet' : undefined}
              >
                {selectable && (
                  <td className="px-3 py-2.5">
                    <input type="checkbox" checked={selected.has(r.key)} onChange={() => toggleOne(r.key)} className="accent-[var(--color-action)]" aria-label={`Select ${r.key}`} />
                  </td>
                )}
                {displayCols.map((col) => {
                  if (col.kind === 'cost') {
                    return (
                      <td key="__cost__" className="px-3 py-2.5 whitespace-nowrap">
                        {isRealSku(r.key) && costInput(r, 'cogs', 'Cost')}
                      </td>
                    );
                  }
                  const cell = r.cells[col.key] || {};
                  if (col.costField && isRealSku(r.key)) {
                    return (
                      <td key={col.key} className={`px-3 py-1.5 whitespace-nowrap ${isHighlighted(hl, 'header', col.id) ? HL_CELL : ''}`}>
                        {costInput(r, col.costField, col.label)}
                      </td>
                    );
                  }
                  if (col.reviewField) {
                    const isYes = r.cells[reviewId]?.raw === 'Yes';
                    return (
                      <td key={col.key} className="px-3 py-1.5 whitespace-nowrap">
                        {col.reviewField === REVIEW_KEY
                          ? <ReviewSelect value={cell.raw} label={`${col.label} for ${r.key}`} onChange={(v) => review.onChange(r.cells, { review: v })} />
                          : <ReasonInput key={`${r.key}:${isYes}`} value={cell.raw} enabled={isYes} label={`${col.label} for ${r.key}`} onCommit={(text) => review.onChange(r.cells, { reviewReason: text.trim() })} />}
                      </td>
                    );
                  }
                  const neg = col.signed && Number(cell.raw) < 0;
                  const many = !!loadChildren && MORE_RE.test(String(cell.display ?? ''));
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
                      {many ? (
                        <button
                          type="button"
                          onClick={() => toggleChildren(r.key)}
                          aria-expanded={opened.has(r.key)}
                          title={opened.has(r.key) ? 'Close this row' : 'Open this row — every order in it, one row each'}
                          className="inline-flex items-center gap-1 rounded px-1 text-link hover:bg-link/10"
                        >
                          {opened.has(r.key) ? <ChevronDown size={13} className="shrink-0" /> : <ChevronRight size={13} className="shrink-0" />}
                          <TableText>{cell.display}</TableText>
                        </button>
                      ) : <TableText>{cell.display ?? ''}</TableText>}
                    </td>
                  );
                })}
              </tr>
              {opened.has(r.key) && (
                <ChildRows state={opened.get(r.key)} cols={displayCols} selectable={selectable} colSpan={colSpan} />
              )}
              </Fragment>
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
