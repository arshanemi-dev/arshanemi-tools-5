'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ColumnHeaderCell from './ColumnHeaderCell';
import { levelStyle } from './overviewLevelStyles';
import { HL_CELL, HL_HEAD, isHighlighted, usePreviewHighlight } from './previewHighlight';
import { TREE_COL, ancestorKeys, filterTree, indexPathOf, sortTree } from '@/lib/profitLoss/overviewTree';

const PAGE_SIZES = [25, 50, 100];
const CHILD_PAGE = 100; // children rendered per open node before "Show more"

function matchesFilter(node, key, f) {
  const raw = key === TREE_COL ? node.value : node.cells[key]?.raw;
  if (f.op === 'contains') return String(raw ?? '').toLowerCase().includes(String(f.a).toLowerCase());
  const n = Number(raw) || 0;
  if (f.a != null && n < f.a) return false;
  if (f.b != null && n > f.b) return false;
  return true;
}

// The Overview tab's right-hand table — DetailsTable's look and features
// (Company column, Cost input, row checkboxes, sort/filter per column,
// edit-mode arrange, pagination) but over the unique-value hierarchy: every
// Level-1 value is a row, and opening it (here or in the left
// OverviewHierarchyNav — they share `expanded`) reveals its Level-2 rows
// underneath, tinted in that level's colour, and so on down. Parent rows are
// subtotals of their children. Sort orders siblings within each level;
// filters keep a row when it or anything beneath it matches, with the path
// to a deeper match opened automatically. Pagination is over Level-1 rows.
// Checking a parent row selects its whole branch (its children show as
// included) — DashboardWorkspace's delete matches raw rows by path prefix.
export default function OverviewTreeTable({
  levels = [], columns = [], tree = [], expanded, onToggle, activeKey, focusTick = 0, onActivate,
  editMode = false, arrange, costBySku = {}, onCostChange, companyControl = null,
  selectedKeys, onToggleRow = () => {}, onToggleAll = () => {}, dirtyKeys,
}) {
  const [sort, setSort] = useState(null);
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [childLimits, setChildLimits] = useState({});
  const scrollRef = useRef(null);
  const selected = selectedKeys || new Set();
  const dirty = dirtyKeys || new Set();
  const hl = usePreviewHighlight();
  // A header picked in the builder lights up its column — or the hierarchy
  // column when it's one of the levels.
  const hlHead = (col) => (col.key === TREE_COL
    ? levels.some((h) => isHighlighted(hl, 'header', h.id))
    : isHighlighted(hl, 'header', col.id));

  const activeFilters = Object.entries(filters).filter(([, f]) => f);
  const filtering = activeFilters.length > 0;
  const view = useMemo(() => {
    const live = Object.entries(filters).filter(([, f]) => f);
    const kept = live.length ? filterTree(tree, (n) => live.every(([k, f]) => matchesFilter(n, k, f))) : tree;
    return sortTree(kept, sort);
  }, [tree, filters, sort]);

  const pageCount = Math.max(1, Math.ceil(view.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const pageNodes = view.slice(pageStart, pageStart + pageSize);

  // A node focused from the hierarchy nav may sit on another page, or past
  // its parent's "Show more" cut — jump there. Adjusting state while
  // rendering (keyed off the focus tick) instead of in an effect, so the
  // scroll effect below already sees the right page.
  const [seenTick, setSeenTick] = useState(focusTick);
  if (focusTick !== seenTick) {
    setSeenTick(focusTick);
    const idx = activeKey ? indexPathOf(view, activeKey) : null;
    if (idx) {
      setPage(Math.floor(idx[0] / pageSize) + 1);
      const parents = ancestorKeys(activeKey);
      setChildLimits((prev) => {
        const next = { ...prev };
        parents.forEach((parent, d) => {
          const i = idx[d + 1];
          if (i >= (next[parent] || CHILD_PAGE)) next[parent] = (Math.floor(i / CHILD_PAGE) + 1) * CHILD_PAGE;
        });
        return next;
      });
    }
  }

  useEffect(() => {
    if (!focusTick || !activeKey || typeof CSS === 'undefined') return;
    scrollRef.current
      ?.querySelector(`[data-row-key="${CSS.escape(activeKey)}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusTick, activeKey]);

  // Visible rows = this page's Level-1 nodes + every open descendant.
  const isOpen = (n) => n.children?.length > 0 && (expanded.has(n.key) || (filtering && n.openedByMatch));
  const visible = [];
  const walk = (nodes, parentKey) => {
    const limit = parentKey ? childLimits[parentKey] || CHILD_PAGE : nodes.length;
    for (const n of nodes.slice(0, limit)) {
      visible.push({ kind: 'node', node: n });
      if (isOpen(n)) walk(n.children, n.key);
    }
    if (nodes.length > limit) visible.push({ kind: 'more', parentKey, depth: nodes[0].depth, limit, rest: nodes.length - limit });
  };
  walk(pageNodes, null);

  const skuLevels = new Set(levels.map((h, i) => (h.primitive === 'sku' ? i : -1)).filter((i) => i >= 0));
  const showCost = skuLevels.size > 0;
  const treeCol = { key: TREE_COL, id: TREE_COL, label: levels.map((h) => h.name).join(' › ') || 'Hierarchy', type: 'text' };
  const cols = columns.map((h) => ({ id: h.id, key: h.id, label: h.name, type: h.format === 'text' ? 'text' : 'num', signed: !!h.signed }));
  const colSpan = cols.length + (showCost ? 4 : 3);

  const resetPaging = () => setPage(1);
  const allChecked = pageNodes.length > 0 && pageNodes.every((n) => selected.has(n.key));
  const nodeTotal = useMemo(() => {
    let c = 0;
    const count = (list) => { for (const n of list) { c += 1; count(n.children || []); } };
    count(view);
    return c;
  }, [view]);

  const headCell = (col, extra = '') => (
    <th key={col.key} data-preview-hl={hlHead(col) || undefined} className={`sticky top-0 z-10 bg-th px-3 py-2.5 text-left font-bold whitespace-nowrap ${hlHead(col) ? HL_HEAD : 'text-muted'} ${extra}`}>
      <ColumnHeaderCell
        col={col}
        sort={sort}
        onSortChange={(s) => { setSort(s); resetPaging(); }}
        filter={filters[col.key]}
        onFilterChange={(f) => { setFilters((prev) => ({ ...prev, [col.key]: f })); resetPaging(); }}
        editMode={editMode}
        showArrange={editMode && col.key !== TREE_COL}
        items={arrange?.allItems}
        hiddenIds={arrange?.hiddenIds}
        onSwapWith={(targetId) => arrange?.swapWith(col.id, targetId)}
        onHide={() => arrange?.hide(col.id)}
      />
    </th>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-divider bg-background">
      <div ref={scrollRef} className="max-h-[65vh] overflow-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-divider">
              <th className="sticky top-0 z-10 w-10 bg-th px-3 py-2.5">
                <input type="checkbox" checked={allChecked} onChange={() => onToggleAll(pageNodes.map((n) => n.key))} className="accent-[var(--color-action)]" aria-label="Select all rows on this page" />
              </th>
              {headCell(treeCol, 'left-0 z-20 min-w-48')}
              <th className="sticky top-0 z-10 bg-th px-3 py-2.5 text-left font-bold text-muted whitespace-nowrap">
                <div className="flex items-center gap-2"><span>Company</span>{companyControl}</div>
              </th>
              {showCost && <th className="sticky top-0 z-10 bg-th px-3 py-2.5 text-left font-bold text-muted whitespace-nowrap">Cost</th>}
              {cols.map((c) => headCell(c))}
            </tr>
          </thead>
          <tbody>
            {view.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-muted">
                  {tree.length === 0 ? 'No data yet — upload a sheet to see rows here.' : 'No rows match the current filters.'}
                </td>
              </tr>
            )}
            {visible.map((item) => {
              if (item.kind === 'more') {
                const st = levelStyle(item.depth);
                return (
                  <tr key={`more:${item.parentKey}`} className="border-t border-divider">
                    <td />
                    <td colSpan={colSpan - 1} className="p-0">
                      <button
                        type="button"
                        onClick={() => setChildLimits((prev) => ({ ...prev, [item.parentKey]: item.limit + CHILD_PAGE }))}
                        className={`w-full border-l-4 py-1.5 pr-3 text-left text-[12px] font-medium text-link hover:underline ${st.stripe} ${st.indent}`}
                      >
                        Show {Math.min(CHILD_PAGE, item.rest)} more <span className="text-subtle">({item.rest} left)</span>
                      </button>
                    </td>
                  </tr>
                );
              }
              const n = item.node;
              const st = levelStyle(n.depth);
              const hasKids = n.children?.length > 0;
              const open = isOpen(n);
              const forced = filtering && n.openedByMatch;
              const isActive = activeKey === n.key;
              const inherited = !selected.has(n.key) && n.depth > 0 && ancestorKeys(n.key).some((k) => selected.has(k));
              const isSkuRow = skuLevels.has(n.depth);
              const isDirty = isSkuRow && dirty.has(n.value);
              return (
                <tr
                  key={n.key}
                  data-row-key={n.key}
                  className={`border-t border-divider transition-colors ${isDirty ? 'bg-link/10' : isActive ? st.soft : st.tint}`}
                  title={isDirty ? 'Edited — not saved yet' : undefined}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={inherited || selected.has(n.key)}
                      disabled={inherited}
                      onChange={() => onToggleRow(n.key)}
                      title={inherited ? 'Included — its parent row is selected' : undefined}
                      className="accent-[var(--color-action)] disabled:opacity-50"
                      aria-label={`Select ${n.value}`}
                    />
                  </td>
                  <td className="sticky left-0 z-[1] bg-background p-0">
                    <div className={`flex items-center gap-1 border-l-4 py-2 pr-3 ${st.stripe} ${isActive ? st.soft : st.tint} ${st.indent}`}>
                      {hasKids ? (
                        <button
                          type="button"
                          onClick={() => onToggle(n.key)}
                          disabled={forced}
                          aria-label={`${open ? 'Collapse' : 'Expand'} ${n.value}`}
                          aria-expanded={open}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-card-hover disabled:cursor-default"
                        >
                          <ChevronRight size={14} className={`transition-transform duration-150 ${open ? 'rotate-90' : ''} ${st.text}`} />
                        </button>
                      ) : (
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center"><span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} /></span>
                      )}
                      <button
                        type="button"
                        onClick={() => onActivate(n.key)}
                        title={`${levels[n.depth]?.name || `Level ${n.depth + 1}`}: ${n.value}`}
                        className={`truncate text-left ${hasKids ? 'font-semibold' : 'font-medium'} ${isActive ? st.text : 'text-foreground'}`}
                      >
                        {n.value}
                      </button>
                      {hasKids && (
                        <span className={`ml-1 shrink-0 rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${st.badge}`}>{n.children.length}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted">{n.company || '—'}</td>
                  {showCost && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      {isSkuRow && (
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          value={costBySku[n.value] ?? ''}
                          onChange={(e) => onCostChange?.(n.value, e.target.value)}
                          placeholder="—"
                          aria-label={`Cost for ${n.value}`}
                          className="w-24 rounded-lg border border-divider bg-background px-2 py-1 text-sm focus:border-accent focus:outline-none"
                        />
                      )}
                    </td>
                  )}
                  {cols.map((c) => {
                    const cell = n.cells[c.key] || {};
                    const neg = c.signed && Number(cell.raw) < 0;
                    return (
                      <td key={c.key} className={`px-3 py-2 whitespace-nowrap tabular-nums ${hasKids ? 'font-semibold' : ''} ${neg ? 'text-neg' : 'text-foreground'} ${isHighlighted(hl, 'header', c.id) ? HL_CELL : ''}`}>
                        {cell.display ?? ''}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider px-3 py-2 text-xs text-subtle">
        <span>
          {view.length === 0
            ? '0 rows'
            : `${pageStart + 1}–${Math.min(pageStart + pageSize, view.length)} of ${view.length} ${levels[0]?.name || 'row'}${levels.length > 1 ? ` · ${nodeTotal} rows across ${levels.length} levels` : ''}`}
          {selected.size > 0 && ` · ${selected.size} selected`}
        </span>
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); resetPaging(); }}
            aria-label="Rows per page"
            className="rounded-lg border border-divider-light bg-background px-1.5 py-1 text-xs text-foreground focus:border-accent focus:outline-none"
          >
            {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} / page</option>)}
          </select>
          <button type="button" onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1} aria-label="Previous page" className="rounded-lg border border-divider-light p-1 text-muted transition-colors hover:bg-card-hover disabled:opacity-40">
            <ChevronLeft size={14} />
          </button>
          <span className="tabular-nums text-foreground">Page {currentPage} of {pageCount}</span>
          <button type="button" onClick={() => setPage(Math.min(pageCount, currentPage + 1))} disabled={currentPage >= pageCount} aria-label="Next page" className="rounded-lg border border-divider-light p-1 text-muted transition-colors hover:bg-card-hover disabled:opacity-40">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
