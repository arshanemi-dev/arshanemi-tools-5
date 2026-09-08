'use client';

import { useMemo, useState } from 'react';
import ColumnHeaderCell from './ColumnHeaderCell';
import { SKU_COLUMNS } from '@/data/platforms/canonical';
import { fmtCell } from '@/lib/profitLoss/fmt';

// The per-SKU table. Checkbox column + sortable/filterable headers, exactly the
// column set + order from the reference. Body scrolls sideways inside its own
// container; header stays put vertically (sticky).
export default function DetailsTable({ rows, columnKeys }) {
  const columns = SKU_COLUMNS.filter((c) => c.sticky || columnKeys.includes(c.key));

  const [sort, setSort] = useState({ key: 'profitLoss', dir: 'desc' });
  const [filters, setFilters] = useState({}); // key -> filter object
  const [selected, setSelected] = useState(() => new Set());

  const view = useMemo(() => {
    let out = rows.filter((r) =>
      Object.entries(filters).every(([key, f]) => {
        if (!f) return true;
        const val = r[key];
        if (f.op === 'contains') {
          return String(val ?? '').toLowerCase().includes(String(f.a).toLowerCase());
        }
        const n = Number(val) || 0;
        if (f.a != null && n < f.a) return false;
        if (f.b != null && n > f.b) return false;
        return true;
      }),
    );
    if (sort?.key) {
      const dir = sort.dir === 'asc' ? 1 : -1;
      out = [...out].sort((a, b) => {
        const av = a[sort.key];
        const bv = b[sort.key];
        if (typeof av === 'string' || typeof bv === 'string') {
          return String(av).localeCompare(String(bv)) * dir;
        }
        return ((Number(av) || 0) - (Number(bv) || 0)) * dir;
      });
    }
    return out;
  }, [rows, filters, sort]);

  const allChecked = view.length > 0 && view.every((r) => selected.has(r.sku));
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) view.forEach((r) => next.delete(r.sku));
      else view.forEach((r) => next.add(r.sku));
      return next;
    });
  };
  const toggleOne = (sku) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(sku) ? next.delete(sku) : next.add(sku);
      return next;
    });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-divider bg-background">
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-divider bg-th">
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  className="accent-[var(--color-action)]"
                  aria-label="Select all rows"
                />
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-3 py-2.5 text-left font-medium text-muted whitespace-nowrap"
                >
                  <ColumnHeaderCell
                    col={col}
                    sort={sort}
                    onSortChange={setSort}
                    filter={filters[col.key]}
                    onFilterChange={(f) => setFilters((prev) => ({ ...prev, [col.key]: f }))}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-10 text-center text-sm text-muted">
                  No rows match the current filters.
                </td>
              </tr>
            )}
            {view.map((r) => (
              <tr key={r.sku} className="border-t border-divider transition-colors hover:bg-card-hover">
                <td className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={selected.has(r.sku)}
                    onChange={() => toggleOne(r.sku)}
                    className="accent-[var(--color-action)]"
                    aria-label={`Select ${r.sku}`}
                  />
                </td>
                {columns.map((col) => {
                  const raw = r[col.key];
                  const neg = col.signed && Number(raw) < 0;
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
                      {col.sticky ? raw : fmtCell(raw, col.type)}
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
          {view.length} SKU{view.length === 1 ? '' : 's'}
          {selected.size > 0 && ` · ${selected.size} selected`}
        </span>
      </div>
    </div>
  );
}
