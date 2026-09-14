'use client';

import { Store } from 'lucide-react';

// Shown on /profit-loss instead of the template-driven dashboard when
// GET /api/marketplace-templates/live returns zero published templates — no
// fake dashboard sidebar/tabs/cards render with nothing configured.
export default function NoMarketplaces() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="mx-auto max-w-md rounded-2xl border border-dashed border-divider-light bg-background p-8 text-center sm:p-12">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-action-soft text-action">
          <Store size={26} />
        </div>
        <h2 className="mt-4 text-lg font-bold text-foreground">No marketplaces yet</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          No marketplace has been published for this dashboard yet. Check back once one has
          been set up.
        </p>
      </div>
    </div>
  );
}
