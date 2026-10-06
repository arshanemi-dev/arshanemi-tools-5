'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

// Shown in place of any page that throws while rendering — Next's error
// boundary for the whole app. Without it, one value the dashboard couldn't
// handle (a malformed saved row, say) left a bare "Application error" screen
// with no way back short of reloading.
export default function ErrorPage({ error, reset, unstable_retry }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const retry = unstable_retry || reset;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="mx-auto max-w-md rounded-2xl border border-dashed border-divider-light bg-background p-8 text-center sm:p-12">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-action-soft text-action">
          <AlertTriangle size={26} />
        </div>
        <h2 className="mt-4 text-lg font-bold text-foreground">Something went wrong</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          This page hit an error and couldn’t finish loading. Your uploaded files and saved data are not affected.
        </p>
        <button
          type="button"
          onClick={() => retry?.()}
          className="mx-auto mt-5 inline-flex items-center gap-1.5 rounded-full bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action-hover"
        >
          <RefreshCw size={15} /> Try again
        </button>
      </div>
    </div>
  );
}
