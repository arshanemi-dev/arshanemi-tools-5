'use client';

import { useMemo, useState } from 'react';
import { Check as CheckIcon, Lock, Pencil, Trash2, X } from 'lucide-react';
import ColumnFilterButton from '@/components/dashboard/ColumnFilterButton';
import { mappedColumnsByHeader, marketplaceUniqueHeaders } from '@/lib/profitLoss/marketplaceHeaders';
import { DEFAULT_LIST_SORT, sortItems } from '@/lib/profitLoss/listSort';
import { isFixedHeader } from '@/data/fixedHeaders';

const OUR_COL = '__our__';
const norm = (s) => String(s ?? '').trim().toLowerCase();
export const colKey = (marketplaceId, sheetHeader) => JSON.stringify([marketplaceId, sheetHeader]);
const matches = (text, q) => !q || norm(text).includes(norm(q));

function ColumnHead({ label, sub, filter, onFilter, getOptions, onOpenChange, sortDir, onSort }) {
  return (
    <div className="flex items-center gap-1 whitespace-nowrap">
      <span className="font-normal">{label}</span>
      {sub && <span className="text-[10.5px] font-normal text-subtle">· {sub}</span>}
      <ColumnFilterButton label={label} filter={filter} getOptions={getOptions} onChange={onFilter} onOpenChange={onOpenChange} size={13} sortDir={sortDir} onSort={onSort} />
    </div>
  );
}

function RowBtn({ title, onClick, disabled, tone, children }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled} className={`shrink-0 rounded p-1 disabled:opacity-30 ${tone}`}>
      {children}
    </button>
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
// Rows are always grouped "merged first": each mapped Our Header is one row
// with every marketplace's mapped headers as boxes to its right (× unmaps
// one). Below that, the Unmapped block lists — independently per column —
// the Our Headers with no mapping yet and each marketplace's headers not
// mapped to anything. Every column has the same spreadsheet-style filter the
// dashboard tables have (the funnel — search + tick the headers to keep,
// several at once): the Our Header column offers every Our Header, a
// marketplace column every header of that marketplace's sheets. Our Headers
// within each block follow `ourSort` (Name / Created —
// lib/profitLoss/listSort.js); marketplace columns keep their sheet order.
// `ourQuery` (HeaderSection's search box) narrows the Our Header column by
// text on top of its filter.
//
// The same menu sorts: Our Header's "Sort A → Z / Z → A" is the section's own
// Name sort (`ourSort` — the menu and the sort picker above the table are
// one setting, `onOurSort`); a marketplace column's orders that column's
// headers — its Unmapped list, and the Mapped rows by the header mapped
// there (rows with nothing mapped in that column go last). One marketplace
// column at a time, and it steps aside when Our Header is sorted.
export default function HeaderMappingTable({ headers, marketplaces, activeId, onSelect, checked, onToggleCheck, onUnmap, onRename, onDelete, busy = false, ourQuery, ourSort = DEFAULT_LIST_SORT, onOurSort = () => {} }) {
  const [colSort, setColSort] = useState(null); // { id, dir } — the marketplace column the table is sorted on
  const [filters, setFilters] = useState({}); // { [column]: { values: [header name, ...] } | null }
  const [menuOpen, setMenuOpen] = useState(false); // a filter menu is open — the table makes room for it
  const setFilter = (col) => (f) => setFilters((prev) => ({ ...prev, [col]: f }));
  const allowed = (col) => (filters[col]?.values ? new Set(filters[col].values) : null);
  const filterCount = Object.values(filters).filter((f) => f?.values).length;
  const ordered = useMemo(() => sortItems(headers, ourSort), [headers, ourSort]);

  const knownIds = useMemo(() => new Set(headers.map((h) => h.id)), [headers]);

  // Oldest marketplace first — the list itself is sorted by last update, which
  // would shuffle the columns every time a mapping saves.
  const columns = useMemo(() => [...(marketplaces || [])]
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    .map((t) => {
      const mapped = mappedColumnsByHeader(t.config, knownIds);
      const mappedKeys = new Set([...mapped.values()].flat().map(norm));
      const all = marketplaceUniqueHeaders(t.config);
      return { id: t.id, name: t.marketplaceName || 'Marketplace', mapped, total: all.length, all: all.map((o) => o.name), unmapped: all.filter((o) => !mappedKeys.has(norm(o.name))) };
    }), [marketplaces, knownIds]);

  const isMerged = (h) => columns.some((c) => (c.mapped.get(h.id) || []).length);
  const ourAllowed = allowed(OUR_COL);
  const ourShown = (h) => matches(h.name, ourQuery) && (!ourAllowed || ourAllowed.has(h.name));
  const colAllowed = columns.map((c) => allowed(c.id));
  const sortCol = colSort ? columns.find((c) => c.id === colSort.id) : null;
  const sign = colSort?.dir === 'desc' ? -1 : 1;
  const byText = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  const mappedIn = (h) => (sortCol.mapped.get(h.id) || [])[0];
  const mergedMatches = ordered.filter((h) => isMerged(h)
    && ourShown(h)
    && columns.every((c, ci) => !colAllowed[ci] || (c.mapped.get(h.id) || []).some((s) => colAllowed[ci].has(s))));
  const mergedRows = sortCol
    ? [...mergedMatches].sort((a, b) => {
      const x = mappedIn(a);
      const y = mappedIn(b);
      if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1; // nothing mapped here → last
      return sign * byText(x, y);
    })
    : mergedMatches;
  const ourUnmapped = ordered.filter((h) => !isMerged(h) && ourShown(h));
  const colUnmapped = columns.map((c, ci) => {
    const list = c.unmapped.filter((o) => !colAllowed[ci] || colAllowed[ci].has(o.name));
    return sortCol?.id === c.id ? [...list].sort((a, b) => sign * byText(a.name, b.name)) : list;
  });
  const ourSortDir = ourSort === 'name-asc' ? 'asc' : ourSort === 'name-desc' ? 'desc' : null;
  const sortOur = (dir) => { setColSort(null); onOurSort(dir ? `name-${dir}` : DEFAULT_LIST_SORT); };
  const raggedCount = Math.max(ourUnmapped.length, ...colUnmapped.map((l) => l.length), columns.some((c) => !c.total) ? 1 : 0);

  // "required" = must be mapped (Order Id / Transaction Id); "fixed" = the
  // other built-in headers (Account Name, the SKU Cost ones — data/fixedHeaders.js).
  const badge = (h) => (isFixedHeader(h) ? 'fixed' : h.reserved ? 'required' : h.source === 'default' ? 'default' : h.source === 'extracted' ? 'sheet' : '');

  // Per-row rename: Edit swaps the name for an input with Save ✓ / Cancel ×
  // (Enter / Escape too); Delete stays beside them. The required and the
  // fixed headers can't be renamed or deleted — they show a lock instead.
  const [editing, setEditing] = useState(null); // { id, text }
  const commitEdit = () => {
    const text = editing?.text.trim();
    if (!text) return;
    onRename(editing.id, text);
    setEditing(null);
  };

  const ourCell = (h, tint) => {
    const selected = h.id === activeId;
    const isEditing = editing?.id === h.id;
    return (
      <td className={`sticky left-0 z-[1] border border-divider px-2 py-1.5 ${selected ? 'bg-action-soft' : tint}`}>
        {isEditing ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={editing.text}
              onChange={(e) => setEditing({ id: h.id, text: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null); }}
              aria-label={`Rename ${h.name}`}
              className="min-w-0 flex-1 rounded-md border border-accent bg-background px-2 py-0.5 text-[12.5px] text-foreground focus:outline-none"
            />
            <RowBtn title="Save" onClick={commitEdit} disabled={!editing.text.trim()} tone="text-action hover:bg-action-soft"><CheckIcon size={13} /></RowBtn>
            <RowBtn title="Cancel" onClick={() => setEditing(null)} tone="text-subtle hover:bg-card-hover hover:text-foreground"><X size={13} /></RowBtn>
            <RowBtn title="Delete" onClick={() => { setEditing(null); onDelete(h.id); }} tone="text-neg hover:bg-neg/10"><Trash2 size={13} /></RowBtn>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
              <Check checked={selected} onChange={() => onSelect(selected ? null : h.id)} label={`Select ${h.name}`} />
              <span className={`min-w-0 truncate ${selected ? 'font-semibold text-foreground' : 'text-muted'}`} title={h.name}>
                {h.name || 'Untitled'}
                {badge(h) && <span className="ml-1.5 text-[9.5px] font-medium uppercase tracking-wide text-subtle">{badge(h)}</span>}
              </span>
            </label>
            {h.reserved ? (
              <span title={`${isFixedHeader(h) ? 'Built-in' : 'Required'} header — can’t be renamed or deleted`} className="shrink-0 p-1 text-subtle"><Lock size={12} /></span>
            ) : (
              <>
                <RowBtn title="Edit" onClick={() => setEditing({ id: h.id, text: h.name })} tone="text-subtle hover:bg-card-hover hover:text-foreground"><Pencil size={12} /></RowBtn>
                <RowBtn title="Delete" onClick={() => onDelete(h.id)} tone="text-subtle hover:bg-neg/10 hover:text-neg"><Trash2 size={12} /></RowBtn>
              </>
            )}
          </div>
        )}
      </td>
    );
  };
  const sectionRow = (label) => (
    <tr>
      <td colSpan={1 + columns.length} className="border border-divider bg-card px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-subtle">{label}</td>
    </tr>
  );

  return (
    <>
      {filterCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider bg-action-soft px-4 py-1.5 text-xs text-foreground">
          <span>{filterCount} column filter{filterCount === 1 ? '' : 's'} on</span>
          <button type="button" onClick={() => setFilters({})} className="font-semibold text-link hover:underline">Clear all filters</button>
        </div>
      )}
      {/* taller while a filter menu is open, so the menu isn't cut off by this scroll area */}
      <div data-table-scroll className={`max-h-[32rem] overflow-auto border-y border-divider ${menuOpen ? 'min-h-[25rem]' : 'min-h-[14rem]'}`}>
      <table className="w-full border-collapse text-left text-[13px]">
        <thead className="sticky top-0 z-10 bg-background text-muted">
          <tr>
            <th className="sticky left-0 z-20 min-w-[16rem] border border-divider bg-background px-2 py-1.5">
              <ColumnHead label="Our Header" sub={`${headers.length}`} filter={filters[OUR_COL]} onFilter={setFilter(OUR_COL)} getOptions={() => ordered.map((h) => ({ text: h.name }))} onOpenChange={setMenuOpen} sortDir={sortCol ? null : ourSortDir} onSort={sortOur} />
            </th>
            {columns.map((c) => (
              <th key={c.id} className="min-w-[12rem] border border-divider px-2 py-1.5">
                <ColumnHead label={c.name} sub={c.total ? `${c.unmapped.length} unmapped` : 'no headers'} filter={filters[c.id]} onFilter={setFilter(c.id)} getOptions={() => c.all.map((name) => ({ text: name }))} onOpenChange={setMenuOpen} sortDir={sortCol?.id === c.id ? colSort.dir : null} onSort={(dir) => setColSort(dir ? { id: c.id, dir } : null)} />
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
    </>
  );
}
