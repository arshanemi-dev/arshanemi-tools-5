'use client';

import KpiCardRow from './KpiCardRow';
import GraphStrip from './GraphStrip';
import DetailsViewPills from './DetailsViewPills';
import DetailsTable from './DetailsTable';

// Renders one config.tab: its Title Cards (KPI band) → its Graphs → the
// My/All column pills → its Headers as the details table. Everything is
// pre-computed in `resolved` (lib/profitLoss/resolveTemplate).
export default function TabView({ config, tab, resolved, viewMode, onViewModeChange, myColumns, onMyColumnsChange }) {
  if (!tab) return null;

  const cardById = new Map((config.titleCards || []).map((c) => [c.id, c]));
  const headerById = new Map((resolved.headers || []).map((h) => [h.id, h]));
  const spanById = new Map((tab.layout?.graphs || []).map((g) => [g.id, g.span || 1]));

  const cards = (tab.titleCardIds || []).map((id) => cardById.get(id)).filter(Boolean);
  const graphs = (tab.graphIds || []).map((id) => ({ id, span: spanById.get(id) || 1 }));
  const tabHeaderDefs = (tab.headerIds || []).map((id) => headerById.get(id)).filter(Boolean);

  const columns =
    viewMode === 'my' && tabHeaderDefs.length
      ? [tabHeaderDefs[0], ...tabHeaderDefs.slice(1).filter((h) => myColumns.includes(h.id))]
      : tabHeaderDefs;

  return (
    <div className="space-y-5">
      {cards.length > 0 && <KpiCardRow cards={cards} values={resolved.titleCardValues} />}

      {graphs.length > 0 && <GraphStrip graphs={graphs} series={resolved.graphSeries} />}

      {tabHeaderDefs.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <DetailsViewPills
              mode={viewMode}
              onModeChange={onViewModeChange}
              tabHeaders={tabHeaderDefs}
              myColumns={myColumns}
              onMyColumnsChange={onMyColumnsChange}
            />
          </div>
          <DetailsTable columns={columns} rows={resolved.tableRows} />
        </>
      )}
    </div>
  );
}
