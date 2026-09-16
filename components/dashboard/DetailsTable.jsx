'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ColumnHeaderCell from './ColumnHeaderCell';

// Template-driven details table. `columns` = resolved header defs
// ({ id, name, format, signed, primitive }) in display order; `rows` =
// resolveTemplate().tableRows ({ key, company, cells: { [headerId]: {
// raw, display } } }). First real header column is sticky/linked, rest
// sortable + per-column filterable.
//
// Two extra columns aren't part of the template config — they're rendered
// unconditionally by this component: a "Company" column always pinned at
// the very start (read-only — shows the brand tag every row was uploaded
// with; `companyControl` in its header lets the user pick/create the brand
// new uploads get tagged with, same list the toolbar's BrandPicker uses),
// and a "Cost" input column injected immediately after whichever header is
// bound to the `sku` engine primitive, if any — a per-SKU unit-cost the
// user can type directly instead of only via the SKU-cost sheet upload.
//
// Row selection (the checkboxes) is controlled from DashboardWorkspace, not
// local state — the header bar's Delete button acts on `selectedKeys`
// regardless of which tab/table it was checked in.
//
// `dirtyKeys` (a Set of row keys, e.g. SKUs with a just-typed Cost) tints a
// row light blue — "edited, not saved yet". It clears back to normal once
// DashboardWorkspace's debounced save actually succeeds; for a signed-out
// user nothing ever saves, so it correctly stays on.
//
// Paginated client-side — `PAGE_SIZE` rows at a time, with Prev/Next + a
// page-size picker in the footer. The page resets whenever the underlying
// row set, a filter, or the sort changes, so it never gets stuck showing an
// out-of-range empty page.
const PAGE_SIZES = [25, 50, 100];

export default function DetailsTable({
  columns = [], rows = [], editMode = false, arrange, costBySku = {}, onCostChange, companyControl = null,
  selectedKeys, onToggleRow = () => {}, onToggleAll = () => {}, dirtyKeys,
}) {
  const cols = columns.map((h, i) => ({
    id: h.id,
    key: h.id,
    label: h.name,
    type: h.format === 'text' ? 'text' : 'num',
    sticky: i === 0,
    signed: !!h.signed,
    isSku: h.primitive === 'sku',
  }));

  const showCost = cols.some((c) => c.isSku);
  const displayCols = [{ id: '__company__', key: '__company__', kind: 'company' }];
  for (const c of cols) {
    displayCols.push({ ...c, kind: 'header' });
    if (c.isSku && showCost) displayCols.push({ id: '__cost__', key: '__cost__', kind: 'cost' });
  }

  const [sort, setSort] = useState(null); // { key, dir }
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const selected = selectedKeys || new Set();
  const dirty = dirtyKeys || new Set();

  const view = useMemo(() => {
    let out = rows.filter((r) =>
      Object.entries(filters).every(([key, f]) => {
        if (!f) return true;
        const raw = r.cells[key]?.raw;
        if (f.op === 'contains') return String(raw ?? '').toLowerCase().includes(String(f.a).toLowerCase());
        const n = Number(raw) || 0;
        if (f.a != null && n < f.a) return false;
        if (f.b != null && n > f.b) return false;
        return true;
      }),
    );
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
  }, [rows, filters, sort]);

  // Reset to page 1 whenever the filtered/sorted set changes shape, so a
  // filter that shrinks the result set can't strand the view on an
  // out-of-range page.
  useEffect(() => { setPage(1); }, [rows, filters, sort, pageSize]);

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
    <div className="overflow-hidden rounded-xl border border-divider bg-background">
      <div className="max-h-[65vh] overflow-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-divider">
              <th className="sticky top-0 z-10 w-10 bg-th px-3 py-2.5">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-[var(--color-action)]" aria-label="Select all rows" />
              </th>
              {displayCols.map((col) => {
                if (col.kind === 'company') {
                  return (
                    <th key="__company__" className="sticky top-0 z-10 bg-th px-3 py-2.5 text-left font-bold text-muted whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span>Company</span>
                        {companyControl}
                      </div>
                    </th>
                  );
                }
                if (col.kind === 'cost') {
                  return (
                    <th key="__cost__" className="sticky top-0 z-10 bg-th px-3 py-2.5 text-left font-bold text-muted whitespace-nowrap">
                      Cost
                    </th>
                  );
                }
                return (
                  <th key={col.key} className="sticky top-0 z-10 bg-th px-3 py-2.5 text-left font-bold text-muted whitespace-nowrap">
                    <ColumnHeaderCell
                      col={col}
                      sort={sort}
                      onSortChange={setSort}
                      filter={filters[col.key]}
                      onFilterChange={(f) => setFilters((prev) => ({ ...prev, [col.key]: f }))}
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
                className={`border-t border-divider transition-colors hover:bg-card-hover ${dirty.has(r.key) ? 'bg-link/10' : ''}`}
                title={dirty.has(r.key) ? 'Edited — not saved yet' : undefined}
              >
                <td className="px-3 py-2.5">
                  <input type="checkbox" checked={selected.has(r.key)} onChange={() => toggleOne(r.key)} className="accent-[var(--color-action)]" aria-label={`Select ${r.key}`} />
                </td>
                {displayCols.map((col) => {
                  if (col.kind === 'company') {
                    return (
                      <td key="__company__" className="px-3 py-2.5 whitespace-nowrap text-muted">
                        {r.company || '—'}
                      </td>
                    );
                  }
                  if (col.kind === 'cost') {
                    const val = costBySku[r.key];
                    return (
                      <td key="__cost__" className="px-3 py-2.5 whitespace-nowrap">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          value={val ?? ''}
                          onChange={(e) => onCostChange?.(r.key, e.target.value)}
                          placeholder="—"
                          aria-label={`Cost for ${r.key}`}
                          className="w-24 rounded-lg border border-divider bg-background px-2 py-1 text-sm focus:border-accent focus:outline-none"
                        />
                      </td>
                    );
                  }
                  const cell = r.cells[col.key] || {};
                  const neg = col.signed && Number(cell.raw) < 0;
                  return (
                    <td
                      key={col.key}
                      className={`px-3 py-2.5 whitespace-nowrap ${
                        col.sticky
                          ? 'font-medium text-link underline decoration-link/30'
                          : neg
                          ? 'text-neg'
                          : 'text-foreground'
                      }`}
                    >
                      {cell.display ?? ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider px-3 py-2 text-xs text-subtle">
        <span>
          {view.length === 0 ? '0 rows' : `${pageStart + 1}–${Math.min(pageStart + pageSize, view.length)} of ${view.length} row${view.length === 1 ? '' : 's'}`}
          {selected.size > 0 && ` · ${selected.size} selected`}
        </span>

        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            aria-label="Rows per page"
            className="rounded-lg border border-divider-light bg-background px-1.5 py-1 text-xs text-foreground focus:border-accent focus:outline-none"
          >
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            aria-label="Previous page"
            className="rounded-lg border border-divider-light p-1 text-muted transition-colors hover:bg-card-hover disabled:opacity-40"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="tabular-nums text-foreground">Page {currentPage} of {pageCount}</span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={currentPage >= pageCount}
            aria-label="Next page"
            className="rounded-lg border border-divider-light p-1 text-muted transition-colors hover:bg-card-hover disabled:opacity-40"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
