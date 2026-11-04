'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, ReceiptText, RotateCw, Search, Trash2 } from 'lucide-react';
import { useToast } from '@/components/admin/Toast';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import IconButton from '@/components/dashboard/IconButton';
import TablePager from '@/components/dashboard/TablePager';
import { listExtractedRows, deleteExtractedRows } from '@/lib/profitLoss/apiClient';
import { loadAllPages } from '@/lib/profitLoss/loadAllPages';

const PAGE_SIZE = 500; // per request — the same as the dashboard's load-on-refresh
const CONCURRENCY = 4;
const ROWS_PER_PAGE = 50; // on screen
const ALL = '__all__';
// Selecting at least this many asks the user to type DELETE before it goes.
const TYPE_TO_CONFIRM_AT = 100;

// Position Settings › Orders — every row this user has saved (the same
// profit_loss_extracted_rows the dashboard loads on refresh), one line per
// { orderId, transactionId } — the key the saved rows are deleted by. Shows
// only Order Id, Transaction Id, SKU and Account Name; tick rows (or every
// row matching the search / account filter) and delete them, after a
// confirmation. This is the only place saved rows are deleted — the
// dashboard has no Delete button. The dashboard picks the change up on its
// next load.
const keyOf = (orderId, transactionId) => `${orderId}::${transactionId ?? ''}`;

// The hub's rows → one entry per key: a key saved with several SKUs /
// accounts lists them all.
function toOrders(saved) {
  const byKey = new Map();
  for (const r of saved) {
    if (!r?.orderId) continue;
    const key = keyOf(r.orderId, r.transactionId);
    let o = byKey.get(key);
    if (!o) {
      o = { key, orderId: r.orderId, transactionId: r.transactionId ?? null, skus: new Set(), accounts: new Set() };
      byKey.set(key, o);
    }
    const sku = String(r.data?.sku ?? '').trim();
    if (sku && sku !== '—') o.skus.add(sku);
    const account = String(r.data?.company ?? '').trim();
    if (account) o.accounts.add(account);
  }
  return [...byKey.values()].map((o) => ({ ...o, sku: [...o.skus].join(', '), account: [...o.accounts].join(', ') }));
}

const TH = 'sticky top-0 z-10 bg-[#1565C0] px-3 py-2 text-left text-[12px] font-medium text-white whitespace-nowrap';
const TD = 'px-3 py-2 text-[13px] text-foreground whitespace-nowrap';

export default function OrdersSection() {
  const { addToast } = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState('');
  const [account, setAccount] = useState(ALL);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const saved = [];
    (async () => {
      setLoading(true);
      setLoadError('');
      const result = await loadAllPages({
        fetchPage: async (p) => {
          const { ok, data } = await listExtractedRows({ page: p, limit: PAGE_SIZE, signal: controller.signal, includeCount: p === 1 });
          return ok ? data : null;
        },
        onRows: (rows) => { saved.push(...rows); },
        cancelled: () => cancelled,
        concurrency: CONCURRENCY,
      }).catch(() => ({ complete: false }));
      if (cancelled) return;
      setOrders(toOrders(saved));
      setSelected(new Set());
      if (!result.complete) setLoadError(saved.length ? 'Some saved orders could not be loaded — the list may be incomplete.' : 'Your saved orders could not be loaded.');
      setLoading(false);
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [attempt]);

  const accounts = useMemo(
    () => [...new Set(orders.flatMap((o) => [...o.accounts]))].sort((a, b) => a.localeCompare(b)),
    [orders],
  );

  const view = useMemo(() => {
    const s = q.trim().toLowerCase();
    return orders.filter((o) => (account === ALL || o.accounts.has(account))
      && (!s || [o.orderId, o.transactionId, o.sku, o.account].some((v) => String(v ?? '').toLowerCase().includes(s))));
  }, [orders, q, account]);

  const pageCount = Math.max(1, Math.ceil(view.length / ROWS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * ROWS_PER_PAGE;
  const pageRows = view.slice(pageStart, pageStart + ROWS_PER_PAGE);

  const allOnPage = pageRows.length > 0 && pageRows.every((o) => selected.has(o.key));
  const allInView = view.length > 0 && view.every((o) => selected.has(o.key));
  const toggle = useCallback((key) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  }), []);
  const setMany = (keys, on) => setSelected((prev) => {
    const next = new Set(prev);
    for (const k of keys) { if (on) next.add(k); else next.delete(k); }
    return next;
  });

  const changeFilter = (fn) => (v) => { fn(v); setPage(1); };

  const onDelete = async () => {
    const picked = orders.filter((o) => selected.has(o.key));
    if (!picked.length) return;
    setDeleting(true);
    const { ok, data } = await deleteExtractedRows(picked.map((o) => ({ orderId: o.orderId, transactionId: o.transactionId })));
    setDeleting(false);
    if (!ok) {
      addToast(data?.error || 'The selected orders could not be deleted — try again.', 'error');
      return;
    }
    setOrders((prev) => prev.filter((o) => !selected.has(o.key)));
    setSelected(new Set());
    setConfirmOpen(false);
    addToast(`Deleted ${picked.length} order${picked.length === 1 ? '' : 's'}`);
  };

  const count = selected.size;

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-divider bg-background p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="rounded-lg bg-accent/10 p-1.5 text-accent"><ReceiptText size={15} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">Orders</h2>
          <p className="text-[12px] text-muted">Your saved orders. Select the ones to remove and delete them — they go from your dashboard too.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <IconButton icon={RotateCw} label="Reload" title="Load your saved orders again" tone="outline" onClick={() => setAttempt((n) => n + 1)} disabled={loading || deleting} />
          <IconButton
            icon={Trash2}
            label="Delete"
            title={count ? `Delete ${count} selected order${count === 1 ? '' : 's'}` : 'Select orders in the table to delete them'}
            tone="outline"
            badge={count || null}
            disabled={!count || loading || deleting}
            onClick={() => setConfirmOpen(true)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
          <input
            value={q}
            onChange={(e) => changeFilter(setQ)(e.target.value)}
            placeholder="Search Order Id, Transaction Id, SKU or Account…"
            className="w-full rounded-lg border border-divider-light bg-background py-1.5 pl-8 pr-2 text-[13px] focus:border-accent focus:outline-none"
          />
        </div>
        <select
          value={account}
          onChange={(e) => changeFilter(setAccount)(e.target.value)}
          aria-label="Account Name"
          className="rounded-lg border border-divider-light bg-background px-2 py-1.5 text-[13px] text-foreground focus:border-accent focus:outline-none"
        >
          <option value={ALL}>All Account Names</option>
          {accounts.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {loadError && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg bg-neg/10 px-3 py-2 text-[13px] font-medium text-neg">
          {loadError}
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="font-semibold underline">Retry</button>
        </p>
      )}

      {!loading && view.length > 0 && (count > 0 || allOnPage) && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-action-soft px-3 py-1.5 text-[12px] text-foreground">
          <span><span className="font-semibold">{count}</span> selected</span>
          {!allInView && (
            <button type="button" onClick={() => setMany(view.map((o) => o.key), true)} className="font-semibold text-link hover:underline">
              Select all {view.length} {q || account !== ALL ? 'matching' : ''} order{view.length === 1 ? '' : 's'}
            </button>
          )}
          {count > 0 && (
            <button type="button" onClick={() => setSelected(new Set())} className="font-semibold text-link hover:underline">Clear selection</button>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-divider">
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={`${TH} w-10`}>
                  <input
                    type="checkbox"
                    checked={allOnPage}
                    disabled={loading || !pageRows.length}
                    onChange={() => setMany(pageRows.map((o) => o.key), !allOnPage)}
                    className="accent-[var(--color-action)]"
                    aria-label="Select all orders on this page"
                  />
                </th>
                <th className={TH}>Order Id</th>
                <th className={TH}>Transaction Id</th>
                <th className={TH}>SKU</th>
                <th className={TH}>Account Name</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-10 text-center text-muted"><Loader2 size={22} className="inline animate-spin" /></td></tr>
              ) : view.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[13px] text-muted">
                    {orders.length ? 'No orders match the search.' : 'No saved orders yet — upload a sheet on the dashboard.'}
                  </td>
                </tr>
              ) : pageRows.map((o) => {
                const on = selected.has(o.key);
                return (
                  <tr
                    key={o.key}
                    onClick={() => toggle(o.key)}
                    className={`cursor-pointer border-t border-divider-light transition-colors ${on ? 'bg-action-soft' : 'hover:bg-card-hover'}`}
                  >
                    <td className={TD}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(o.key)}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-[var(--color-action)]"
                        aria-label={`Select order ${o.orderId}`}
                      />
                    </td>
                    <td className={`${TD} font-medium`}>{o.orderId}</td>
                    <td className={TD}>{o.transactionId || <span className="text-subtle">—</span>}</td>
                    <td className={`${TD} max-w-[18rem] truncate`} title={o.sku}>{o.sku || <span className="text-subtle">—</span>}</td>
                    <td className={TD}>{o.account || <span className="text-subtle">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <TablePager
          summary={(
            <>
              {view.length === 0 ? '0 orders' : `${pageStart + 1}–${Math.min(pageStart + ROWS_PER_PAGE, view.length)} of ${view.length} order${view.length === 1 ? '' : 's'}`}
              {view.length !== orders.length && ` (${orders.length} in all)`}
              {count > 0 && ` · ${count} selected`}
            </>
          )}
          pageSize={ROWS_PER_PAGE}
          onPageSizeChange={() => {}}
          currentPage={currentPage}
          pageCount={pageCount}
          onPageChange={setPage}
        />
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={`Delete ${count} order${count === 1 ? '' : 's'}?`}
        description="Every saved row of the selected orders is removed from your account and from your dashboard. This cannot be undone."
        confirmText={count >= TYPE_TO_CONFIRM_AT ? 'DELETE' : undefined}
        confirmLabel="Delete"
        loadingLabel="Deleting…"
        loading={deleting}
        onConfirm={onDelete}
        onCancel={() => { if (!deleting) setConfirmOpen(false); }}
      />
    </section>
  );
}
