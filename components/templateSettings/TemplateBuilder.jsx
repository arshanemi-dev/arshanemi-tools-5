'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Check, Eye, Globe, History, Loader2, PanelLeft, Store, X } from 'lucide-react';
import { useToast } from '@/components/admin/Toast';
import { makeEmptyMarketplaceConfig } from '@/data/templateSchema';
import { listTemplates, createTemplate, patchTemplate, deleteTemplate } from '@/lib/profitLoss/templatesApi';
import useTemplateDraft from './useTemplateDraft';
import useMarketplaceMappingSaver from './useMarketplaceMappingSaver';
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
import { GlobalPublishBanner, PublishButton, usePublishGlobal } from './GlobalPublish';

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
  const publishGlobal = usePublishGlobal(globalDraft);
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

  // `__focus` remembers which group was picked LAST (sidebar or a section's
  // own list) — that item is what the live preview highlights.
  const onSelect = useCallback((group, id, anchor) => {
    if (group && group !== '__jump__') setSelection((s) => ({ ...s, [group]: id, __focus: group }));
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    setNavOpen(false);
  }, [setSelection]);

  const sectionProps = (group) => ({
    draft: globalDraft,
    activeId: selection[group] ?? null,
    onActiveId: (id) => setSelection((s) => ({ ...s, [group]: id, __focus: group })),
  });

  const previewHighlight = isGlobal && selection.__focus && selection[selection.__focus]
    ? { kind: selection.__focus, id: selection[selection.__focus] }
    : null;

  // The live preview only earns its half of the screen while a Tab or an
  // Overview Tab is the last thing picked (and still exists) — for Header /
  // Graph / Title Card / Market Place work it's hidden and the settings
  // column takes the full width.
  const focusList = { tab: globalDraft.config.tabs, overview: globalDraft.config.overviewTabs }[selection.__focus];
  const showPreview = isGlobal && !!focusList?.some((it) => it.id === selection[selection.__focus]);

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
    if (res.created) switchTo(res.templateId);
    refreshList(); // the global Header matrix reads each marketplace's saved headers/mappings from this list
    addToast('Marketplace saved');
  }

  // Our Headers are only ever what's created in Global Settings › Header — a
  // marketplace's sheet columns are never imported into them, and nothing
  // is mapped automatically (the user maps with the Header section's
  // checkboxes + Mapped button).

  // The Header section's mapping edits — each one saves that marketplace.
  const mappingSaver = useMarketplaceMappingSaver(templates, setTemplates, addToast);

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
              {/* 1st half — settings (full width while the preview is hidden) */}
              <div className={`min-h-0 flex-1 overflow-y-auto bg-surface px-4 py-6 pb-10 sm:px-6 lg:px-8 ${showPreview ? 'lg:w-1/2 lg:flex-none lg:border-r lg:border-divider' : ''}`}>
                <div className="w-full space-y-5">
                  {isGlobal ? (
                    <>
                      <GlobalPublishBanner draft={globalDraft} publish={publishGlobal} />
                      <HeaderSection
                        {...sectionProps('header')}
                        marketplaces={templates}
                        mappingSaver={mappingSaver}
                      />
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
                        onSheetsSaved={refreshList}
                        activeSlotId={selection.file ?? null}
                        onActiveSlotId={(id) => setSelection((s) => ({ ...s, file: id }))}
                      />
                    </>
                  )}
                  {isGlobal && <VersionSection draft={globalDraft} />}
                </div>
              </div>

              {/* 2nd half — live preview, only for a picked Tab / Overview Tab (desktop only; a toggle opens it full-screen below lg) */}
              {showPreview && (
                <div className="hidden min-h-0 flex-1 flex-col overflow-hidden lg:flex lg:w-1/2">
                  <BuilderPreview config={previewConfig} highlight={previewHighlight} />
                </div>
              )}
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
                {showPreview && (
                  <button type="button" onClick={() => setMobilePreviewOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-divider px-3 py-1.5 text-[13px] font-medium text-muted hover:bg-card-hover lg:hidden">
                    <Eye size={14} /> Preview
                  </button>
                )}
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
                    <PublishButton publish={publishGlobal} />
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

      {mobilePreviewOpen && showPreview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background lg:hidden">
          <button
            type="button"
            onClick={() => setMobilePreviewOpen(false)}
            className="flex items-center gap-1.5 border-b border-divider px-4 py-2.5 text-left text-[13px] font-medium text-muted hover:bg-card-hover"
          >
            <X size={16} /> Close preview
          </button>
          <div className="min-h-0 flex-1">
            <BuilderPreview config={previewConfig} highlight={previewHighlight} />
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
