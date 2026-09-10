'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, History, Loader2 } from 'lucide-react';
import { useToast } from '@/components/admin/Toast';
import useTemplateDraft from './useTemplateDraft';
import HeaderSection from './HeaderSection';
import TitleCardSection from './TitleCardSection';
import GraphDesignSection from './GraphDesignSection';
import GraphDataSection from './GraphDataSection';
import TabSection from './TabSection';
import OverviewTabSection from './OverviewTabSection';
import MarketPlaceSection from './MarketPlaceSection';
import VersionSection from './VersionSection';
import TemplateLogPanel from './TemplateLogPanel';

const PILLS = [
  ['section-market-place', 'Market Place'],
  ['section-header', 'Header'],
  ['section-title-card', 'Title Card'],
  ['section-graph-design', 'Graph Design'],
  ['section-graph-data', 'Graph Data'],
  ['section-tab', 'Tab'],
  ['section-overview', 'Overview Tab'],
  ['section-version', 'Version Page'],
];

// The one scrolling builder page (image 2). Sticky jump-nav, every section
// always rendered, a Save / Save-as-new-version footer. Publishing is done
// from the Version Page's on/off toggle.
export default function TemplateBuilder({ templateId = null }) {
  const router = useRouter();
  const { addToast } = useToast();
  const draft = useTemplateDraft(templateId);
  const [logsOpen, setLogsOpen] = useState(false);

  if (draft.loadError) {
    return <div className="p-10 text-center text-sm text-neg">This template could not be loaded.</div>;
  }
  if (draft.loading) {
    return <div className="flex justify-center p-16 text-muted"><Loader2 className="animate-spin" size={26} /></div>;
  }

  const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  async function save({ major = false } = {}) {
    if (!draft.valid) { addToast(`Fix ${draft.errors.length} template error(s) first`, 'error'); return; }
    const res = await draft.saveDraft({ major });
    if (!res.ok) {
      addToast(res.error || 'Save failed', 'error');
      if (res.details?.length) console.error('template validation:', res.details);
      return;
    }
    if (res.created) {
      addToast('Template created');
      router.push(`/profit-loss/template-settings/${res.templateId}`);
      return;
    }
    addToast(`Saved draft v${res.version.versionNumber}.${res.version.subVersionNumber}`);
  }

  return (
    <div className="pb-24">
      {/* jump-nav */}
      <div className="sticky top-0 z-20 flex flex-wrap gap-1.5 border-b border-divider bg-background/95 px-4 py-2 backdrop-blur sm:px-6 lg:px-10">
        {PILLS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => jump(id)} className="rounded-full border border-divider bg-card px-3 py-1 text-[12px] font-medium text-muted hover:bg-card-hover">
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-10 px-4 py-6 sm:px-6 lg:px-10">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {templateId ? draft.template?.marketplaceName || 'Template' : 'New Marketplace Template'}
          </h1>
          <p className="mt-0.5 text-[13px] text-subtle">
            {templateId
              ? `id ${draft.template?.id} · ${draft.template?.templateNumber} · last updated ${draft.template?.updatedAt ? new Date(draft.template.updatedAt).toLocaleString() : '—'}`
              : 'Fill the sections below, then Save to create the template and its first draft version.'}
          </p>
        </div>

        <MarketPlaceSection draft={draft} />
        <HeaderSection draft={draft} />
        <TitleCardSection draft={draft} />
        <GraphDesignSection draft={draft} />
        <GraphDataSection draft={draft} />
        <TabSection draft={draft} />
        <OverviewTabSection draft={draft} />
        <VersionSection draft={draft} />
      </div>

      {/* footer */}
      <div className="fixed bottom-0 left-0 right-0 z-30 flex flex-wrap items-center justify-between gap-3 border-t border-divider bg-card px-4 py-3 sm:px-6 lg:px-10">
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
          {templateId && (
            <button type="button" onClick={() => setLogsOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-divider px-3 py-1.5 text-[13px] font-medium text-muted hover:bg-card-hover">
              <History size={14} /> Log
            </button>
          )}
          {templateId && (
            <button type="button" onClick={() => save({ major: true })} disabled={draft.saving} className="rounded-full border border-divider px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-card-hover disabled:opacity-50">
              Save as new version
            </button>
          )}
          <button type="button" onClick={() => save()} disabled={draft.saving || (!draft.dirty && !!draft.activeVersionId)} className="inline-flex items-center gap-1.5 rounded-full bg-action px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-action-hover disabled:opacity-50">
            {draft.saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {templateId ? 'Save Draft' : 'Create Template'}
          </button>
        </div>
      </div>

      <TemplateLogPanel templateId={templateId} open={logsOpen} onClose={() => setLogsOpen(false)} />
    </div>
  );
}
