'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Check, Eye, Globe, History, Loader2, PanelLeft, Store, X } from 'lucide-react';
import { useToast } from '@/components/admin/Toast';
import { makeEmptyMarketplaceConfig, makeHeader, isDuplicateName } from '@/data/templateSchema';
import { listTemplates, createTemplate, patchTemplate, deleteTemplate } from '@/lib/profitLoss/templatesApi';
import useTemplateDraft from './useTemplateDraft';
import useGlobalTemplateDraft from './useGlobalTemplateDraft';
import BuilderSidebar from './BuilderSidebar';
import BuilderPreview from './BuilderPreview';
import HeaderSection from './HeaderSection';
import TitleCardSection from './TitleCardSection';
import GraphSection from './GraphSection';
import TabSection from './TabSection';
import OverviewTabSection from './OverviewTabSection';
import MarketPlaceSection from './MarketPlaceSection';
import VersionSection from './VersionSection';
import TemplateLogPanel from './TemplateLogPanel';

// The single builder page. One left sidebar has two areas: Global Settings
// (Header / Graph / Title Card / Tab / Overview Tab — one shared config
// every marketplace's dashboard renders identically) and Market Place (add /
// rename / delete every marketplace; the active one only edits its Files —
// upload slots + column mapping against the global headers). `?t=` carries
// either 'global' or a marketplace id. There is no separate list / new / [id]
// route.
export default function TemplateBuilder() {
  const router = useRouter();
  const sp = useSearchParams();
  const { addToast } = useToast();

  const activeId = sp.get('t') || null;
  const isGlobal = activeId === 'global';
  const marketplaceId = isGlobal ? null : activeId;
  const activeArea = isGlobal ? 'global' : marketplaceId ? 'marketplace' : null;

  const globalDraft = useGlobalTemplateDraft();
  const draft = useTemplateDraft(marketplaceId, { globalHeaderIds: globalDraft.headerIds });

  const [templates, setTemplates] = useState(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const refreshList = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let alive = true;
    listTemplates({ scopeAll: true }).then(({ ok, data }) => {
      if (alive) setTemplates(ok ? data.templates || [] : []);
    });
    return () => { alive = false; };
  }, [reloadKey]);

  // Per-section selection, scoped to the active area (global, or one
  // marketplace) — a switch resets it without an effect, the selection just
  // carries the key it belongs to.
  const [selRaw, setSelRaw] = useState({ scope: null, sel: {} });
  const scopeKey = isGlobal ? 'global' : marketplaceId;
  const selection = selRaw.scope === scopeKey ? selRaw.sel : {};
  const setSelection = useCallback((updater) => {
    setSelRaw((s) => {
      const base = s.scope === scopeKey ? s.sel : {};
      return { scope: scopeKey, sel: typeof updater === 'function' ? updater(base) : updater };
    });
  }, [scopeKey]);

  const switchTo = (id) =>
    router.replace(id ? `/profit-loss/template-settings?t=${id}` : '/profit-loss/template-settings');
  const openGlobal = () => switchTo('global');

  const addMarketplace = async () => {
    const name = `Marketplace ${(templates?.length || 0) + 1}`;
    const { ok, data } = await createTemplate({ marketplaceName: name, description: '', config: makeEmptyMarketplaceConfig(name) });
    if (!ok) { addToast(data?.error || 'Could not create marketplace', 'error'); return; }
    refreshList();
    switchTo(data.template.id);
    addToast('Marketplace created');
  };

  const renameMarketplace = async (id, name) => {
    const { ok } = await patchTemplate(id, { marketplaceName: name });
    if (!ok) { addToast('Rename failed', 'error'); return; }
    refreshList();
  };

  const deleteMarketplace = async (id) => {
    if (!window.confirm('Delete this marketplace, all its versions and its change log? This cannot be undone.')) return;
    const { ok } = await deleteTemplate(id);
    if (!ok) { addToast('Delete failed', 'error'); return; }
    refreshList();
    if (id === marketplaceId) switchTo(null);
    addToast('Marketplace deleted');
  };

  const onSelect = useCallback((group, id, anchor) => {
    if (group && group !== '__jump__') setSelection((s) => ({ ...s, [group]: id }));
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    setNavOpen(false);
  }, [setSelection]);

  const sectionProps = (group) => ({
    draft: globalDraft,
    activeId: selection[group] ?? null,
    onActiveId: (id) => setSelection((s) => ({ ...s, [group]: id })),
  });

  async function saveGlobalDraft({ major = false } = {}) {
    if (!globalDraft.valid) { addToast(`Fix ${globalDraft.errors.length} error(s) first`, 'error'); return; }
    const res = await globalDraft.saveDraft({ major });
    if (!res.ok) {
      addToast(res.error || 'Save failed', 'error');
      if (res.details?.length) console.error('global config validation:', res.details);
      return;
    }
    addToast(`Saved draft v${res.version.versionNumber}.${res.version.subVersionNumber}`);
  }

  async function saveMarketplace() {
    if (!marketplaceId) return;
    if (!draft.valid) { addToast(`Fix ${draft.errors.length} error(s) first`, 'error'); return; }
    const res = await draft.save();
    if (!res.ok) {
      addToast(res.error || 'Save failed', 'error');
      if (res.details?.length) console.error('template validation:', res.details);
      return;
    }
    if (res.created) { refreshList(); switchTo(res.templateId); }
    addToast('Marketplace saved');
  }

  // A marketplace's sample-file upload (MarketPlaceSection.uploadSample)
  // proposes its raw sheet columns as new global headers — skips anything
  // that's already a header (case-/whitespace-insensitive, via
  // isDuplicateName, same rule the name inputs redden live against) so
  // re-uploading the same or a similar-shaped sheet never creates
  // duplicates. Only stages them into the local global draft — same as
  // clicking "+ Add Header" by hand, still needs Save Draft to persist.
  const importHeadersFromSheet = useCallback((names) => {
    const pool = [...(globalDraft.config.headers || [])];
    let added = 0;
    for (const raw of names || []) {
      const name = String(raw || '').trim();
      if (!name || isDuplicateName(pool, null, name)) continue;
      const header = { ...makeHeader({ name, type: 'text', source: 'extracted' }), format: 'text', showInTable: false };
      pool.push(header);
      globalDraft.addItem('headers', header);
      added += 1;
    }
    return { added, skipped: (names?.length || 0) - added };
  }, [globalDraft]);

  // The "union" rule the Header/Market Place sections describe but never
  // actually wired up: an auto-imported ("extracted") header only earns its
  // keep in Global Headers while its own sheet column is still unmapped. The
  // moment that column gets mapped to a *different* header in the grid, its
  // own placeholder becomes dead weight — every future upload would keep
  // re-suggesting it as a "new" header even though nobody maps to it anymore.
  // So: once a mapping is made, drop the stale placeholder — but only when
  // nothing else in this marketplace still points at it (a header genuinely
  // in use, including one mapped from a different column, is never touched).
  const reconcileExtractedHeader = useCallback((sheetHeader, mappedToId) => {
    const stale = (globalDraft.config.headers || []).find(
      (h) => h.source === 'extracted' && h.id !== mappedToId
        && h.name.trim().toLowerCase() === String(sheetHeader || '').trim().toLowerCase(),
    );
    if (!stale) return;
    const stillUsed = (draft.config.fileSlots || []).some((s) => (s.mappings || []).some((m) => m.headerId === stale.id));
    if (!stillUsed) globalDraft.removeItem('headers', stale.id);
  }, [globalDraft, draft]);

  // The dashboard's own merge (see DashboardWorkspace.jsx): global config +
  // the active marketplace's own bits. resolveTemplate never reads fileSlots,
  // so the preview only needs `marketplace` merged in for a marketplace view.
  const previewConfig = isGlobal || !marketplaceId
    ? globalDraft.config
    : { ...globalDraft.config, marketplace: draft.config?.marketplace };

  const loading = isGlobal ? globalDraft.loading : draft.loading;
  const loadError = isGlobal ? globalDraft.loadError : draft.loadError;

  return (
    <div className="flex h-full min-h-0">
      <BuilderSidebar
        activeArea={activeArea}
        onOpenGlobal={openGlobal}
        globalDraft={globalDraft}
        draft={draft}
        selection={selection}
        onSelect={onSelect}
        templates={templates}
        activeTemplateId={marketplaceId}
        onSwitchTemplate={switchTo}
        onAddMarketplace={addMarketplace}
        onRenameMarketplace={renameMarketplace}
        onDeleteMarketplace={deleteMarketplace}
        mobileOpen={navOpen}
        onCloseMobile={() => setNavOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-divider bg-background px-4 py-2.5 sm:px-6 lg:px-8 hidden">
          <button type="button" onClick={() => setNavOpen(true)} className="rounded-lg border border-divider p-1.5 text-muted hover:bg-card-hover lg:hidden" aria-label="Open builder list">
            <PanelLeft size={16} />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-bold text-foreground">
              {isGlobal ? 'Global Settings' : marketplaceId ? draft.template?.marketplaceName || 'Marketplace' : 'Template Settings'}
            </h1>
            <p className="truncate text-[11.5px] text-subtle">
              {isGlobal
                ? 'Header · Title Card · Graph · Tab · Overview Tab — shared by every marketplace.'
                : marketplaceId
                  ? `id ${draft.template?.id} · ${draft.template?.templateNumber} · updated ${draft.template?.updatedAt ? new Date(draft.template.updatedAt).toLocaleString() : '—'}`
                  : `${templates?.length ?? 0} marketplace${(templates?.length ?? 0) === 1 ? '' : 's'} — pick Global Settings, or a marketplace on the left.`}
            </p>
          </div>
        </div>

        {!activeArea ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-action-soft text-action"><Store size={26} /></div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Nothing selected</h2>
              <p className="mt-1 max-w-sm text-sm text-muted">
                Pick Global Settings to edit Headers/Tabs/Graphs (shared by every marketplace), or pick/add a
                marketplace to edit its files and column mapping.
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={openGlobal} className="inline-flex items-center gap-1.5 rounded-full border border-divider px-5 py-2 text-sm font-semibold text-foreground hover:bg-card-hover">
                <Globe size={15} /> Global Settings
              </button>
              <button type="button" onClick={addMarketplace} className="inline-flex items-center gap-1.5 rounded-full bg-action px-5 py-2 text-sm font-semibold text-white hover:bg-action-hover">
                <Store size={15} /> Add New Market Place
              </button>
            </div>
          </div>
        ) : loadError ? (
          <div className="p-10 text-center text-sm text-neg">This marketplace could not be loaded.</div>
        ) : loading ? (
          <div className="flex flex-1 items-center justify-center text-muted"><Loader2 className="animate-spin" size={26} /></div>
        ) : (
          <>
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              {/* 1st half — settings */}
              <div className="min-h-0 flex-1 overflow-y-auto bg-surface px-4 py-6 pb-10 sm:px-6 lg:w-1/2 lg:flex-none lg:border-r lg:border-divider lg:px-8">
                <div className="mx-auto w-full max-w-2xl space-y-5">
                  {isGlobal ? (
                    <>
                      <HeaderSection {...sectionProps('header')} />
                      <GraphSection {...sectionProps('graph')} />
                      <TitleCardSection {...sectionProps('titleCard')} />
                      <TabSection {...sectionProps('tab')} />
                      <OverviewTabSection {...sectionProps('overview')} />
                    </>
                  ) : (
                    <>
                      <MarketPlaceSection
                        draft={draft}
                        globalHeaders={globalDraft.config.headers || []}
                        onImportHeaders={importHeadersFromSheet}
                        onHeaderMapped={reconcileExtractedHeader}
                        activeSlotId={selection.file ?? null}
                        onActiveSlotId={(id) => setSelection((s) => ({ ...s, file: id }))}
                      />
                    </>
                  )}
                  {isGlobal && <VersionSection draft={globalDraft} />}
                </div>
              </div>

              {/* 2nd half — live preview (desktop only; a toggle opens it full-screen below lg) */}
              <div className="hidden min-h-0 flex-1 flex-col overflow-hidden lg:flex lg:w-1/2">
                <BuilderPreview config={previewConfig} />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider bg-card px-4 py-3 sm:px-6 lg:px-8">
              <div className="flex items-center gap-3 text-[12px]">
                {(isGlobal ? globalDraft.errors : draft.errors).length > 0 ? (
                  <span className="inline-flex items-center gap-1 text-neg" title={(isGlobal ? globalDraft.errors : draft.errors).join('\n')}>
                    <AlertTriangle size={13} /> {(isGlobal ? globalDraft.errors : draft.errors).length} error{(isGlobal ? globalDraft.errors : draft.errors).length === 1 ? '' : 's'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-action"><Check size={13} /> valid</span>
                )}
                {(isGlobal ? globalDraft.dirty : draft.dirty) && <span className="text-subtle">· unsaved changes</span>}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setMobilePreviewOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-divider px-3 py-1.5 text-[13px] font-medium text-muted hover:bg-card-hover lg:hidden">
                  <Eye size={14} /> Preview
                </button>
                <button type="button" onClick={() => setLogsOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-divider px-3 py-1.5 text-[13px] font-medium text-muted hover:bg-card-hover">
                  <History size={14} /> Log
                </button>
                {isGlobal ? (
                  <>
                    <button type="button" onClick={() => saveGlobalDraft({ major: true })} disabled={globalDraft.saving} className="rounded-full border border-divider px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-card-hover disabled:opacity-50">
                      Save as new version
                    </button>
                    <button type="button" onClick={() => saveGlobalDraft()} disabled={globalDraft.saving || (!globalDraft.dirty && !!globalDraft.activeVersionId)} className="inline-flex items-center gap-1.5 rounded-full bg-action px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-action-hover disabled:opacity-50">
                      {globalDraft.saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Save Draft
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={saveMarketplace} disabled={draft.saving || !draft.dirty} className="inline-flex items-center gap-1.5 rounded-full bg-action px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-action-hover disabled:opacity-50">
                    {draft.saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    Save
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {mobilePreviewOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background lg:hidden">
          <button
            type="button"
            onClick={() => setMobilePreviewOpen(false)}
            className="flex items-center gap-1.5 border-b border-divider px-4 py-2.5 text-left text-[13px] font-medium text-muted hover:bg-card-hover"
          >
            <X size={16} /> Close preview
          </button>
          <div className="min-h-0 flex-1">
            <BuilderPreview config={previewConfig} />
          </div>
        </div>
      )}

      <TemplateLogPanel
        templateId={isGlobal ? globalDraft.template?.id : marketplaceId}
        open={logsOpen}
        onClose={() => setLogsOpen(false)}
      />
    </div>
  );
}
