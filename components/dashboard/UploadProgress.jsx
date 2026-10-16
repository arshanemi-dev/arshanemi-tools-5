'use client';

import { AlertTriangle, Check, Loader2 } from 'lucide-react';

const count = (n) => Number(n || 0).toLocaleString('en-IN');

// One line of the window: done (tick), in hand (spinner — a CSS rotation, so
// it keeps turning even while the page is busy reading or recalculating),
// failed, or not reached yet.
function Step({ state, title, detail, children }) {
  const icon = state === 'done' ? <Check size={14} />
    : state === 'active' ? <Loader2 size={14} className="animate-spin" />
    : state === 'failed' ? <AlertTriangle size={14} />
    : null;
  const tone = state === 'done' ? 'bg-action text-white'
    : state === 'active' ? 'bg-action-soft text-action'
    : state === 'failed' ? 'bg-neg/10 text-neg'
    : 'bg-card text-subtle';
  return (
    <li className="flex gap-3">
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${tone}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${state === 'todo' ? 'text-subtle' : 'font-medium text-foreground'}`}>{title}</p>
        {detail && <p className={`truncate text-[12.5px] ${state === 'failed' ? 'text-neg' : 'text-muted'}`} title={detail}>{detail}</p>}
        {children}
      </div>
    </li>
  );
}

// What an upload is doing, step by step, while it does it — reading the
// file(s), (when uploads cost coins) charging for it, adding the rows to the
// dashboard, then (signed in) saving them to the account in parts. `stage` =
// DashboardWorkspace's upload stage ({ step: 'reading' | 'charging' |
// 'adding' | 'saving' | 'done', fileIndex, fileCount, fileName, rows,
// charged }); `billed` = this upload is charged (lib/profitLoss/
// useUploadBilling.js) and `stage.charged` says what it cost; `saving` =
// useRowSaver's status ({ phase, saved, total, error }) once the save has
// started. The rows are already on the dashboard
// by the time the save runs, so `onHide` lets it carry on in the background
// (SavingRowsLine then shows where it is); `onRetry` tries a failed save
// again.
export default function UploadProgress({ stage, saving, signedIn, billed = false, onHide, onRetry }) {
  if (!stage || stage.hidden) return null;
  const { step, fileIndex = 0, fileCount = 1, fileName = '', rows = 0 } = stage;
  const reading = step === 'reading';
  const charging = step === 'charging';
  const adding = step === 'adding';
  const failed = step === 'saving' && saving?.phase === 'failed';
  const saved = step === 'done' || (step === 'saving' && saving?.phase === 'saved');
  const inParts = step === 'saving' && saving && saving.total > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Upload progress">
      <div className="mx-4 w-full max-w-md rounded-2xl bg-background p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-foreground">{saved ? 'Upload complete' : failed ? 'Rows not saved yet' : 'Uploading your sheet'}</h3>
        <p className="mt-1 text-[13px] text-muted">
          {failed ? 'The rows are on your dashboard, but saving them to your account stopped.'
            : saved ? (signedIn ? 'Your rows are on the dashboard and saved to your account.' : 'Your rows are on the dashboard.')
            : 'Large sheets take a moment — please keep this tab open.'}
        </p>

        <ol className="mt-5 space-y-4">
          <Step
            state={reading ? 'active' : 'done'}
            title={fileCount > 1 ? `Reading the files (${Math.min(fileIndex + 1, fileCount)} of ${fileCount})` : 'Reading the file'}
            detail={reading ? fileName : null}
          />
          {billed && (
            <Step
              state={reading ? 'todo' : charging ? 'active' : 'done'}
              title="Checking your coins"
              detail={charging ? 'Working out what this upload costs…' : stage.charged || null}
            />
          )}
          <Step
            state={reading || charging ? 'todo' : adding ? 'active' : 'done'}
            title="Adding the rows to your dashboard"
            detail={reading || charging ? null : `${count(rows)} row${rows === 1 ? '' : 's'}${adding ? ' — working out the totals…' : ''}`}
          />
          {signedIn && (
            <Step
              state={reading || charging || adding ? 'todo' : failed ? 'failed' : saved ? 'done' : 'active'}
              title="Saving to your account"
              detail={failed ? saving.error
                : saved ? (saving?.total ? `${count(saving.total)} row${saving.total === 1 ? '' : 's'} saved` : 'Already up to date')
                : inParts ? `${count(saving.saved)} of ${count(saving.total)} rows`
                : step === 'saving' ? 'Getting the rows ready…' : null}
            >
              {inParts && !saved && (
                <progress
                  value={saving.saved}
                  max={saving.total}
                  aria-label="Rows saved"
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-action [&::-webkit-progress-bar]:bg-card [&::-webkit-progress-value]:bg-action [&::-webkit-progress-value]:transition-all"
                />
              )}
            </Step>
          )}
        </ol>

        {step === 'saving' && !saved && (
          <div className="mt-6 flex justify-end gap-3">
            {failed && (
              <button type="button" onClick={onRetry} className="rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action-hover">
                Try again
              </button>
            )}
            <button type="button" onClick={onHide} className="rounded-lg border border-divider-light bg-background px-4 py-2 text-sm font-medium text-muted hover:bg-card-hover">
              {failed ? 'Close' : 'Hide — keeps saving'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// The same save, as one line above the tables — for when the window was
// hidden, and for a save no upload window belongs to (a deleted or re-priced
// row being written back).
export function SavingRowsLine({ saving, onRetry }) {
  if (!saving || saving.phase === 'saved' || !saving.total) return null;
  const failed = saving.phase === 'failed';
  return (
    <div className={`mt-4 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-[13px] ${failed ? 'bg-neg/10 text-neg' : 'bg-action-soft text-action'}`}>
      {failed ? <AlertTriangle size={14} className="shrink-0" /> : <Loader2 size={14} className="shrink-0 animate-spin" />}
      <span className="min-w-0 flex-1">
        {failed
          ? `Saving stopped at ${count(saving.saved)} of ${count(saving.total)} rows — ${saving.error}`
          : `Saving your rows — ${count(saving.saved)} of ${count(saving.total)}…`}
      </span>
      {failed && (
        <button type="button" onClick={onRetry} className="shrink-0 rounded-full bg-neg px-3 py-1 text-[12px] font-semibold text-white hover:opacity-90">
          Try again
        </button>
      )}
    </div>
  );
}
