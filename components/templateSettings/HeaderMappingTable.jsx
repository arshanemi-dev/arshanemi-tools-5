'use client';

import { useMemo, useState } from 'react';
import { Filter, X } from 'lucide-react';
import Popover from '@/components/dashboard/Popover';
import { mappedColumnsByHeader, marketplaceUniqueHeaders } from '@/lib/profitLoss/marketplaceHeaders';

const OUR_COL = '__our__';
const norm = (s) => String(s ?? '').trim().toLowerCase();
export const colKey = (marketplaceId, sheetHeader) => JSON.stringify([marketplaceId, sheetHeader]);
const matches = (text, q) => !q || norm(text).includes(norm(q));

function ColumnHead({ label, sub, filter, onFilter }) {
  return (
    <div className="flex items-center gap-1 whitespace-nowrap">
      <span className="font-normal">{label}</span>
      {sub && <span className="text-[10.5px] font-normal text-subtle">· {sub}</span>}
      <Popover
        panelClass="min-w-[13rem] p-2"
        trigger={() => (
          <button type="button" aria-label={`Filter ${label}`} className={`rounded p-0.5 hover:bg-card-hover ${filter ? 'text-action' : 'text-foreground'}`}>
            <Filter size={13} fill="currentColor" />
          </button>
        )}
      >
        <div className="space-y-2">
          <input
            autoFocus
            value={filter || ''}
            onChange={(e) => onFilter(e.target.value)}
            placeholder="Contains…"
            className="w-full rounded-md border border-divider bg-background px-2 py-1 text-[12px] font-normal focus:border-accent focus:outline-none"
          />
          {filter && <button type="button" onClick={() => onFilter('')} className="text-[11px] font-medium text-subtle hover:text-foreground">Clear filter</button>}
        </div>
      </Popover>
    </div>
  );
}

function Check({ checked, onChange, label, disabled }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      className="h-4 w-4 shrink-0 accent-[var(--color-action)] disabled:opacity-30"
    />
  );
}

// The Header section's mapping table. Every header has its own checkbox:
// Our Header is single-select (it's also the header the editor below opens),
// every marketplace column is multi-select. The Mapped button (HeaderSection)
// merges the ticked marketplace headers into the ticked Our Header.
//
// Rows are always sorted "merged first": each mapped Our Header is one row
// with every marketplace's mapped headers as boxes to its right (× unmaps
// one). Below that, the Unmapped block lists — independently per column —
// the Our Headers with no mapping yet and each marketplace's headers not
// mapped to anything. Every column has a text filter.
export default function HeaderMappingTable({ headers, marketplaces, activeId, onSelect, checked, onToggleCheck, onUnmap, busy = false }) {
  const [filters, setFilters] = useState({});
  const setFilter = (col) => (q) => setFilters((f) => ({ ...f, [col]: q }));

  const knownIds = useMemo(() => new Set(headers.map((h) => h.id)), [headers]);

  // Oldest marketplace first — the list itself is sorted by last update, which
  // would shuffle the columns every time a mapping saves.
  const columns = useMemo(() => [...(marketplaces || [])]
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    .map((t) => {
      const mapped = mappedColumnsByHeader(t.config, knownIds);
      const mappedKeys = new Set([...mapped.values()].flat().map(norm));
      const all = marketplaceUniqueHeaders(t.config);
      return { id: t.id, name: t.marketplaceName || 'Marketplace', mapped, total: all.length, unmapped: all.filter((o) => !mappedKeys.has(norm(o.name))) };
    }), [marketplaces, knownIds]);

  const isMerged = (h) => columns.some((c) => (c.mapped.get(h.id) || []).length);
  const mergedRows = headers.filter((h) => isMerged(h)
    && matches(h.name, filters[OUR_COL])
    && columns.every((c) => !filters[c.id] || (c.mapped.get(h.id) || []).some((s) => matches(s, filters[c.id]))));
  const ourUnmapped = headers.filter((h) => !isMerged(h) && matches(h.name, filters[OUR_COL]));
  const colUnmapped = columns.map((c) => c.unmapped.filter((o) => matches(o.name, filters[c.id])));
  const raggedCount = Math.max(ourUnmapped.length, ...colUnmapped.map((l) => l.length), columns.some((c) => !c.total) ? 1 : 0);

  const badge = (h) => (h.reserved ? 'required' : h.source === 'default' ? 'default' : h.source === 'extracted' ? 'sheet' : '');
  const ourCell = (h, tint) => {
    const selected = h.id === activeId;
    return (
      <td className={`sticky left-0 z-[1] border border-divider px-2 py-1.5 ${selected ? 'bg-action-soft' : tint}`}>
        <label className="flex cursor-pointer items-center gap-2">
          <Check checked={selected} onChange={() => onSelect(selected ? null : h.id)} label={`Select ${h.name}`} />
          <span className={`min-w-0 truncate ${selected ? 'font-semibold text-foreground' : 'text-muted'}`} title={h.name}>
            {h.name || 'Untitled'}
            {badge(h) && <span className="ml-1.5 text-[9.5px] font-medium uppercase tracking-wide text-subtle">{badge(h)}</span>}
          </span>
        </label>
      </td>
    );
  };
  const sectionRow = (label) => (
    <tr>
      <td colSpan={1 + columns.length} className="border border-divider bg-card px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-subtle">{label}</td>
    </tr>
  );

  return (
    <div className="max-h-[32rem] min-h-[14rem] overflow-auto border-y border-divider">
      <table className="w-full border-collapse text-left text-[13px]">
        <thead className="sticky top-0 z-10 bg-background text-muted">
          <tr>
            <th className="sticky left-0 z-20 min-w-[12rem] border border-divider bg-background px-2 py-1.5">
              <ColumnHead label="Our Header" sub={`${headers.length}`} filter={filters[OUR_COL]} onFilter={setFilter(OUR_COL)} />
            </th>
            {columns.map((c) => (
              <th key={c.id} className="min-w-[12rem] border border-divider px-2 py-1.5">
                <ColumnHead label={c.name} sub={c.total ? `${c.unmapped.length} unmapped` : 'no headers'} filter={filters[c.id]} onFilter={setFilter(c.id)} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {mergedRows.length > 0 && sectionRow(`Mapped · ${mergedRows.length}`)}
          {mergedRows.map((h) => (
            <tr key={h.id}>
              {ourCell(h, 'bg-background')}
              {columns.map((c) => {
                const cols = c.mapped.get(h.id) || [];
                return (
                  <td key={c.id} className={`border border-divider px-1.5 py-1 align-top ${h.id === activeId ? 'bg-action-soft/40' : ''}`}>
                    {cols.length ? (
                      <div className="flex flex-wrap gap-1">
                        {cols.map((s) => (
                          <span key={s} className="inline-flex max-w-full items-center gap-1 rounded-md border border-action/40 bg-action-soft px-1.5 py-0.5 text-[12px] text-foreground">
                            <span className="truncate" title={s}>{s}</span>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => onUnmap(c.id, h.id, s)}
                              aria-label={`Unmap ${s} from ${h.name}`}
                              className="shrink-0 rounded p-0.5 text-subtle hover:bg-neg/10 hover:text-neg disabled:opacity-40"
                            >
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[12px] text-subtle">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}

          {raggedCount > 0 && sectionRow('Unmapped')}
          {Array.from({ length: raggedCount }, (_, i) => (
            <tr key={`u${i}`}>
              {ourUnmapped[i] ? ourCell(ourUnmapped[i], 'bg-background') : <td className="sticky left-0 z-[1] border border-divider bg-background" />}
              {columns.map((c, ci) => {
                const o = colUnmapped[ci][i];
                if (!o) {
                  return (
                    <td key={c.id} className="border border-divider px-2 py-1.5 text-[11.5px] text-subtle">
                      {i === 0 && !c.total ? 'No headers saved — Market Place › file › Save All Sheets' : null}
                    </td>
                  );
                }
                const key = colKey(c.id, o.name);
                const on = checked.has(key);
                return (
                  <td key={c.id} className={`border border-divider px-2 py-1.5 ${on ? 'bg-action-soft/60' : ''}`}>
                    <label className="flex cursor-pointer items-center gap-2" title={o.sources.join(', ')}>
                      <Check checked={on} onChange={() => onToggleCheck(key)} label={`Select ${o.name} (${c.name})`} />
                      <span className={`min-w-0 truncate ${on ? 'text-foreground' : 'text-muted'}`}>{o.name}</span>
                    </label>
                  </td>
                );
              })}
            </tr>
          ))}

          {!mergedRows.length && !raggedCount && (
            <tr>
              <td colSpan={1 + columns.length} className="px-3 py-6 text-center text-[12px] text-subtle">
                {headers.length ? 'Nothing matches the filters.' : 'No headers yet — press Add to create one.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
