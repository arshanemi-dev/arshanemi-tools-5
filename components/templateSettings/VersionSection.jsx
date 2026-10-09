'use client';

import { useMemo, useState } from 'react';
import { Loader2, Search, Trash2 } from 'lucide-react';
import { useToast } from '@/components/admin/Toast';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { failureMessage } from '@/lib/profitLoss/templatesApi';
import { versionToOpen } from './useGlobalTemplateDraft';
import SectionHead from './SectionHead';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');
const label = (v) => `v${v.versionNumber}.${v.subVersionNumber}`;

// image 2 · Version Page — every saved version with an on/off toggle that
// publishes / unpublishes it. Create date = created_at, Live date = published_at.
// Every row also has a Delete (behind a confirm): any version except the one
// that is live — the dashboard is showing that one. The button is disabled
// there, but the rule itself is the hub's (it answers 409), so a stale list
// or a second admin can't get round it.
export default function VersionSection({ draft }) {
  const { addToast } = useToast();
  const { versions = [], template, publish, removeVersion, activeVersionId, dirty } = draft;
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [deleteId, setDeleteId] = useState(null); // version awaiting the delete confirm
  const [deleting, setDeleting] = useState(false);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return versions.filter((v) => !s || `v${v.versionNumber}.${v.subVersionNumber}`.includes(s) || (v.note || '').toLowerCase().includes(s));
  }, [versions, q]);

  // Live = its own status, or the template still pointing at it.
  const isLive = (v) => v.status === 'live' || v.id === template?.liveVersionId;
  const deleteTarget = versions.find((v) => v.id === deleteId) || null;

  async function toggle(v) {
    const goLive = v.status !== 'live';
    setBusyId(v.id);
    const res = await publish(v.id, goLive);
    setBusyId(null);
    addToast(res.ok ? (goLive ? `Published v${v.versionNumber}.${v.subVersionNumber}` : 'Unpublished') : (res.data?.error || 'Failed'), res.ok ? 'success' : 'error');
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    const name = label(deleteTarget);
    setDeleting(true);
    try {
      const res = await removeVersion(deleteTarget.id);
      addToast(res.ok ? `Version ${name} deleted` : failureMessage(res, `Could not delete ${name}`), res.ok ? 'success' : 'error');
    } catch (err) {
      addToast(failureMessage(err, `Could not delete ${name}`), 'error');
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  }

  // What the confirm says: what goes, and — when it's the version open in
  // the editor — where the editor lands and what is lost with it.
  function deleteDescription(v) {
    const parts = [`This permanently removes ${label(v)} (${v.status}, created ${fmtDate(v.createdAt)}). It can’t be undone.`];
    if (v.id === activeVersionId) {
      const next = versionToOpen(versions.filter((x) => x.id !== v.id), template);
      parts.push(`This is the version open in the editor — it will switch to ${next ? `${label(next)} (${next.status})` : 'an empty template'}${dirty ? ', and your unsaved changes will be lost' : ''}.`);
    }
    return parts.join(' ');
  }

  return (
    <div id="section-version" className="scroll-mt-24">
      <SectionHead
        title="Version Page"
        desc={template ? `Template id ${template.id} · ${template.templateNumber}` : 'Save the template first to create versions.'}
        right={(
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-44 rounded-lg border border-divider bg-background py-1.5 pl-8 pr-2 text-[12px] focus:border-accent focus:outline-none" />
          </div>
        )}
      />
      <div className="overflow-hidden rounded-xl border border-divider bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-divider bg-th text-left text-muted">
              <th className="px-3 py-2.5 font-medium">Live</th>
              <th className="px-3 py-2.5 font-medium">Version Number</th>
              <th className="px-3 py-2.5 font-medium">Sub Version Number</th>
              <th className="px-3 py-2.5 font-medium">Create date</th>
              <th className="px-3 py-2.5 font-medium">Live date</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 text-right font-medium">Delete</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">No versions yet.</td></tr>
            )}
            {rows.map((v) => (
              <tr key={v.id} className={`border-t border-divider ${v.id === activeVersionId ? 'bg-accent/5' : ''}`}>
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={v.status === 'live'}
                    disabled={busyId === v.id}
                    onClick={() => toggle(v)}
                    className={`relative h-5 w-9 rounded-full transition-colors disabled:opacity-50 ${v.status === 'live' ? 'bg-action' : 'bg-divider-light'}`}
                  >
                    {busyId === v.id
                      ? <Loader2 size={11} className="absolute left-1 top-1 animate-spin text-white" />
                      : <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${v.status === 'live' ? 'translate-x-4' : ''}`} />}
                  </button>
                </td>
                <td className="px-3 py-2.5 text-foreground">{v.versionNumber}</td>
                <td className="px-3 py-2.5 text-foreground">{v.subVersionNumber}</td>
                <td className="px-3 py-2.5 text-muted">{fmtDate(v.createdAt)}</td>
                <td className="px-3 py-2.5 text-muted">{fmtDate(v.publishedAt)}</td>
                <td className="px-3 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    v.status === 'live' ? 'bg-action-soft text-action' : v.status === 'archived' ? 'bg-card text-subtle' : 'bg-accent/10 text-accent'
                  }`}>{v.status}</span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => setDeleteId(v.id)}
                    disabled={isLive(v) || busyId === v.id}
                    aria-label={`Delete ${label(v)}`}
                    title={isLive(v) ? 'Live on the dashboard — publish another version, or switch this one off, before deleting it' : `Delete ${label(v)}`}
                    className="inline-flex items-center justify-center rounded p-1.5 text-subtle hover:bg-neg/10 hover:text-neg disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-subtle"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete version ${deleteTarget ? label(deleteTarget) : ''}?`}
        description={deleteTarget ? deleteDescription(deleteTarget) : ''}
        confirmLabel="Delete version"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => { if (!deleting) setDeleteId(null); }}
      />
    </div>
  );
}
