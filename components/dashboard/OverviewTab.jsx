'use client';

import KpiCardRow from './KpiCardRow';
import GraphStrip from './GraphStrip';
import DetailsTable from './DetailsTable';
import HiddenItemsChip from './HiddenItemsChip';
import { emptySection } from '@/lib/profitLoss/layoutSections';
import { useArrangeableList } from '@/lib/profitLoss/useArrangeableList';

function SectionLabel({ text, hidden, onShow }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{text}</span>
      <HiddenItemsChip hidden={hidden} onShow={onShow} />
    </div>
  );
}

// One "Header Wise Overview" tab (one entry of config.overviewTabs) — same
// shape as a Tab: its own Title Cards (KPI band, reading the same global
// resolved.titleCardValues every Tab reads) → its own Graphs → then the
// pivot table itself (resolveTemplate().overviews[tab.id]): one row per
// unique value of the fixed header, every other selected header aggregated
// within that group.
//
// Edit mode works exactly like TabView's — layout.perTab[tab.id] — the
// fixed/key column stays pinned, same rule as a regular Tab's first column.
export default function OverviewTab({ config, tab, resolved, editMode = false, layout = {}, onSetTabSection = () => {}, costBySku, onCostChange, companyControl }) {
  // Every hook below must run unconditionally (same order every render), so
  // the `!tab` bail-out happens at the return instead of up here.
  const tabId = tab?.id ?? null;
  const ov = (tabId && resolved.overviews?.[tabId]) || { name: tab?.name, fixedHeader: null, headers: [], rows: [] };

  const tabLayout = (tabId && layout.perTab?.[tabId]) || {};
  const cardsSection = tabLayout.titleCards || emptySection();
  const graphsSection = tabLayout.graphs || emptySection();
  const headersSection = tabLayout.headers || emptySection();

  const cardById = new Map((config.titleCards || []).map((c) => [c.id, c]));
  const graphById = new Map((config.graphs || []).map((g) => [g.id, g]));
  const allCards = (tab?.titleCardIds || []).map((id) => cardById.get(id)).filter(Boolean);
  const allGraphs = (tab?.graphIds || []).map((id) => ({ id, name: graphById.get(id)?.name || id, span: 1 }));

  const cardsArrange = useArrangeableList(allCards, cardsSection, (next) => onSetTabSection(tabId, 'titleCards', next));
  const graphsArrange = useArrangeableList(allGraphs, graphsSection, (next) => onSetTabSection(tabId, 'graphs', next));
  const headersArrange = useArrangeableList(ov.headers || [], headersSection, (next) => onSetTabSection(tabId, 'headers', next));

  if (!tab) return null;

  const columns = ov.fixedHeader ? [ov.fixedHeader, ...headersArrange.visible] : [];

  return (
    <div className="space-y-5">
      {allCards.length > 0 && (
        <div className="space-y-2">
          {editMode && <SectionLabel text="Title Cards" hidden={cardsArrange.hidden} onShow={cardsArrange.show} />}
          {cardsArrange.visible.length > 0 && (
            <KpiCardRow cards={cardsArrange.visible} values={resolved.titleCardValues} editMode={editMode} arrange={cardsArrange} />
          )}
        </div>
      )}

      {allGraphs.length > 0 && (
        <div className="space-y-2">
          {editMode && <SectionLabel text="Graphs" hidden={graphsArrange.hidden} onShow={graphsArrange.show} />}
          {graphsArrange.visible.length > 0 && (
            <GraphStrip graphs={graphsArrange.visible} series={resolved.graphSeries} editMode={editMode} arrange={graphsArrange} />
          )}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-foreground">{ov.name || tab.name || 'Overview'}</h2>
          <p className="mt-0.5 text-sm text-muted">
            One row per {ov.fixedHeader?.name || 'fixed header'}, other columns summed within it — for the current filters.
          </p>
        </div>
        {editMode && ov.headers?.length > 0 && (
          <HiddenItemsChip hidden={headersArrange.hidden} onShow={headersArrange.show} />
        )}
      </div>
      {!ov.fixedHeader ? (
        <div className="rounded-xl border border-divider bg-background px-4 py-10 text-center text-sm text-muted">
          Pick a fixed header for this Overview tab in Template Settings.
        </div>
      ) : columns.length > 1 ? (
        <DetailsTable
          columns={columns}
          rows={ov.rows}
          editMode={editMode}
          arrange={headersArrange}
          costBySku={costBySku}
          onCostChange={onCostChange}
          companyControl={companyControl}
        />
      ) : (
        <div className="rounded-xl border border-divider bg-background px-4 py-10 text-center text-sm text-muted">
          No headers selected for this Overview tab yet — add some in Template Settings.
        </div>
      )}
    </div>
  );
}
