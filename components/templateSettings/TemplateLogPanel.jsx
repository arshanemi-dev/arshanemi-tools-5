'use client';

import { useEffect, useState } from 'react';
import { History, Loader2, X } from 'lucide-react';
import { listLogs } from '@/lib/profitLoss/templatesApi';

const fmt = (d) => new Date(d).toLocaleString();

// Reverse-chron change log for a template (create / update / delete + every
// version change + sidebar toggle). Slide-over.
export default function TemplateLogPanel({ templateId, open, onClose }) {
  const [logs, setLogs] = useState(null);

  useEffect(() => {
    if (!open || !templateId) return undefined;
    let alive = true;
    listLogs(templateId, { limit: 100 }).then(({ ok, data }) => {
      if (alive) setLogs(ok ? data.logs || [] : []);
    });
    return () => { alive = false; };
  }, [open, templateId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9997] flex justify-end bg-black/40" onMouseDown={onClose}>
      <aside className="flex h-full w-full max-w-sm flex-col bg-background shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-divider px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
            <History size={17} className="text-accent" /> Change log
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-card-hover"><X size={18} /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          {logs === null && <div className="flex justify-center py-10 text-muted"><Loader2 className="animate-spin" /></div>}
          {logs?.length === 0 && <p className="py-10 text-center text-sm text-muted">No history yet.</p>}
          {logs?.map((l) => (
            <div key={l.id} className="mb-2 rounded-xl border border-divider p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-card px-2 py-0.5 text-[11px] font-medium text-muted">{l.action}</span>
                <span className="text-[11px] text-subtle">{fmt(l.createdAt)}</span>
              </div>
              <p className="mt-1.5 text-sm text-foreground">{l.detail?.summary || '—'}</p>
              {l.actorName && <p className="mt-0.5 text-[11px] text-subtle">by {l.actorName}</p>}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
