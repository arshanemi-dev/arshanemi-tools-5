'use client';

import { useMemo, useState } from 'react';
import { Check as CheckIcon, Filter, Lock, Pencil, Trash2, X } from 'lucide-react';
import Popover from '@/components/dashboard/Popover';
import { mappedColumnsByHeader, marketplaceUniqueHeaders } from '@/lib/profitLoss/marketplaceHeaders';
import { DEFAULT_LIST_SORT, sortItems } from '@/lib/profitLoss/listSort';

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
// mapped to anything. Every column has a text filter. Our Headers within
// each block follow `ourSort` (Name / Created — lib/profitLoss/listSort.js);
// marketplace columns keep their sheet order. When the section passes
// `ourQuery` / `onOurQuery` (HeaderSection's search box), that IS the Our
// Header column's filter — typing in either place edits the same text.
export default function HeaderMappingTable({ headers, marketplaces, activeId, onSelect, checked, onToggleCheck, onUnmap, onRename, onDelete, busy = false, ourQuery, onOurQuery, ourSort = DEFAULT_LIST_SORT }) {
  const [filters, setFilters] = useState({});
  const setFilter = (col) => (q) => setFilters((f) => ({ ...f, [col]: q }));
  const ourFilter = ourQuery ?? filters[OUR_COL];
  const setOurFilter = onOurQuery ?? setFilter(OUR_COL);
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
      return { id: t.id, name: t.marketplaceName || 'Marketplace', mapped, total: all.length, unmapped: all.filter((o) => !mappedKeys.has(norm(o.name))) };
    }), [marketplaces, knownIds]);

  const isMerged = (h) => columns.some((c) => (c.mapped.get(h.id) || []).length);
  const mergedRows = ordered.filter((h) => isMerged(h)
    && matches(h.name, ourFilter)
    && columns.every((c) => !filters[c.id] || (c.mapped.get(h.id) || []).some((s) => matches(s, filters[c.id]))));
  const ourUnmapped = ordered.filter((h) => !isMerged(h) && matches(h.name, ourFilter));
  const colUnmapped = columns.map((c) => c.unmapped.filter((o) => matches(o.name, filters[c.id])));
  const raggedCount = Math.max(ourUnmapped.length, ...colUnmapped.map((l) => l.length), columns.some((c) => !c.total) ? 1 : 0);

  const badge = (h) => (h.reserved ? 'required' : h.source === 'default' ? 'default' : h.source === 'extracted' ? 'sheet' : '');

  // Per-row rename: Edit swaps the name for an input with Save ✓ / Cancel ×
  // (Enter / Escape too); Delete stays beside them. The two required headers
  // can't be renamed or deleted — they show a lock instead.
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
              <span title="Required header — can’t be renamed or deleted" className="shrink-0 p-1 text-subtle"><Lock size={12} /></span>
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
    <div className="max-h-[32rem] min-h-[14rem] overflow-auto border-y border-divider">
      <table className="w-full border-collapse text-left text-[13px]">
        <thead className="sticky top-0 z-10 bg-background text-muted">
          <tr>
            <th className="sticky left-0 z-20 min-w-[16rem] border border-divider bg-background px-2 py-1.5">
              <ColumnHead label="Our Header" sub={`${headers.length}`} filter={ourFilter} onFilter={setOurFilter} />
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
