'use client';

import { useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { useToast } from '@/components/admin/Toast';
import SectionHead from './SectionHead';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');

// image 2 · Version Page — every saved version with an on/off toggle that
// publishes / unpublishes it. Create date = created_at, Live date = published_at.
export default function VersionSection({ draft }) {
  const { addToast } = useToast();
  const { versions = [], template, publish, activeVersionId } = draft;
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState(null);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return versions.filter((v) => !s || `v${v.versionNumber}.${v.subVersionNumber}`.includes(s) || (v.note || '').toLowerCase().includes(s));
  }, [versions, q]);

  async function toggle(v) {
    const goLive = v.status !== 'live';
    setBusyId(v.id);
    const res = await publish(v.id, goLive);
    setBusyId(null);
    addToast(res.ok ? (goLive ? `Published v${v.versionNumber}.${v.subVersionNumber}` : 'Unpublished') : (res.data?.error || 'Failed'), res.ok ? 'success' : 'error');
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
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">No versions yet.</td></tr>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
