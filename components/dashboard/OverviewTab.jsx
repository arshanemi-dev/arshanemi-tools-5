'use client';

import KpiCardRow from './KpiCardRow';
import GraphStrip from './GraphStrip';
import DetailsTable from './DetailsTable';

// One "Header Wise Overview" tab (one entry of config.overviewTabs) — same
// shape as a Tab: its own Title Cards (KPI band, reading the same global
// resolved.titleCardValues every Tab reads) → its own Graphs → then the
// pivot table itself (resolveTemplate().overviews[tab.id]): one row per
// unique value of the fixed header, every other selected header aggregated
// within that group.
export default function OverviewTab({ config, tab, resolved }) {
  if (!tab) return null;
  const ov = resolved.overviews?.[tab.id] || { name: tab.name, fixedHeader: null, headers: [], rows: [] };
  const columns = ov.fixedHeader ? [ov.fixedHeader, ...ov.headers] : [];

  const cardById = new Map((config.titleCards || []).map((c) => [c.id, c]));
  const cards = (tab.titleCardIds || []).map((id) => cardById.get(id)).filter(Boolean);
  const graphs = (tab.graphIds || []).map((id) => ({ id, span: 1 }));

  return (
    <div className="space-y-5">
      {cards.length > 0 && <KpiCardRow cards={cards} values={resolved.titleCardValues} />}

      {graphs.length > 0 && <GraphStrip graphs={graphs} series={resolved.graphSeries} />}

      <div>
        <h2 className="text-lg font-bold text-foreground">{ov.name || tab.name || 'Overview'}</h2>
        <p className="mt-0.5 text-sm text-muted">
          One row per {ov.fixedHeader?.name || 'fixed header'}, other columns summed within it — for the current filters.
        </p>
      </div>
      {!ov.fixedHeader ? (
        <div className="rounded-xl border border-divider bg-background px-4 py-10 text-center text-sm text-muted">
          Pick a fixed header for this Overview tab in Template Settings.
        </div>
      ) : columns.length > 1 ? (
        <DetailsTable columns={columns} rows={ov.rows} />
      ) : (
        <div className="rounded-xl border border-divider bg-background px-4 py-10 text-center text-sm text-muted">
          No headers selected for this Overview tab yet — add some in Template Settings.
        </div>
      )}
    </div>
  );
}
