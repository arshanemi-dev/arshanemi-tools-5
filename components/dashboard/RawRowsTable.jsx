'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Download, Eye, EyeOff, Search } from 'lucide-react';
import Popover from './Popover';
import { downloadRawCsv } from '@/lib/sheet/exportRaw';

const CAP = 500;

// Every parsed row of every uploaded tab, every original header — nothing
// aggregated, nothing dropped. Meta columns (Platform / File / Sheet) are
// prepended so a combined multi-file / multi-tab view stays traceable.
export default function RawRowsTable({ headers, rows, metaLabels = {}, headerMeta = {} }) {
  const [q, setQ] = useState('');
  const [hidden, setHidden] = useState(() => new Set());
  const [sort, setSort] = useState(null); // { key, dir }

  const shown = headers.filter((h) => !hidden.has(h));

  const view = useMemo(() => {
    let out = rows;
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      out = out.filter((r) => shown.some((h) => String(r[h] ?? '').toLowerCase().includes(needle)));
    }
    if (sort?.key) {
      const dir = sort.dir === 'asc' ? 1 : -1;
      out = [...out].sort((a, b) => {
        const av = a[sort.key];
        const bv = b[sort.key];
        const an = Number(av);
        const bn = Number(bv);
        if (Number.isFinite(an) && Number.isFinite(bn)) return (an - bn) * dir;
        return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
      });
    }
    return out;
  }, [rows, q, sort, shown]);

  const cycleSort = (key) => {
    setSort((s) =>
      s?.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null,
    );
  };

  const label = (h) => metaLabels[h] ?? h;
  const capped = view.slice(0, CAP);

  return (
    <div className="overflow-hidden rounded-xl border border-divider bg-background">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-divider px-3 py-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search all columns…"
            className="h-8 w-56 rounded-full border border-divider-light bg-background pl-8 pr-3 text-sm text-foreground focus:border-accent focus:outline-none"
          />
        </div>

        <Popover
          align="left"
          panelClass="min-w-[14rem] max-h-72 overflow-y-auto p-1"
          trigger={() => (
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-divider-light bg-background px-3 text-sm font-medium text-foreground hover:border-divider"
            >
              <Columns3 size={14} /> Columns
              {hidden.size > 0 && <span className="text-subtle">· {shown.length}/{headers.length}</span>}
            </button>
          )}
        >
          {() => (
            <div>
              <button
                type="button"
                onClick={() => setHidden(new Set())}
                className="mb-1 w-full rounded-lg px-2 py-1 text-left text-xs text-action hover:bg-card-hover"
              >
                Show all
              </button>
              {headers.map((h) => (
                <label
                  key={h}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm text-foreground hover:bg-card-hover"
                >
                  <input
                    type="checkbox"
                    checked={!hidden.has(h)}
                    onChange={() =>
                      setHidden((prev) => {
                        const n = new Set(prev);
                        n.has(h) ? n.delete(h) : n.add(h);
                        return n;
                      })
                    }
                    className="accent-[var(--color-action)]"
                  />
                  {label(h)}
                </label>
              ))}
            </div>
          )}
        </Popover>

        <button
          type="button"
          onClick={() => downloadRawCsv(shown, view, metaLabels)}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-divider-light bg-background px-3 text-sm font-medium text-foreground hover:border-divider"
        >
          <Download size={14} className="text-action" /> CSV
        </button>

        <span className="ml-auto text-xs text-subtle">
          {view.length.toLocaleString()} rows · {shown.length} cols
          {view.length > CAP && ` · showing first ${CAP}`}
        </span>
      </div>

      {/* table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-divider bg-th">
              {shown.map((h) => {
                const dir = sort?.key === h ? sort.dir : null;
                const Icon = dir === 'asc' ? ArrowUp : dir === 'desc' ? ArrowDown : ChevronsUpDown;
                const hm = headerMeta[h];
                return (
                  <th key={h} className="px-3 py-2 text-left font-medium text-muted whitespace-nowrap align-bottom" title={hm?.info || undefined}>
                    {hm?.group && <div className="text-[10px] font-normal uppercase tracking-wide text-subtle">{hm.group}</div>}
                    <span className="flex items-center gap-1">
                      {label(h)}
                      <button
                        type="button"
                        onClick={() => cycleSort(h)}
                        className={`rounded p-0.5 hover:bg-card-hover ${dir ? 'text-action' : 'text-subtle'}`}
                      >
                        <Icon size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setHidden((prev) => new Set(prev).add(h))}
                        className="rounded p-0.5 text-subtle hover:bg-card-hover"
                        title="Hide column"
                      >
                        <EyeOff size={12} />
                      </button>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {capped.length === 0 && (
              <tr>
                <td colSpan={shown.length} className="px-4 py-10 text-center text-sm text-muted">
                  No rows match “{q}”.
                </td>
              </tr>
            )}
            {capped.map((r, i) => (
              <tr key={i} className="border-t border-divider transition-colors hover:bg-card-hover">
                {shown.map((h) => (
                  <td key={h} className="px-3 py-2 whitespace-nowrap text-foreground">
                    {formatCell(r[h])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatCell(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}
