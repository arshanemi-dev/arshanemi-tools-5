'use client';

import DetailsTable from './DetailsTable';

// The "Header Wise Overview" tab (config.overviewTab) — one wide table over
// the selected headers, computed on the same filtered dataset as the rest of
// the dashboard.
export default function OverviewTab({ config, resolved }) {
  const ov = config?.overviewTab || {};
  const headerById = new Map((resolved.headers || []).map((h) => [h.id, h]));
  const columns = (ov.headerIds || []).map((id) => headerById.get(id)).filter(Boolean);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-foreground">{ov.name || 'Overview'}</h2>
        <p className="mt-0.5 text-sm text-muted">Header-wise summary across every loaded sheet, for the current filters.</p>
      </div>
      {columns.length > 0 ? (
        <DetailsTable columns={columns} rows={resolved.tableRows} />
      ) : (
        <div className="rounded-xl border border-divider bg-background px-4 py-10 text-center text-sm text-muted">
          No headers selected for the Overview yet — add some in Template Settings.
        </div>
      )}
    </div>
  );
}
