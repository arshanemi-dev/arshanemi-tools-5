'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Check, Eye, History, Loader2, PanelLeft, Store, X } from 'lucide-react';
import { useToast } from '@/components/admin/Toast';
import { makeEmptyConfig } from '@/data/templateSchema';
import { listTemplates, createTemplate, patchTemplate, deleteTemplate } from '@/lib/profitLoss/templatesApi';
import useTemplateDraft from './useTemplateDraft';
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

// The single builder page (image 2). One left sidebar lists every marketplace
// (add / rename / delete) and, for the active one, every entity — files,
// headers (sheet + default), title cards, tabs, graphs — each section with
// its own search + add / rename / delete. The active marketplace is tracked
// in ?t=<templateId>. There is no separate list / new / [id] route.
export default function TemplateBuilder() {
  const router = useRouter();
  const sp = useSearchParams();
  const { addToast } = useToast();

  const activeId = sp.get('t') || null;
  const draft = useTemplateDraft(activeId);

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

  // Per-section selection, scoped to the active marketplace (a switch resets it
  // without an effect — the selection just carries the id it belongs to).
  const [selRaw, setSelRaw] = useState({ t: null, sel: {} });
  const selection = selRaw.t === activeId ? selRaw.sel : {};
  const setSelection = useCallback((updater) => {
    setSelRaw((s) => {
      const base = s.t === activeId ? s.sel : {};
      return { t: activeId, sel: typeof updater === 'function' ? updater(base) : updater };
    });
  }, [activeId]);

  const switchTo = (id) =>
    router.replace(id ? `/profit-loss/template-settings?t=${id}` : '/profit-loss/template-settings');

  const addMarketplace = async () => {
    const name = `Marketplace ${(templates?.length || 0) + 1}`;
    const { ok, data } = await createTemplate({ marketplaceName: name, description: '', config: makeEmptyConfig(name) });
    if (!ok) { addToast(data?.error || 'Could not create marketplace', 'error'); return; }
    refreshList();
    switchTo(data.template.id);
    addToast('Marketplace created');
  };

  const renameMarketplace = async (id, name) => {
    const { ok } = await patchTemplate(id, { marketplaceName: name });
    if (!ok) { addToast('Rename failed', 'error'); return; }
    refreshList();
    if (id === activeId) draft.reloadMeta();
  };

  const deleteMarketplace = async (id) => {
    if (!window.confirm('Delete this marketplace, all its versions and its change log? This cannot be undone.')) return;
    const { ok } = await deleteTemplate(id);
    if (!ok) { addToast('Delete failed', 'error'); return; }
    refreshList();
    if (id === activeId) switchTo(null);
    addToast('Marketplace deleted');
  };

  const onSelect = useCallback((group, id, anchor) => {
    if (group && group !== '__jump__') setSelection((s) => ({ ...s, [group]: id }));
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    setNavOpen(false);
  }, [setSelection]);

  const sectionProps = (group) => ({
    draft,
    activeId: selection[group] ?? null,
    onActiveId: (id) => setSelection((s) => ({ ...s, [group]: id })),
  });

  async function save({ major = false } = {}) {
    if (!activeId) return;
    if (!draft.valid) { addToast(`Fix ${draft.errors.length} template error(s) first`, 'error'); return; }
    const res = await draft.saveDraft({ major });
    if (!res.ok) {
      addToast(res.error || 'Save failed', 'error');
      if (res.details?.length) console.error('template validation:', res.details);
      return;
    }
    refreshList();
    addToast(`Saved draft v${res.version.versionNumber}.${res.version.subVersionNumber}`);
  }

  return (
    <div className="flex h-full min-h-0">
      <BuilderSidebar
        draft={draft}
        selection={selection}
        onSelect={onSelect}
        templates={templates}
        activeTemplateId={activeId}
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
              {activeId ? draft.template?.marketplaceName || 'Marketplace' : 'Template Settings'}
            </h1>
            <p className="truncate text-[11.5px] text-subtle">
              {activeId
                ? `id ${draft.template?.id} · ${draft.template?.templateNumber} · updated ${draft.template?.updatedAt ? new Date(draft.template.updatedAt).toLocaleString() : '—'}`
                : `${templates?.length ?? 0} marketplace${(templates?.length ?? 0) === 1 ? '' : 's'} — pick one on the left, or add a new one.`}
            </p>
          </div>
        </div>

        {!activeId ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-action-soft text-action"><Store size={26} /></div>
            <div>
              <h2 className="text-lg font-bold text-foreground">No marketplace selected</h2>
              <p className="mt-1 max-w-sm text-sm text-muted">Pick a marketplace from the sidebar, or add a new one to start building its dashboard template.</p>
            </div>
            <button type="button" onClick={addMarketplace} className="inline-flex items-center gap-1.5 rounded-full bg-action px-5 py-2 text-sm font-semibold text-white hover:bg-action-hover">
              <Store size={15} /> Add New Market Place
            </button>
          </div>
        ) : draft.loadError ? (
          <div className="p-10 text-center text-sm text-neg">This marketplace could not be loaded.</div>
        ) : draft.loading ? (
          <div className="flex flex-1 items-center justify-center text-muted"><Loader2 className="animate-spin" size={26} /></div>
        ) : (
          <>
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              {/* 1st half — settings */}
              <div className="min-h-0 flex-1 overflow-y-auto bg-surface px-4 py-6 pb-10 sm:px-6 lg:w-1/2 lg:flex-none lg:border-r lg:border-divider lg:px-8">
                <div className="mx-auto w-full max-w-2xl space-y-5">
                  <HeaderSection {...sectionProps('header')} />
                  <MarketPlaceSection draft={draft} activeSlotId={selection.file ?? null} onActiveSlotId={(id) => setSelection((s) => ({ ...s, file: id }))} />
                  <GraphSection {...sectionProps('graph')} />
                  <TitleCardSection {...sectionProps('titleCard')} />
                  <TabSection {...sectionProps('tab')} />
                  <OverviewTabSection {...sectionProps('overview')} />
                  <VersionSection draft={draft} />
                </div>
              </div>

              {/* 2nd half — live preview (desktop only; a toggle opens it full-screen below lg) */}
              <div className="hidden min-h-0 flex-1 flex-col overflow-hidden lg:flex lg:w-1/2">
                <BuilderPreview config={draft.config} />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider bg-card px-4 py-3 sm:px-6 lg:px-8">
              <div className="flex items-center gap-3 text-[12px]">
                {draft.errors.length > 0 ? (
                  <span className="inline-flex items-center gap-1 text-neg" title={draft.errors.join('\n')}>
                    <AlertTriangle size={13} /> {draft.errors.length} error{draft.errors.length === 1 ? '' : 's'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-action"><Check size={13} /> valid</span>
                )}
                {draft.dirty && <span className="text-subtle">· unsaved changes</span>}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setMobilePreviewOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-divider px-3 py-1.5 text-[13px] font-medium text-muted hover:bg-card-hover lg:hidden">
                  <Eye size={14} /> Preview
                </button>
                <button type="button" onClick={() => setLogsOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-divider px-3 py-1.5 text-[13px] font-medium text-muted hover:bg-card-hover">
                  <History size={14} /> Log
                </button>
                <button type="button" onClick={() => save({ major: true })} disabled={draft.saving} className="rounded-full border border-divider px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-card-hover disabled:opacity-50">
                  Save as new version
                </button>
                <button type="button" onClick={() => save()} disabled={draft.saving || (!draft.dirty && !!draft.activeVersionId)} className="inline-flex items-center gap-1.5 rounded-full bg-action px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-action-hover disabled:opacity-50">
                  {draft.saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Save Draft
                </button>
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
            <BuilderPreview config={draft.config} />
          </div>
        </div>
      )}

      <TemplateLogPanel templateId={activeId} open={logsOpen} onClose={() => setLogsOpen(false)} />
    </div>
  );
}
