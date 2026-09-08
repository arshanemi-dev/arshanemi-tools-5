'use client';

import { useEffect, useState } from 'react';
import { Clock, Loader2, Trash2, X } from 'lucide-react';
import { isLoggedIn } from '@/lib/tokenStore';
import { redirectToLogin } from '@/lib/authGate';
import { listHistory, getRun, deleteRun } from '@/lib/profitLoss/apiClient';
import PlatformBadge from './PlatformBadge';

// Slide-over list of saved runs. "Open" hands a full run back to the parent to
// render read-only; "Delete" removes it (and its stored files).
export default function HistoryDrawer({ open, onClose, onOpenRun }) {
  const [rows, setRows] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const loggedIn = isLoggedIn();

  useEffect(() => {
    if (!open || !loggedIn) return;
    setRows(null);
    listHistory({ limit: 30 }).then(({ ok, data }) => setRows(ok ? data.history || [] : []));
  }, [open, loggedIn]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9997] flex justify-end bg-black/40" onMouseDown={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col bg-background shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-divider px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
            <Clock size={17} className="text-action" /> Saved runs
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-card-hover">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {!loggedIn && (
            <div className="rounded-xl border border-divider-light bg-card p-4 text-center text-sm text-muted">
              <p>Sign in to keep a history of your Profit &amp; Loss runs.</p>
              <button
                onClick={redirectToLogin}
                className="mt-3 rounded-full bg-action px-4 py-1.5 text-sm font-semibold text-white hover:bg-action-hover"
              >
                Sign in
              </button>
            </div>
          )}

          {loggedIn && rows === null && (
            <div className="flex justify-center py-10 text-muted">
              <Loader2 className="animate-spin" />
            </div>
          )}

          {loggedIn && rows?.length === 0 && (
            <p className="py-10 text-center text-sm text-muted">No saved runs yet.</p>
          )}

          {loggedIn &&
            rows?.map((run) => (
              <div
                key={run.id}
                className="mb-2 rounded-xl border border-divider p-3 transition-colors hover:border-divider-light"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {run.label || new Date(run.createdAt).toLocaleDateString()}
                    </p>
                    <p className="mt-0.5 text-xs text-subtle">
                      {run.dateFrom || '—'} → {run.dateTo || '—'} · {run.rowCount ?? 0} rows ·{' '}
                      {run.coinsCharged ?? 0} coin{(run.coinsCharged ?? 0) === 1 ? '' : 's'}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {(run.platforms || []).map((p) => (
                        <PlatformBadge key={p} id={p} size="xs" />
                      ))}
                    </div>
                  </div>
                  <div
                    className={`shrink-0 text-sm font-bold ${
                      Number(run.netProfitLoss) < 0 ? 'text-neg' : 'text-pos'
                    }`}
                  >
                    ₹{Math.round(Number(run.netProfitLoss) || 0)}
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    disabled={busyId === run.id}
                    onClick={async () => {
                      setBusyId(run.id);
                      const { ok, data } = await getRun(run.id);
                      setBusyId(null);
                      if (ok) {
                        onOpenRun(data);
                        onClose();
                      }
                    }}
                    className="rounded-lg bg-action px-3 py-1 text-xs font-semibold text-white hover:bg-action-hover disabled:opacity-50"
                  >
                    Open
                  </button>
                  <button
                    disabled={busyId === run.id}
                    onClick={async () => {
                      setBusyId(run.id);
                      const { ok } = await deleteRun(run.id);
                      setBusyId(null);
                      if (ok) setRows((prev) => prev.filter((r) => r.id !== run.id));
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-divider-light px-2.5 py-1 text-xs text-muted hover:bg-card-hover disabled:opacity-50"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
            ))}
        </div>
      </aside>
    </div>
  );
}
