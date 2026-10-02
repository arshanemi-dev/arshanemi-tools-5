'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';

// Shown on /profit-loss instead of NoMarketplaces when loading the
// marketplaces failed (hub unreachable / restarting, server error) — so a
// failed load never reads as "nothing has been set up". `message` is the
// reason (failureMessage); Try again re-runs the load in place.
export default function TemplatesLoadError({ message, onRetry }) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="mx-auto max-w-md rounded-2xl border border-neg/30 bg-background p-8 text-center sm:p-12">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-neg/10 text-neg">
          <AlertTriangle size={26} />
        </div>
        <h2 className="mt-4 text-lg font-bold text-foreground">Couldn&rsquo;t load the dashboard</h2>
        <p className="mx-auto mt-1 max-w-sm break-words text-sm text-muted">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mx-auto mt-5 inline-flex items-center gap-1.5 rounded-full bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action-hover"
        >
          <RotateCcw size={15} /> Try again
        </button>
      </div>
    </div>
  );
}
