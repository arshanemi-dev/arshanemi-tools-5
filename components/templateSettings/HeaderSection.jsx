'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Link2, Loader2, Maximize2, Minimize2, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { marketplaceColumns, withAddedMappings, withoutHeaderMappings, withoutMapping } from '@/lib/profitLoss/marketplaceHeaders';
import { formulaUsages, headerNameProblem, headerUsages, withHeaderUpdate, withoutAutoImported, withoutHeader } from '@/lib/profitLoss/headerUsage';
import { DEFAULT_LIST_SORT, matchesQuery } from '@/lib/profitLoss/listSort';
import { useToast } from '@/components/admin/Toast';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import SectionHead from './SectionHead';
import HeaderMappingTable, { OURS_ID } from './HeaderMappingTable';
import HeaderEditModal from './HeaderEditModal';
import HeaderGroupsRow, { Chip, GroupManageControls } from './HeaderGroupsRow';
import MarketplaceFilterRow from './MarketplaceFilterRow';
import { groupIdOf } from '@/lib/profitLoss/headerGroups';
import ListSearchSort from './ListSearchSort';
import { downloadHeadersWorkbook } from '@/lib/sheet/headersWorkbook';

// Header — Our Headers (the global config's own headers) and their mapping
// onto every marketplace's saved sheet headers:
//   - Toolbar: Add (always) → the Add popup; with an Our Header ticked, Edit
//     (the same popup — name, type, format, formula; saved only on Save; a
//     new name is written into every formula that used the old one) and
//     Delete (confirm lists where it's used; also drops it from every Tab /
//     Overview Tab / Graph pick; refused while a formula still uses it).
//     Then Mapped.
//   - HeaderMappingTable: tick ONE Our Header + any marketplace headers,
//     press Mapped, and they merge into it — one row with the mapped headers
//     as boxes on the right; × on a box unmaps it. Every Our Header row also
//     has its own Edit (inline rename → Save ✓ / Cancel ×) and Delete.
//   - Search + Name / Created sort (ListSearchSort) above the table narrow
//     and order the Our Header rows; every column also has its own
//     spreadsheet-style filter (the funnel in its header).
// Marketplace columns are never added to Our Headers automatically; headers
// imported that way before (source 'extracted') get a one-click cleanup.
// Everything here is part of the Global Settings draft — saved with the
// footer's Save New Version (GlobalVersion.jsx): the headers, the mappings
// (per marketplace, into that marketplace's entry of the draft —
// `mappingSaver`), and `headerGroups` = useHeaderGroups (TemplateBuilder) —
// the "Our Groups" row above the table (HeaderGroupsRow; multi-select, all
// ticked by default — the table shows only the ticked groups' headers, with
// one "Our Headers (<group>)" column per ticked group; a header in one of the
// admin's own groups is tagged with it) and every Our Header's Show / Hide switch
// (hidden = never a dashboard column).
const VIEW_KEY = 'pl-template-header-view'; // the Show: Mapped / Unmapped toggles

export default function HeaderSection({ draft, activeId: activeIdProp, onActiveId, marketplaces = null, mappingSaver = null, headerGroups = null }) {
  const { addToast } = useToast();
  const { config, setConfig, addItem } = draft;
  const headers = config.headers || [];
  const [localId, setLocalId] = useState(null);
  const activeId = activeIdProp !== undefined ? activeIdProp : localId;
  const setActiveId = onActiveId || setLocalId;
  const active = headers.find((h) => h.id === activeId) || null;
  const [checked, setChecked] = useState(() => new Set()); // colKey(marketplaceId, column.key) — a File › Sheet › Header
  const [modal, setModal] = useState(null); // { mode: 'add' } | { mode: 'edit', id }
  const [deleteId, setDeleteId] = useState(null); // header awaiting the delete confirm (row or toolbar)
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(DEFAULT_LIST_SORT);
  // The Our Groups row is multi-select: every group starts ticked (so does a
  // new one) — this holds the ones switched OFF.
  const [offGroups, setOffGroups] = useState(() => new Set());
  const groupsReady = !!headerGroups && !headerGroups.loading && !headerGroups.error;
  const allGroups = groupsReady ? headerGroups.groups : [];
  const onGroups = allGroups.filter((g) => !offGroups.has(g.id));
  const allGroupsOn = onGroups.length === allGroups.length;
  const groupOfHeader = (id) => groupIdOf(headerGroups?.headerGroups, id);
  // One "Our Headers (<group>)" column per ticked group, each listing only
  // that group's headers.
  const oursColumns = groupsReady
    ? onGroups.map((g) => ({ id: g.id, name: g.name, ids: new Set(headers.filter((h) => groupOfHeader(h.id) === g.id).map((h) => h.id)) }))
    : null;
  // The first column shows only headers of the ticked groups (null = all).
  const groupFilter = groupsReady && !allGroupsOn
    ? new Set(oursColumns.flatMap((c) => [...c.ids]))
    : null;
  const toggleGroup = (id) => setOffGroups((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const setAllGroups = (on) => setOffGroups(on ? new Set() : new Set(allGroups.map((g) => g.id)));

  // The Market Places row — multi-select too, every marketplace ticked by
  // default (a new one as well); this holds the ones switched OFF. Hiding one
  // also drops its ticks, so Mapped never maps a header you can't see.
  const [offMarketplaces, setOffMarketplaces] = useState(() => new Set());
  const marketplaceItems = useMemo(() => [...(marketplaces || [])]
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    .map((t) => ({ id: t.id, name: t.marketplaceName || 'Marketplace', count: marketplaceColumns(t.config).length })), [marketplaces]);
  const shownMarketplaceIds = marketplaceItems.filter((m) => !offMarketplaces.has(m.id)).map((m) => m.id);
  const dropTicksOf = (ids) => setChecked((prev) => {
    const next = new Set([...prev].filter((key) => !ids.includes(JSON.parse(key)[0])));
    return next.size === prev.size ? prev : next;
  });
  const toggleMarketplace = (id) => {
    if (!offMarketplaces.has(id)) dropTicksOf([id]);
    setOffMarketplaces((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const setAllMarketplaces = (on) => {
    if (!on) dropTicksOf(marketplaceItems.map((m) => m.id));
    setOffMarketplaces(on ? new Set() : new Set(marketplaceItems.map((m) => m.id)));
  };
  // The group a header is in, shown beside its name — unless it's General.
  const groupTag = (id) => {
    if (!groupsReady) return '';
    const g = headerGroups.groupOf(id);
    return g && g.kind !== 'general' ? g.name : '';
  };
  // Each Our Header's Show / Hide switch — for the dashboard, once the
  // version it's saved in is Live.
  const toggleHidden = async (id) => {
    const h = headers.find((x) => x.id === id);
    const hide = !headerGroups.isHidden(id);
    if (await headerGroups.setHidden([id], hide)) addToast(`“${h?.name || 'Header'}” ${hide ? 'hidden on' : 'shown on'} the dashboard — Save New Version to keep it`);
  };

  const mappedIds = useMemo(() => new Set((marketplaces || []).flatMap(
    (t) => (t.config?.fileSlots || []).flatMap((s) => (s.mappings || []).map((m) => m.headerId)),
  )), [marketplaces]);
  const autoImported = headers.filter((h) => h.source === 'extracted');

  // Show: Mapped / Unmapped — hide a block to give the other its room. At
  // least one stays on; the choice is remembered in this browser.
  const [view, setView] = useState({ mapped: true, unmapped: true });
  useEffect(() => { // after mount, so the server's and the browser's first render match
    try {
      const v = JSON.parse(window.localStorage.getItem(VIEW_KEY) || 'null');
      if (v && (v.mapped || v.unmapped)) setView({ mapped: !!v.mapped, unmapped: !!v.unmapped }); // eslint-disable-line react-hooks/set-state-in-effect
    } catch { /* no storage — keep the default */ }
  }, []);
  const toggleView = (k) => setView((prev) => {
    const next = { ...prev, [k]: !prev[k] };
    if (!next.mapped && !next.unmapped) return prev;
    try { window.localStorage.setItem(VIEW_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
  // Full Page — the section covers the whole screen (over the sidebar and
  // the Save Version bar) for room to work; Minimize or Esc goes back. Esc
  // first closes an open dropdown / popup, only then the full page.
  const [full, setFull] = useState(false);
  const popupOpen = !!modal || !!deleteId;
  useEffect(() => {
    if (!full) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key !== 'Escape' || popupOpen || document.querySelector('#section-header .dropdown-panel-in')) return;
      setFull(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [full, popupOpen]);

  const isMappedHeader = (h) => (h.fromHeaders || []).length > 0 || mappedIds.has(h.id);
  const mappedCount = headers.filter(isMappedHeader).length;
  const deleteTarget = headers.find((h) => h.id === deleteId) || null;
  const deleteUsages = deleteTarget ? headerUsages(config, deleteTarget) : [];
  // A header a formula still names isn't deleted: the confirm says which
  // formulas to change first (formulaUsages).
  const deleteBlockedBy = deleteTarget ? formulaUsages(config, deleteTarget) : [];
  // Marketplaces that map a column to the header being deleted — their
  // mappings go with it (otherwise they'd linger, mapped to nothing).
  const mappedIn = (id) => (marketplaces || []).filter((t) => (t.config?.fileSlots || []).some((s) => (s.mappings || []).some((m) => m.headerId === id)));
  const deleteMappedIn = deleteTarget ? mappedIn(deleteTarget.id) : [];
  // Where the header being edited is used — shown in the Edit popup, so a
  // rename says up front which formulas it rewrites.
  const editTarget = modal?.mode === 'edit' ? headers.find((h) => h.id === modal.id) || null : null;
  const editFormulas = editTarget ? formulaUsages(config, editTarget) : [];
  const editUsages = editTarget ? {
    formulas: editFormulas,
    others: [
      ...headerUsages(config, editTarget).filter((u) => !editFormulas.includes(u)),
      ...mappedIn(editTarget.id).map((t) => `Mapped in “${t.marketplaceName}”`),
    ],
  } : null;

  const onToggleCheck = (key) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  // Mapped — every ticked marketplace column (a File › Sheet › Header)
  // merges into the ticked Our Header, read from that sheet only.
  const mapChecked = async () => {
    if (!active || !checked.size) return;
    // Ticked Our Headers (the Our Headers column) map into it in the draft —
    // saved with the version, like the header itself.
    const ours = [...checked].map((key) => JSON.parse(key)).filter(([mid]) => mid === OURS_ID).map(([, id]) => id).filter((id) => id !== active.id);
    if (ours.length) {
      if (active.type === 'formula' || active.primitive) {
        addToast(`“${active.name}” is ${active.type === 'formula' ? 'a Formula' : 'worked out by the engine'} — map Our Headers into a Number / Text / Date header instead`, 'error');
      } else {
        setConfig((c) => ({
          ...c,
          headers: (c.headers || []).map((h) => (h.id === active.id ? { ...h, fromHeaders: [...new Set([...(h.fromHeaders || []), ...ours])] } : h)),
        }));
        addToast(`${ours.length} Our Header${ours.length === 1 ? '' : 's'} mapped to “${active.name}” — Save New Version to keep it`);
      }
    }
    if (!mappingSaver) { setChecked(new Set()); return; }
    const byMarketplace = new Map();
    for (const key of checked) {
      const [mid, columnKey] = JSON.parse(key);
      if (mid === OURS_ID) continue;
      const t = (marketplaces || []).find((x) => x.id === mid);
      const column = t ? marketplaceColumns(t.config).find((c) => c.key === columnKey) : null;
      if (column) byMarketplace.set(mid, [...(byMarketplace.get(mid) || []), column]);
    }
    setChecked(new Set());
    const results = await Promise.all([...byMarketplace].map(([mid, cols]) => mappingSaver.update(mid, (cfg) => withAddedMappings(cfg, active.id, cols))));
    const done = [...byMarketplace.values()].filter((_, i) => results[i]).flat().length;
    if (done) addToast(`${done} header${done === 1 ? '' : 's'} mapped to “${active.name}”`);
  };
  // × on a mapped box — that one file › sheet › column (`target`).
  // In the Our Headers column, `target` is the Our Header's id.
  const unmap = (mid, headerId, target) => {
    if (mid === OURS_ID) {
      setConfig((c) => ({
        ...c,
        headers: (c.headers || []).map((h) => (h.id === headerId ? { ...h, fromHeaders: (h.fromHeaders || []).filter((id) => id !== target) } : h)),
      }));
      return undefined;
    }
    return mappingSaver?.update(mid, (cfg) => withoutMapping(cfg, headerId, target));
  };

  // A rename (here or in the table) rewrites every formula that named the
  // old name — withHeaderUpdate — so a name another header already has is
  // refused: the two would read as one.
  const saveModal = (form) => {
    const problem = headerNameProblem(config, modal?.mode === 'edit' ? modal.id : form.id, form.name);
    if (problem) { addToast(problem, 'error'); return; }
    if (modal?.mode === 'edit') {
      const usages = renamedIn(modal.id, form.name);
      setConfig((c) => withHeaderUpdate(c, modal.id, form));
      addToast(`Header “${form.name}” updated${usages}`);
    } else {
      addItem('headers', form);
      setActiveId(form.id);
      addToast(`Header “${form.name}” added`);
    }
    setModal(null);
  };

  const confirmDeleteHeader = () => {
    if (!deleteTarget || deleteTarget.reserved || deleteBlockedBy.length) { setDeleteId(null); return; }
    setConfig((c) => withoutHeader(c, deleteTarget.id));
    for (const t of deleteMappedIn) mappingSaver?.update(t.id, (cfg) => withoutHeaderMappings(cfg, [deleteTarget.id]));
    addToast(`Header “${deleteTarget.name}” deleted${deleteMappedIn.length ? ` · its mappings removed from ${deleteMappedIn.map((t) => t.marketplaceName).join(', ')}` : ''}`);
    if (deleteTarget.id === activeId) setActiveId(null);
    setDeleteId(null);
  };

  // " · 3 formulas updated" for the toast, when renaming `id` to `name`
  // rewrites any (read before the rename, while they still use the old name).
  const renamedIn = (id, name) => {
    const h = headers.find((x) => x.id === id);
    if (!h || h.name === name.trim()) return '';
    const n = formulaUsages(config, h).length;
    return n ? ` · ${n} formula${n === 1 ? '' : 's'} updated to the new name` : '';
  };

  // Row Edit → Save in the table: rename only (type / formula live in the Edit popup).
  const renameHeader = (id, name) => {
    const problem = headerNameProblem(config, id, name);
    if (problem) { addToast(problem, 'error'); return; }
    const usages = renamedIn(id, name);
    setConfig((c) => withHeaderUpdate(c, id, { name }));
    addToast(`Header renamed to “${name.trim()}”${usages}`);
  };

  const cleanupAutoImported = () => {
    const { config: next, removed, kept } = withoutAutoImported(config, mappedIds);
    setConfig(next);
    if (activeId && !next.headers.some((h) => h.id === activeId)) setActiveId(null);
    addToast(`${removed} auto-imported header${removed === 1 ? '' : 's'} removed${kept ? ` · ${kept} in use kept as your headers` : ''} — Save New Version to keep this`);
  };

  // Download Excel — every header, documented, a sheet per category
  // (lib/sheet/headersWorkbook.js). What's on screen, saved or not.
  const [downloading, setDownloading] = useState(false);
  const downloadExcel = async () => {
    setDownloading(true);
    try {
      await downloadHeadersWorkbook({
        config,
        marketplaces: marketplaces || [],
        headerGroups: groupsReady ? headerGroups.headerGroups : null,
        isHidden: groupsReady ? headerGroups.isHidden : () => false,
      });
    } catch {
      addToast('Could not build the headers Excel', 'error');
    } finally {
      setDownloading(false);
    }
  };

  const mpCount = marketplaces?.length ?? 0;
  const saving = !!mappingSaver?.saving;
  const btn = 'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium';

  return (
    <div id="section-header" className={full ? 'fixed inset-0 z-[60] flex flex-col bg-background p-3 sm:p-4' : 'scroll-mt-24'}>
      <SectionHead
        title="Header"
        right={(
          <button
            type="button"
            onClick={() => setFull((v) => !v)}
            title={full ? 'Back to the normal page (Esc)' : 'Cover the whole screen — hides the sidebar and the Save Version bar'}
            className="inline-flex items-center gap-1.5 rounded-full border border-divider-light px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-card-hover"
          >
            {full ? <><Minimize2 size={14} /> Minimize</> : <><Maximize2 size={14} /> Full Page</>}
          </button>
        )}
      />

      <div className={`space-y-4 rounded-xl border border-divider bg-background py-4 ${full ? 'min-h-0 flex-1 overflow-y-auto' : ''}`}>
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
            title={!active ? 'Tick one Our Header first' : !checked.size ? 'Tick the marketplace headers or Our Headers to map' : undefined}
            className="inline-flex items-center gap-1.5 rounded-full bg-action px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-action-hover disabled:opacity-40"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Mapped
          </button>
          {checked.size > 0 && (
            <button type="button" onClick={() => setChecked(new Set())} className="rounded-full px-2 py-1 text-[12px] text-subtle hover:text-foreground">Clear ticks</button>
          )}
          {groupsReady && (
            <>
              <span className="mx-1 hidden h-6 w-px bg-divider sm:block" />
              <GroupManageControls g={headerGroups} headers={headers} />
            </>
          )}
          <button
            type="button"
            onClick={downloadExcel}
            disabled={downloading || !headers.length}
            title="Download every header as Excel — a sheet per category, with formulas, descriptions, mappings and where each is used"
            className={`${btn} ml-auto border-divider-light text-foreground hover:bg-card-hover disabled:opacity-40`}
          >
            {downloading ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Download Excel
          </button>
        </div>

        {(marketplaces === null || !mpCount) && (
          <p className="px-4 text-[11.5px] text-subtle">
            {marketplaces === null ? 'Loading marketplaces…' : 'No marketplaces yet — add one under Market Place to map its headers here.'}
          </p>
        )}

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

        {/* Two lines: Categories, then Market Places */}
        <div className="space-y-2">
          {headerGroups && (
            <HeaderGroupsRow
              g={headerGroups}
              headers={headers}
              selectedIds={onGroups.map((g) => g.id)}
              onToggle={toggleGroup}
              onAll={setAllGroups}
            />
          )}
          <MarketplaceFilterRow
            items={marketplaceItems}
            selectedIds={shownMarketplaceIds}
            onToggle={toggleMarketplace}
            onAll={setAllMarketplaces}
            end={(
              <>
                <span className="text-[12.5px] font-semibold text-foreground">Show</span>
                <Chip active={view.mapped} onClick={() => toggleView('mapped')} count={mappedCount}>Mapped</Chip>
                <Chip active={view.unmapped} onClick={() => toggleView('unmapped')} count={headers.length - mappedCount}>Unmapped</Chip>
              </>
            )}
          />
        </div>

        <ListSearchSort
          className="px-4"
          query={query}
          onQuery={setQuery}
          sort={sort}
          onSort={setSort}
          placeholder="Search headers…"
          shown={headers.filter((h) => matchesQuery(h.name, query) && (!groupFilter || groupFilter.has(h.id))).length}
          total={headers.length}
        />

        <HeaderMappingTable
          headers={headers}
          ourQuery={query}
          groupFilter={groupFilter}
          oursColumns={oursColumns}
          shownMarketplaceIds={shownMarketplaceIds}
          showMapped={view.mapped}
          showUnmapped={view.unmapped}
          full={full}
          groupTag={groupTag}
          isHiddenOf={groupsReady ? headerGroups.isHidden : null}
          onToggleHidden={groupsReady ? toggleHidden : null}
          ourSort={sort}
          onOurSort={setSort}
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
          header={editTarget}
          headers={headers}
          usages={editUsages}
          onClose={() => setModal(null)}
          onSave={saveModal}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={deleteBlockedBy.length ? `“${deleteTarget?.name || ''}” can’t be deleted yet` : `Delete header “${deleteTarget?.name || ''}”?`}
        description={deleteBlockedBy.length
          ? `It's used in ${deleteBlockedBy.join(', ')}. Change ${deleteBlockedBy.length === 1 ? 'that formula' : 'those formulas'} so ${deleteBlockedBy.length === 1 ? 'it no longer uses' : 'they no longer use'} it, then delete it.`
          : `${deleteUsages.length
            ? `It's used in ${deleteUsages.join(', ')}. It will be removed from those Tab / Overview Tab / Graph picks.`
            : 'It isn’t used in any Tab, Overview Tab, Graph or formula.'}${deleteMappedIn.length ? ` Its mappings in ${deleteMappedIn.map((t) => t.marketplaceName).join(', ')} are removed too.` : ''}`}
        confirmLabel={deleteBlockedBy.length ? 'OK' : undefined}
        onConfirm={confirmDeleteHeader}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
