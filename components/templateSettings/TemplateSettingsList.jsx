'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Copy, History, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { useToast } from '@/components/admin/Toast';
import { listTemplates, patchTemplate, deleteTemplate } from '@/lib/profitLoss/templatesApi';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import TemplateLogPanel from './TemplateLogPanel';

const fmt = (d) => (d ? new Date(d).toLocaleDateString() : '—');

export default function TemplateSettingsList() {
  const { addToast } = useToast();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [logsFor, setLogsFor] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let alive = true;
    listTemplates({ scopeAll: true }).then(({ ok, data }) => {
      if (alive) setRows(ok ? data.templates || [] : []);
    });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!rows) return [];
    return s ? rows.filter((t) => t.marketplaceName.toLowerCase().includes(s) || t.templateNumber.toLowerCase().includes(s)) : rows;
  }, [rows, q]);

  async function toggleSidebar(t) {
    setBusyId(t.id);
    const res = await patchTemplate(t.id, { showInSidebar: !t.showInSidebar });
    setBusyId(null);
    if (res.ok) setRows((prev) => prev.map((x) => (x.id === t.id ? { ...x, showInSidebar: !x.showInSidebar } : x)));
    else addToast(res.data?.error || 'Failed', 'error');
  }

  async function doDelete() {
    const id = confirmId;
    setConfirmId(null);
    setBusyId(id);
    const res = await deleteTemplate(id);
    setBusyId(null);
    if (res.ok) { setRows((prev) => prev.filter((x) => x.id !== id)); addToast('Template deleted'); }
    else addToast(res.data?.error || 'Delete failed', 'error');
  }

  return (
    <div className="space-y-5 px-4 py-6 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Marketplace Templates</h1>
          <p className="mt-0.5 text-[13px] text-subtle">Versioned dashboard templates — one per marketplace.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-48 rounded-lg border border-divider bg-background py-1.5 pl-8 pr-2 text-[12.5px] focus:border-accent focus:outline-none" />
          </div>
          <Link href="/profit-loss/template-settings/new" className="inline-flex items-center gap-1.5 rounded-full bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action-hover">
            <Plus size={14} /> New Template
          </Link>
        </div>
      </div>

      {rows === null ? (
        <div className="flex justify-center py-16 text-muted"><Loader2 className="animate-spin" size={24} /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-divider-light bg-background px-4 py-12 text-center text-sm text-muted">
          No templates yet. Create one to drive a marketplace dashboard.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-divider bg-background">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-divider bg-th text-left text-muted">
                <th className="px-3 py-2.5 font-medium">Marketplace</th>
                <th className="px-3 py-2.5 font-medium">Live version</th>
                <th className="px-3 py-2.5 font-medium">Last update</th>
                <th className="px-3 py-2.5 font-medium">Live date</th>
                <th className="px-3 py-2.5 font-medium">In sidebar</th>
                <th className="px-3 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-t border-divider hover:bg-card-hover">
                  <td className="px-3 py-2.5">
                    <Link href={`/profit-loss/template-settings/${t.id}`} className="font-medium text-link underline decoration-link/30">{t.marketplaceName}</Link>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-subtle">
                      {t.templateNumber} · {t.id}
                      <button type="button" onClick={() => navigator.clipboard?.writeText(t.id)} className="text-subtle hover:text-foreground"><Copy size={11} /></button>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {t.isLive
                      ? <span className="rounded-full bg-action-soft px-2 py-0.5 text-[11px] font-medium text-action">live</span>
                      : <span className="rounded-full bg-card px-2 py-0.5 text-[11px] text-subtle">draft only</span>}
                  </td>
                  <td className="px-3 py-2.5 text-muted">{fmt(t.updatedAt)}</td>
                  <td className="px-3 py-2.5 text-muted">{fmt(t.lastPublishedAt)}</td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!t.showInSidebar}
                      disabled={busyId === t.id}
                      onClick={() => toggleSidebar(t)}
                      className={`relative h-5 w-9 rounded-full transition-colors disabled:opacity-50 ${t.showInSidebar ? 'bg-action' : 'bg-divider-light'}`}
                    >
                      <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${t.showInSidebar ? 'translate-x-4' : ''}`} />
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" onClick={() => setLogsFor(t.id)} className="rounded-lg p-1.5 text-muted hover:bg-card" title="Change log"><History size={14} /></button>
                      <button type="button" onClick={() => setConfirmId(t.id)} className="rounded-lg p-1.5 text-muted hover:bg-neg/10 hover:text-neg" title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TemplateLogPanel templateId={logsFor} open={!!logsFor} onClose={() => setLogsFor(null)} />
      <ConfirmDialog
        open={!!confirmId}
        title="Delete this template?"
        description="Its versions and change log are removed too. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={doDelete}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  );
}
