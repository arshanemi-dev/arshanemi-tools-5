'use client';

import { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { isLoggedIn } from '@/lib/tokenStore';
import { redirectToLogin } from '@/lib/authGate';
import { saveRun } from '@/lib/profitLoss/apiClient';
import BillingGateModal from '@/components/billing/BillingGateModal';
import { useToast } from '@/components/admin/Toast';

// "Save to History". Anonymous → send to login. Signed-in → confirm the coin
// cost (1 per 100 parsed rows), POST, handle a 402 billing block.
// `compact` renders it as an icon pill to sit in the header button row.
export default function SaveRunButton({ buildPayload, rowCount, disabled, compact = false }) {
  const { addToast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gate, setGate] = useState(null);

  const coins = Math.max(1, Math.ceil((rowCount || 0) / 100));

  const start = () => {
    if (!isLoggedIn()) {
      redirectToLogin();
      return;
    }
    setConfirming(true);
  };

  const doSave = async () => {
    setSaving(true);
    try {
      const payload = buildPayload();
      const { ok, status, data } = await saveRun(payload);
      if (ok) {
        addToast(`Saved to history — ${data.coinsCharged ?? coins} coin${(data.coinsCharged ?? coins) === 1 ? '' : 's'} used`);
        setConfirming(false);
      } else if (status === 402) {
        setConfirming(false);
        setGate({ reason: data.reason ?? 'error', data: data.data ?? data });
      } else {
        addToast(data.error || 'Could not save this run', 'error');
      }
    } catch {
      addToast('Network error while saving', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={disabled}
        title={`Save this run to your history (${coins} coin${coins === 1 ? '' : 's'})`}
        aria-label="Save to history"
        className={
          compact
            ? 'inline-flex h-9 items-center gap-1.5 rounded-full border border-divider-light bg-background px-3 text-sm font-medium text-foreground transition-colors hover:border-divider disabled:opacity-45'
            : 'inline-flex items-center gap-2 rounded-full border border-divider-light bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-divider disabled:opacity-50'
        }
      >
        <Save size={15} className="text-action" />
        <span className={compact ? 'hidden sm:inline' : ''}>{compact ? 'Save' : 'Save to History'}</span>
      </button>

      {confirming && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-divider bg-background p-5 shadow-xl">
            <h3 className="text-base font-bold text-foreground">Save this run to your history?</h3>
            <p className="mt-2 text-sm text-muted">
              {rowCount.toLocaleString()} parsed rows will be stored with your uploaded files.
              This costs <strong className="text-foreground">{coins} coin{coins === 1 ? '' : 's'}</strong>{' '}
              (1 per 100 rows), deducted from your wallet.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-card-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={doSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-action px-4 py-1.5 text-sm font-semibold text-white hover:bg-action-hover disabled:opacity-60"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? 'Saving…' : `Save · ${coins} coin${coins === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {gate && (
        <BillingGateModal gate={gate} onClose={() => setGate(null)} onRetry={() => { setGate(null); start(); }} />
      )}
    </>
  );
}
