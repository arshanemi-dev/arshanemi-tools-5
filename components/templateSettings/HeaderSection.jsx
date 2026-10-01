'use client';

import { useMemo, useState } from 'react';
import { Link2, Loader2, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { withAddedMappings, withoutHeaderMappings, withoutMapping } from '@/lib/profitLoss/marketplaceHeaders';
import { headerUsages, withoutAutoImported, withoutHeader } from '@/lib/profitLoss/headerUsage';
import { useToast } from '@/components/admin/Toast';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import SectionHead from './SectionHead';
import HeaderMappingTable from './HeaderMappingTable';
import HeaderEditModal from './HeaderEditModal';

// Header — Our Headers (the global config's own headers) and their mapping
// onto every marketplace's saved sheet headers:
//   - Toolbar: Add (always) → the Add popup; with an Our Header ticked, Edit
//     (the same popup — name, type, format, formula; saved only on Save) and
//     Delete (confirm lists where it's used; also drops it from every Tab /
//     Overview Tab / Graph pick). Then Mapped.
//   - HeaderMappingTable: tick ONE Our Header + any marketplace headers,
//     press Mapped, and they merge into it — one row with the mapped headers
//     as boxes on the right; × on a box unmaps it. Every Our Header row also
//     has its own Edit (inline rename → Save ✓ / Cancel ×) and Delete.
// Marketplace columns are never added to Our Headers automatically; headers
// imported that way before (source 'extracted') get a one-click cleanup.
// Headers are global (this draft — needs Save Draft / Publish); mappings are
// per-marketplace and save straight onto that marketplace (`mappingSaver`).
export default function HeaderSection({ draft, activeId: activeIdProp, onActiveId, marketplaces = null, mappingSaver = null }) {
  const { addToast } = useToast();
  const { config, setConfig, addItem, patchItem } = draft;
  const headers = config.headers || [];
  const [localId, setLocalId] = useState(null);
  const activeId = activeIdProp !== undefined ? activeIdProp : localId;
  const setActiveId = onActiveId || setLocalId;
  const active = headers.find((h) => h.id === activeId) || null;
  const [checked, setChecked] = useState(() => new Set()); // colKey(marketplaceId, sheetHeader)
  const [modal, setModal] = useState(null); // { mode: 'add' } | { mode: 'edit', id }
  const [deleteId, setDeleteId] = useState(null); // header awaiting the delete confirm (row or toolbar)

  const mappedIds = useMemo(() => new Set((marketplaces || []).flatMap(
    (t) => (t.config?.fileSlots || []).flatMap((s) => (s.mappings || []).map((m) => m.headerId)),
  )), [marketplaces]);
  const autoImported = headers.filter((h) => h.source === 'extracted');
  const deleteTarget = headers.find((h) => h.id === deleteId) || null;
  const deleteUsages = deleteTarget ? headerUsages(config, deleteTarget) : [];
  // Marketplaces that map a column to the header being deleted — their
  // mappings go with it (otherwise they'd linger, fail validation and block
  // saving that marketplace).
  const mappedIn = (id) => (marketplaces || []).filter((t) => (t.config?.fileSlots || []).some((s) => (s.mappings || []).some((m) => m.headerId === id)));
  const deleteMappedIn = deleteTarget ? mappedIn(deleteTarget.id) : [];

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

  const saveModal = (form) => {
    if (modal?.mode === 'edit') {
      patchItem('headers', modal.id, form);
      addToast(`Header “${form.name}” updated`);
    } else {
      addItem('headers', form);
      setActiveId(form.id);
      addToast(`Header “${form.name}” added`);
    }
    setModal(null);
  };

  const confirmDeleteHeader = () => {
    if (!deleteTarget || deleteTarget.reserved) { setDeleteId(null); return; }
    setConfig((c) => withoutHeader(c, deleteTarget.id));
    for (const t of deleteMappedIn) mappingSaver?.update(t.id, (cfg) => withoutHeaderMappings(cfg, [deleteTarget.id]));
    addToast(`Header “${deleteTarget.name}” deleted${deleteMappedIn.length ? ` · its mappings removed from ${deleteMappedIn.map((t) => t.marketplaceName).join(', ')}` : ''}`);
    if (deleteTarget.id === activeId) setActiveId(null);
    setDeleteId(null);
  };

  // Row Edit → Save in the table: rename only (type / formula live in the Edit popup).
  const renameHeader = (id, name) => {
    patchItem('headers', id, { name });
    addToast(`Header renamed to “${name}”`);
  };

  const cleanupAutoImported = () => {
    const { config: next, removed, kept } = withoutAutoImported(config, mappedIds);
    setConfig(next);
    if (activeId && !next.headers.some((h) => h.id === activeId)) setActiveId(null);
    addToast(`${removed} auto-imported header${removed === 1 ? '' : 's'} removed${kept ? ` · ${kept} in use kept as your headers` : ''} — Save Draft to keep this`);
  };

  const mpCount = marketplaces?.length ?? 0;
  const saving = !!mappingSaver?.saving;
  const btn = 'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium';

  return (
    <div id="section-header" className="scroll-mt-24">
      <SectionHead title="Header" />

      <div className="space-y-4 rounded-xl border border-divider bg-background py-4">
        {/* Toolbar — Add always; Edit / Delete once an Our Header is ticked; then Mapped */}
        <div className="flex flex-wrap items-center gap-2 px-4">
          <button type="button" onClick={() => setModal({ mode: 'add' })} className={`${btn} border-dashed border-divider-light text-action hover:bg-action-soft`}>
            <Plus size={14} /> Add
          </button>
          {active && (
            <>
              <button type="button" onClick={() => setModal({ mode: 'edit', id: active.id })} className={`${btn} border-divider-light text-foreground hover:bg-card-hover`}>
                <Pencil size={13} /> Edit
              </button>
              {!active.reserved && (
                <button type="button" onClick={() => setDeleteId(active.id)} className={`${btn} border-neg/40 text-neg hover:bg-neg/10`}>
                  <Trash2 size={13} /> Delete
                </button>
              )}
              <span className="max-w-[14rem] truncate text-[12px] text-subtle" title={active.name}>· {active.name}</span>
            </>
          )}
          <span className="mx-1 hidden h-6 w-px bg-divider sm:block" />
          <button
            type="button"
            onClick={mapChecked}
            disabled={!active || !checked.size || saving}
            title={!active ? 'Tick one Our Header first' : !checked.size ? 'Tick the marketplace headers to map' : undefined}
            className="inline-flex items-center gap-1.5 rounded-full bg-action px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-action-hover disabled:opacity-40"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Mapped
          </button>
          {checked.size > 0 && (
            <button type="button" onClick={() => setChecked(new Set())} className="rounded-full px-2 py-1 text-[12px] text-subtle hover:text-foreground">Clear ticks</button>
          )}
        </div>

        <p className="px-4 text-[11.5px] text-subtle">
          {marketplaces === null
            ? 'Loading marketplaces…'
            : !mpCount
              ? 'No marketplaces yet — add one under Market Place to map its headers here.'
              : active && checked.size
                ? <>Map <span className="font-semibold text-foreground">{checked.size}</span> ticked header{checked.size === 1 ? '' : 's'} into <span className="font-semibold text-foreground">{active.name}</span>.</>
                : 'Tick one Our Header and any marketplace headers, then press Mapped. × on a box unmaps it.'}
        </p>

        {autoImported.length > 0 && (
          <div className="mx-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
            <p className="min-w-0 flex-1 text-[12px] text-foreground">
              <span className="font-semibold">{autoImported.length} headers here were copied in automatically from marketplace sheets</span> — they aren&rsquo;t your own headers.
              Remove the unused ones; any already used in a Tab, Overview Tab, Graph, formula or mapping stay as your headers.
            </p>
            <button type="button" onClick={cleanupAutoImported} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-hover">
              <Sparkles size={13} /> Remove auto-imported headers
            </button>
          </div>
        )}

        <HeaderMappingTable
          headers={headers}
          marketplaces={marketplaces || []}
          activeId={activeId}
          onSelect={setActiveId}
          checked={checked}
          onToggleCheck={onToggleCheck}
          onUnmap={unmap}
          onRename={renameHeader}
          onDelete={setDeleteId}
          busy={saving}
        />
      </div>

      {modal && (
        <HeaderEditModal
          key={modal.mode === 'edit' ? `edit:${modal.id}` : 'add'}
          open
          header={modal.mode === 'edit' ? headers.find((h) => h.id === modal.id) : null}
          headers={headers}
          onClose={() => setModal(null)}
          onSave={saveModal}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete header “${deleteTarget?.name || ''}”?`}
        description={`${deleteUsages.length
          ? `It's used in ${deleteUsages.join(', ')}. It will be removed from those Tab / Overview Tab / Graph picks; formulas that reference it by name need fixing by hand.`
          : 'It isn’t used in any Tab, Overview Tab, Graph or formula.'}${deleteMappedIn.length ? ` Its mappings in ${deleteMappedIn.map((t) => t.marketplaceName).join(', ')} are removed too.` : ''}`}
        onConfirm={confirmDeleteHeader}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
