'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, Rocket } from 'lucide-react';
import { useToast } from '@/components/admin/Toast';

// The dashboard ONLY ever renders the Global Settings' *live* version — Save
// Draft alone never reaches it, which made new Tabs / Overview Tabs look
// "not showing" when they were just sitting in an unpublished draft. These
// make that state impossible to miss and one click to fix: a banner at the
// top of Global Settings saying what the dashboard is actually on, and a
// Publish button (saves first if there's anything unsaved).

const label = (v) => (v ? `v${v.versionNumber}.${v.subVersionNumber}` : '');
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '');

export function usePublishGlobal(draft) {
  const { addToast } = useToast();
  const [publishing, setPublishing] = useState(false);
  const publishNow = async () => {
    if (!draft.valid) { addToast(`Fix ${draft.errors.length} error(s) first`, 'error'); return; }
    setPublishing(true);
    try {
      const res = await draft.saveAndPublish();
      if (!res.ok) {
        addToast(res.error || 'Publish failed', 'error');
        if (res.details?.length) console.error('global config validation:', res.details);
        return;
      }
      addToast('Published — the dashboard now shows these Tabs, Overview Tabs, cards and graphs');
    } finally {
      setPublishing(false);
    }
  };
  return { publishing, publishNow, disabled: publishing || draft.saving || draft.onDashboard };
}

export function PublishButton({ publish }) {
  return (
    <button
      type="button"
      onClick={publish.publishNow}
      disabled={publish.disabled}
      title="Save (if needed) and make this the version the dashboard shows"
      className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
    >
      {publish.publishing ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
      Publish
    </button>
  );
}

export function GlobalPublishBanner({ draft, publish }) {
  const { liveVersion, activeVersion, dirty, onDashboard, loading } = draft;
  if (loading) return null;
  if (onDashboard) {
    return (
      <p className="flex items-center gap-1.5 rounded-xl border border-divider bg-background px-3 py-2 text-[12.5px] text-muted">
        <CheckCircle2 size={14} className="shrink-0 text-action" />
        Live on the dashboard — {label(liveVersion)}{liveVersion?.publishedAt ? `, published ${fmtDate(liveVersion.publishedAt)}` : ''}.
      </p>
    );
  }
  const editing = dirty
    ? 'Your unsaved changes'
    : `Your saved draft ${label(activeVersion)}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/5 px-3.5 py-2.5">
      <p className="min-w-0 flex-1 text-[12.5px] text-foreground">
        <span className="font-semibold">Not on the dashboard yet.</span>{' '}
        {editing} {dirty ? 'are' : 'is'} only visible here — the dashboard still shows{' '}
        {liveVersion ? <span className="font-semibold">{label(liveVersion)}</span> : 'nothing'}
        {liveVersion?.publishedAt ? ` (published ${fmtDate(liveVersion.publishedAt)})` : ''}. Publish to show it.
      </p>
      <PublishButton publish={publish} />
    </div>
  );
}
