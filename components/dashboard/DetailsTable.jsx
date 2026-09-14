'use client';

import { useMemo, useState } from 'react';
import ColumnHeaderCell from './ColumnHeaderCell';

// Template-driven details table. `columns` = resolved header defs
// ({ id, name, format, signed }) in display order; `rows` =
// resolveTemplate().tableRows ({ key, cells: { [headerId]: { raw, display } } }).
// First column is sticky/linked, rest sortable + per-column filterable.
export default function DetailsTable({ columns = [], rows = [], editMode = false, arrange }) {
  const cols = columns.map((h, i) => ({
    id: h.id,
    key: h.id,
    label: h.name,
    type: h.format === 'text' ? 'text' : 'num',
    sticky: i === 0,
    signed: !!h.signed,
  }));

  const [sort, setSort] = useState(null); // { key, dir }
  const [filters, setFilters] = useState({});
  const [selected, setSelected] = useState(() => new Set());

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

  const allChecked = view.length > 0 && view.every((r) => selected.has(r.key));
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) view.forEach((r) => next.delete(r.key));
      else view.forEach((r) => next.add(r.key));
      return next;
    });
  const toggleOne = (k) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });

  if (!cols.length) {
    return (
      <div className="rounded-xl border border-divider bg-background px-4 py-10 text-center text-sm text-muted">
        This tab has no columns yet — add headers to it in Template Settings.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-divider bg-background">
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-divider bg-th">
              <th className="w-10 px-3 py-2.5">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-[var(--color-action)]" aria-label="Select all rows" />
              </th>
              {cols.map((col) => (
                <th key={col.key} className="px-3 py-2.5 text-left font-medium text-muted whitespace-nowrap">
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
              ))}
            </tr>
          </thead>
          <tbody>
            {view.length === 0 && (
              <tr>
                <td colSpan={cols.length + 1} className="px-4 py-10 text-center text-sm text-muted">
                  {rows.length === 0 ? 'No data yet — upload a sheet to see rows here.' : 'No rows match the current filters.'}
                </td>
              </tr>
            )}
            {view.map((r) => (
              <tr key={r.key} className="border-t border-divider transition-colors hover:bg-card-hover">
                <td className="px-3 py-2.5">
                  <input type="checkbox" checked={selected.has(r.key)} onChange={() => toggleOne(r.key)} className="accent-[var(--color-action)]" aria-label={`Select ${r.key}`} />
                </td>
                {cols.map((col) => {
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
      <div className="flex items-center justify-between border-t border-divider px-3 py-2 text-xs text-subtle">
        <span>
          {view.length} row{view.length === 1 ? '' : 's'}
          {selected.size > 0 && ` · ${selected.size} selected`}
        </span>
      </div>
    </div>
  );
}
