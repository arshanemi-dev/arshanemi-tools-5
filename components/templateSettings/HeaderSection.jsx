'use client';

import { useState } from 'react';
import { Link2, Loader2, Plus, Trash2, X } from 'lucide-react';
import { AGGREGATE_BUILTIN_NAMES, makeHeader } from '@/data/templateSchema';
import { withAddedMappings, withoutMapping } from '@/lib/profitLoss/marketplaceHeaders';
import { useToast } from '@/components/admin/Toast';
import TypeToggle from './TypeToggle';
import FormulaEditor from './FormulaEditor';
import SectionHead from './SectionHead';
import HeaderMappingTable from './HeaderMappingTable';

const FORMATS = ['money', 'int', 'pct', 'text'];

// Header — laid out like the Header design, top to bottom:
//   1. "Enter Header name" — renames the selected header; with nothing
//      selected, typing a name + Enter (or Add) creates a new one.
//   2. The Mapped button + HeaderMappingTable. Tick ONE Our Header and any
//      number of marketplace headers (any marketplaces), press Mapped, and
//      they merge into that Our Header — shown as one row with the mapped
//      headers as boxes on the right; × on a box unmaps it.
//   3. The selected header's type pills (Formula / Number / Text /
//      Alphanumeric) + format, then the formula builder for a formula header.
// Headers themselves are global (this draft); mappings are per-marketplace
// and save straight onto that marketplace (`mappingSaver`). Formula headers
// reference other headers by [name], plus SUM([..]) / COUNT([..]).
export default function HeaderSection({ draft, activeId: activeIdProp, onActiveId, marketplaces = null, mappingSaver = null }) {
  const { addToast } = useToast();
  const { config, addItem, patchItem, removeItem } = draft;
  const headers = config.headers || [];
  const [localId, setLocalId] = useState(null);
  const activeId = activeIdProp !== undefined ? activeIdProp : localId;
  const setActiveId = onActiveId || setLocalId;
  const active = headers.find((h) => h.id === activeId) || null;
  const [newName, setNewName] = useState('');
  const [checked, setChecked] = useState(() => new Set()); // colKey(marketplaceId, sheetHeader)

  const refNames = [
    ...headers.filter((h) => h.id !== activeId).map((h) => h.name),
    ...AGGREGATE_BUILTIN_NAMES,
  ];
  const previewScope = Object.fromEntries(refNames.map((n) => [n, 100]));

  const addHeader = (name) => {
    const item = makeHeader({ name: name || `Header ${headers.length + 1}`, type: 'number', source: 'manual' });
    addItem('headers', item);
    setActiveId(item.id);
    setNewName('');
  };

  const onToggleCheck = (key) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  // Mapped — every ticked marketplace header merges into the ticked Our
  // Header; one save per marketplace touched.
  const mapChecked = async () => {
    if (!active || !checked.size || !mappingSaver) return;
    const byMarketplace = new Map();
    for (const key of checked) {
      const [mid, sheetHeader] = JSON.parse(key);
      byMarketplace.set(mid, [...(byMarketplace.get(mid) || []), sheetHeader]);
    }
    setChecked(new Set());
    const results = await Promise.all([...byMarketplace].map(([mid, cols]) => mappingSaver.update(mid, (cfg) => withAddedMappings(cfg, active.id, cols))));
    const done = [...byMarketplace.values()].filter((_, i) => results[i]).flat().length;
    if (done) addToast(`${done} header${done === 1 ? '' : 's'} mapped to “${active.name}”`);
  };
  const unmap = (mid, headerId, sheetHeader) => mappingSaver?.update(mid, (cfg) => withoutMapping(cfg, headerId, sheetHeader));

  const deleteActive = () => {
    if (!active || active.reserved || !window.confirm(`Delete header “${active.name}”?`)) return;
    removeItem('headers', active.id);
    setActiveId(null);
  };

  const mpCount = marketplaces?.length ?? 0;
  const saving = !!mappingSaver?.saving;

  return (
    <div id="section-header" className="scroll-mt-24">
      <SectionHead
        title="Header"
        right={(
          <button type="button" onClick={() => addHeader()} className="inline-flex items-center gap-1 rounded-full border border-dashed border-divider-light px-2.5 py-1 text-[12px] font-medium text-action hover:bg-action-soft">
            <Plus size={12} /> Add Header
          </button>
        )}
      />

      <div className="space-y-4 rounded-xl border border-divider bg-background py-4">
        <div className="flex flex-wrap items-center gap-2 px-4">
          <input
            value={active ? active.name : newName}
            onChange={(e) => (active ? patchItem('headers', active.id, { name: e.target.value }) : setNewName(e.target.value))}
            onKeyDown={(e) => { if (e.key === 'Enter' && !active && newName.trim()) addHeader(newName.trim()); }}
            placeholder="Enter Header name"
            disabled={!!active?.reserved}
            title={active?.reserved ? 'Required by every marketplace — name is locked' : undefined}
            className="min-w-[12rem] flex-1 border-0 border-b border-transparent bg-background px-0 py-1 text-[15px] text-foreground placeholder:text-foreground hover:border-divider focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
          {active ? (
            <>
              {!active.reserved && (
                <button type="button" onClick={deleteActive} title="Delete this header" className="inline-flex items-center gap-1 rounded-full border border-neg/40 px-2.5 py-1 text-[12px] text-neg hover:bg-neg/10">
                  <Trash2 size={12} /> Delete
                </button>
              )}
              <button type="button" onClick={() => setActiveId(null)} title="Deselect — type a new header name instead" className="inline-flex items-center gap-1 rounded-full border border-divider-light px-2.5 py-1 text-[12px] text-muted hover:bg-card-hover">
                <X size={12} /> New
              </button>
            </>
          ) : (
            <button type="button" disabled={!newName.trim()} onClick={() => addHeader(newName.trim())} className="rounded-full bg-action px-3 py-1 text-[12px] font-semibold text-white hover:bg-action-hover disabled:opacity-40">
              Add
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 px-4">
          <button
            type="button"
            onClick={mapChecked}
            disabled={!active || !checked.size || saving}
            title={!active ? 'Tick one Our Header first' : !checked.size ? 'Tick the marketplace headers to map' : undefined}
            className="inline-flex items-center gap-1.5 rounded-full bg-action px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-action-hover disabled:opacity-40"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Mapped
          </button>
          <p className="min-w-0 flex-1 text-[11.5px] text-subtle">
            {marketplaces === null
              ? 'Loading marketplaces…'
              : !mpCount
                ? 'No marketplaces yet — add one under Market Place to map its headers here.'
                : active && checked.size
                  ? <>Map <span className="font-semibold text-foreground">{checked.size}</span> ticked header{checked.size === 1 ? '' : 's'} into <span className="font-semibold text-foreground">{active.name}</span>.</>
                  : 'Tick one Our Header and any marketplace headers, then press Mapped. × on a box unmaps it.'}
          </p>
          {checked.size > 0 && (
            <button type="button" onClick={() => setChecked(new Set())} className="rounded-full px-2 py-1 text-[12px] text-subtle hover:text-foreground">Clear ticks</button>
          )}
        </div>

        <HeaderMappingTable
          headers={headers}
          marketplaces={marketplaces || []}
          activeId={activeId}
          onSelect={setActiveId}
          checked={checked}
          onToggleCheck={onToggleCheck}
          onUnmap={unmap}
          busy={saving}
        />

        <div className="space-y-3 px-4">
          {!active ? (
            <p className="py-4 text-center text-[12.5px] text-subtle">Tick an Our Header to set its type and formula.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <TypeToggle value={active.type} disabled={active.reserved} onChange={(type) => patchItem('headers', active.id, { type })} />
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  Format
                  <select
                    value={active.format || 'money'}
                    onChange={(e) => patchItem('headers', active.id, { format: e.target.value })}
                    className="rounded-md border border-divider bg-background px-2 py-1 text-xs focus:outline-none"
                  >
                    {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={active.showInTable !== false}
                    onChange={(e) => patchItem('headers', active.id, { showInTable: e.target.checked })}
                    className="accent-[var(--color-action)]"
                  />
                  Show in table
                </label>
              </div>
              {active.reserved && (
                <p className="text-[11px] text-subtle">Required header — every marketplace must map it to a sheet column before it can be published live.</p>
              )}
              {active.type === 'formula' && (
                <FormulaEditor
                  key={active.id}
                  value={active.formula || ''}
                  onChange={(formula) => patchItem('headers', active.id, { formula })}
                  refNames={refNames}
                  previewScope={previewScope}
                />
              )}
              {active.source === 'default' && active.primitive && (
                <p className="text-[11px] text-subtle">
                  Bound to the <code>{active.primitive}</code> engine metric{active.note ? ` — ${active.note}` : ''}.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
