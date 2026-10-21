'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Check, Eye, Globe, History, Loader2, PanelLeft, Store, X } from 'lucide-react';
import { useToast } from '@/components/admin/Toast';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import {
  makeMarketplace, marketplaceListOf, withMarketplaceAdded, withMarketplaceConfig, withMarketplaceRemoved, withMarketplaceRenamed,
} from '@/lib/profitLoss/versionMarketplaces';
import useGlobalTemplateDraft from './useGlobalTemplateDraft';
import useVersionMarketplace from './useVersionMarketplace';
import BuilderSidebar, { GLOBAL_SECTIONS } from './BuilderSidebar';
import GlobalSectionPicker from './GlobalSectionPicker';
import BuilderPreview from './BuilderPreview';
import HeaderSection from './HeaderSection';
import TitleCardSection from './TitleCardSection';
import GraphSection from './GraphSection';
import TabSection from './TabSection';
import OverviewTabSection from './OverviewTabSection';
import TabsOrganizerSection from './TabsOrganizerSection';
import MarketPlaceSection from './MarketPlaceSection';
import VersionSection from './VersionSection';
import TemplateLogPanel from './TemplateLogPanel';
import { GlobalSaveButtons, GlobalVersionBar, useGlobalSave } from './GlobalVersion';
import useHeaderGroups from './useHeaderGroups';
import { headerGroupsOf, withHeaderGroups } from '@/lib/profitLoss/headerGroups';

function scrollToAnchor(anchor) {
  if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

const LATER = ' — Save New Version to keep it';

// The single builder page. One left sidebar has two areas: Global Settings
// (Header / Graph / Title Card / Tab / Overview Tab — one shared config
// every marketplace's dashboard renders identically) and Market Place (add /
// rename / delete every marketplace; the active one only edits its Files —
// upload slots + column mapping against the global headers). `?t=` carries
// either 'global' or a marketplace id. There is no separate list / new / [id]
// route.
//
// Both areas edit ONE thing — the Global Settings draft (useGlobalTemplateDraft):
// headers with their groups and Show / Hide flags, title cards, graphs, tabs,
// overview tabs AND every marketplace with its files and mappings are all
// part of a version. Nothing saves on its own; the footer's Save New Version
// keeps it all, and switching a version Live on the Version Page puts
// exactly that version's setup on the dashboard.
export default function TemplateBuilder() {
  const router = useRouter();
  const sp = useSearchParams();
  const { addToast } = useToast();

  const activeId = sp.get('t') || null;
  const isGlobal = activeId === 'global';
  const marketplaceId = isGlobal ? null : activeId;
  const activeArea = isGlobal ? 'global' : marketplaceId ? 'marketplace' : null;

  const globalDraft = useGlobalTemplateDraft();
  const globalSave = useGlobalSave(globalDraft); // "Save New Version" — every save is a new version, see GlobalVersion.jsx
  const { setConfig: setGlobalConfig } = globalDraft;
  // The active marketplace — one entry of the draft's `marketplaces`.
  const draft = useVersionMarketplace(globalDraft, marketplaceId);

  const [logsOpen, setLogsOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null); // marketplace awaiting the delete confirm

  // The draft's marketplaces in the list shape the sidebar and the Header
  // matrix read (null while loading = the sidebar's spinner).
  const draftMarketplaces = globalDraft.config.marketplaces;
  const templates = useMemo(
    () => (globalDraft.loading ? null : marketplaceListOf({ marketplaces: draftMarketplaces })),
    [globalDraft.loading, draftMarketplaces],
  );

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

  // Add / rename / delete a marketplace — edits of the draft, like the rest.
  const addMarketplace = () => {
    if (globalDraft.loading || globalDraft.loadError) return;
    const taken = new Set((templates || []).map((t) => t.marketplaceName));
    let n = (templates?.length || 0) + 1;
    while (taken.has(`Marketplace ${n}`)) n += 1;
    const entry = makeMarketplace(`Marketplace ${n}`);
    setGlobalConfig((c) => withMarketplaceAdded(c, entry));
    switchTo(entry.id);
    addToast(`“${entry.name}” added${LATER}`);
  };

  const renameMarketplace = (id, name) => {
    if ((templates || []).find((t) => t.id === id)?.marketplaceName === name) return;
    setGlobalConfig((c) => withMarketplaceRenamed(c, id, name));
    addToast(`Marketplace renamed to “${name}”${LATER}`);
  };

  const deleting = (templates || []).find((t) => t.id === deletingId) || null;
  const confirmDeleteMarketplace = () => {
    if (!deleting) return;
    setGlobalConfig((c) => withMarketplaceRemoved(c, deleting.id));
    if (deleting.id === marketplaceId) switchTo(null);
    addToast(`“${deleting.marketplaceName}” deleted${LATER}`);
    setDeletingId(null);
  };

  // `__focus` remembers which group was picked LAST (sidebar or a section's
  // own list) — that item is what the live preview highlights. `__open` is
  // the one Global Settings section shown in the main column: only ever set
  // by a click (a sidebar row/group, or GlobalSectionPicker's chips), so
  // nothing opens on its own, and it resets with the area like the rest.
  const onSelect = useCallback((group, id, anchor) => {
    if (group) setSelection((s) => ({ ...s, [group]: id, __focus: group, __open: group }));
    scrollToAnchor(anchor);
    setNavOpen(false);
  }, [setSelection]);
  const onOpenSection = useCallback((key, anchor) => {
    setSelection((s) => ({ ...s, __open: key }));
    scrollToAnchor(anchor);
    setNavOpen(false);
  }, [setSelection]);
  const openSection = selection.__open ?? null;

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
  const organizerOpen = ['tabsOrganizer', 'overviewOrganizer'].includes(selection.__focus); // preview shows the new tab order live
  const showPreview = isGlobal && (organizerOpen || !!focusList?.some((it) => it.id === selection[selection.__focus]));

  // Our Headers are only ever what's created in Global Settings › Header — a
  // marketplace's sheet columns are never imported into them, and nothing
  // is mapped automatically (the user maps with the Header section's
  // checkboxes + Mapped button).

  // The Header section's mapping edits — into that marketplace in the draft.
  const mappingSaver = useMemo(() => ({
    saving: false,
    update: (mid, fn) => { setGlobalConfig((c) => withMarketplaceConfig(c, mid, fn)); return Promise.resolve(true); },
  }), [setGlobalConfig]);

  // Header › Our Groups and each header's Show / Hide switch — in the draft too.
  const headerGroups = useHeaderGroups(globalDraft, addToast);

  // The dashboard's own merge (see DashboardWorkspace.jsx): global config +
  // the active marketplace's own bits, with My Details grouped by header
  // group (withHeaderGroups). The Show / Hide switch is NOT applied here:
  // it hides a header on the dashboard only — everywhere in Template
  // Settings, this preview included, every header stays in view.
  // resolveTemplate never reads fileSlots, so the preview only needs
  // `marketplace` merged in for a marketplace view.
  const draftMarketplace = draft.config?.marketplace;
  const previewConfig = useMemo(() => {
    const { marketplaces: _all, ...global } = globalDraft.config;
    const base = isGlobal || !marketplaceId ? global : { ...global, marketplace: draftMarketplace };
    const groups = headerGroupsOf(global);
    return groups ? withHeaderGroups(base, { ...groups, hiddenHeaderIds: [] }) : base;
  }, [isGlobal, marketplaceId, globalDraft.config, draftMarketplace]);

  // A marketplace is part of the version in the editor, so a marketplace view
  // waits for Global Settings like everything else. `missing`: no such
  // marketplace in the version that's open (deleted, or another version picked).
  const loading = globalDraft.loading;
  const loadError = globalDraft.loadError;
  const missing = !isGlobal && !!marketplaceId && !loading && !loadError && !draft.template;

  return (
    <div className="flex h-full min-h-0">
      <BuilderSidebar
        activeArea={activeArea}
        onOpenGlobal={openGlobal}
        globalDraft={globalDraft}
        draft={draft}
        selection={selection}
        onSelect={onSelect}
        onOpenSection={onOpenSection}
        templates={templates}
        activeTemplateId={marketplaceId}
        onSwitchTemplate={switchTo}
        onAddMarketplace={addMarketplace}
        onRenameMarketplace={renameMarketplace}
        onDeleteMarketplace={setDeletingId}
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
                  ? `id ${draft.template?.id || '—'}${draft.template?.templateNumber ? ` · ${draft.template.templateNumber}` : ''} · part of the Global Settings version`
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
          <div className="p-10 text-center text-sm text-neg">
            Global Settings could not be loaded — reload the page to try again.
          </div>
        ) : loading ? (
          <div className="flex flex-1 items-center justify-center text-muted"><Loader2 className="animate-spin" size={26} /></div>
        ) : missing ? (
          <div className="p-10 text-center text-sm text-muted">
            This marketplace isn&rsquo;t in the version open in the editor — pick one on the left.
          </div>
        ) : (
          <>
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              {/* 1st half — settings (full width while the preview is hidden) */}
              <div className={`min-h-0 flex-1 overflow-y-auto bg-surface px-4 py-6 pb-10 sm:px-6 lg:px-8 ${showPreview ? 'lg:w-1/2 lg:flex-none lg:border-r lg:border-divider' : ''}`}>
                <div className="w-full space-y-5">
                  {isGlobal ? (
                    <>
                      <GlobalVersionBar draft={globalDraft} onOpenVersionPage={() => onOpenSection('version', 'section-version')} />
                      <GlobalSectionPicker sections={GLOBAL_SECTIONS} openKey={openSection} onOpen={onOpenSection} />
                      {openSection === 'header' && (
                        <HeaderSection
                          {...sectionProps('header')}
                          marketplaces={templates}
                          mappingSaver={mappingSaver}
                          headerGroups={headerGroups}
                        />
                      )}
                      {openSection === 'graph' && <GraphSection {...sectionProps('graph')} />}
                      {openSection === 'titleCard' && <TitleCardSection {...sectionProps('titleCard')} />}
                      {openSection === 'tab' && <TabSection {...sectionProps('tab')} />}
                      {openSection === 'tabsOrganizer' && (
                        <TabsOrganizerSection draft={globalDraft} kind="tab" onSave={() => globalSave.save()} saving={globalDraft.saving} />
                      )}
                      {openSection === 'overview' && <OverviewTabSection {...sectionProps('overview')} />}
                      {openSection === 'overviewOrganizer' && (
                        <TabsOrganizerSection draft={globalDraft} kind="overview" onSave={() => globalSave.save()} saving={globalDraft.saving} />
                      )}
                      {openSection === 'version' && <VersionSection draft={globalDraft} />}
                    </>
                  ) : (
                    <>
                      <MarketPlaceSection
                        draft={draft}
                        globalHeaders={globalDraft.config.headers || []}
                        activeSlotId={selection.file ?? null}
                        onActiveSlotId={(id) => setSelection((s) => ({ ...s, file: id }))}
                      />
                    </>
                  )}
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
                {globalDraft.errors.length > 0 ? (
                  <span className="inline-flex items-center gap-1 text-neg" title={globalDraft.errors.join('\n')}>
                    <AlertTriangle size={13} /> {globalDraft.errors.length} error{globalDraft.errors.length === 1 ? '' : 's'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-action"><Check size={13} /> valid</span>
                )}
                {globalDraft.dirty && <span className="text-subtle">· unsaved changes</span>}
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
                <GlobalSaveButtons draft={globalDraft} save={globalSave} />
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
        templateId={globalDraft.template?.id}
        open={logsOpen}
        onClose={() => setLogsOpen(false)}
      />

      <ConfirmDialog
        open={!!deleting}
        title={`Delete marketplace “${deleting?.marketplaceName || ''}”?`}
        description="Its files, sheet settings and column mappings go with it. This is a change to the editor like any other: Save New Version keeps it, and versions saved before still have this marketplace."
        onConfirm={confirmDeleteMarketplace}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
}
