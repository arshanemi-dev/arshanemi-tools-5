'use client';

import { createPortal } from 'react-dom';
import KpiCardRow from './KpiCardRow';
import GraphStrip from './GraphStrip';
import DetailsViewPills from './DetailsViewPills';
import DetailsTable from './DetailsTable';
import HiddenItemsChip from './HiddenItemsChip';
import { emptySection } from '@/lib/profitLoss/layoutSections';
import { tabColumnDefs } from '@/lib/profitLoss/tabColumns';
import { useArrangeableList } from '@/lib/profitLoss/useArrangeableList';

function SectionLabel({ text, hidden, onShow }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{text}</span>
      <HiddenItemsChip hidden={hidden} onShow={onShow} />
    </div>
  );
}

// Renders one config.tab: its Title Cards (KPI band) → its Graphs → the
// My/All column pills → the details table. Everything is pre-computed in
// `resolved` (lib/profitLoss/resolveTemplate). The table's columns come from
// tabColumnDefs: the headers the admin picked for this tab (tab.headerIds, in
// order) and — with `allHeaders` (the /profit-loss dashboard) — every other
// header of the active version after them, so "All Details" shows all of
// them on every tab. The first is the sticky key column; the rest can be
// hidden/reordered per user.
//
// In edit mode (sidebar Settings -> Save), each card/graph/column carries
// its own inline ArrangeControl (see KpiCard/GraphStrip/ColumnHeaderCell) —
// layout.perTab[tab.id] is the signed-in user's own show/hide + reorder on
// top of the template's own definition. The first table column is never
// hideable/reorderable — it's the sticky row key, same rule "My Details"
// already applies.
//
// `viewPillsSlot` / `pagerSlot` (optional DOM nodes): on /profit-loss the
// My/All Details pills and the table's pager portal into DashboardHeaderBar
// instead of sitting above/below the table. Template Settings' preview
// passes neither and keeps them in place.
export default function TabView({ config, tab, resolved, viewMode, onViewModeChange, myColumns, onMyColumnsChange, editMode = false, layout = {}, onSetTabSection = () => {}, costBySku, onCostChange, selectedKeys, onToggleRow, onToggleAll, dirtyKeys, totalCount = null, viewPillsSlot = null, pagerSlot = null, allHeaders = false }) {
  // Every hook below must run unconditionally (same order every render), so
  // the `!tab` bail-out happens at the return instead of up here.
  const tabId = tab?.id ?? null;
  const tabLayout = (tabId && layout.perTab?.[tabId]) || {};
  const cardsSection = tabLayout.titleCards || emptySection();
  const graphsSection = tabLayout.graphs || emptySection();
  const headersSection = tabLayout.headers || emptySection();

  const cardById = new Map((config.titleCards || []).map((c) => [c.id, c]));
  const graphById = new Map((config.graphs || []).map((g) => [g.id, g]));
  const spanById = new Map((tab?.layout?.graphs || []).map((g) => [g.id, g.span || 1]));

  const allCards = (tab?.titleCardIds || []).map((id) => cardById.get(id)).filter(Boolean);
  const allGraphs = (tab?.graphIds || []).map((id) => ({ id, name: graphById.get(id)?.name || id, span: spanById.get(id) || 1 }));

  // The first is the sticky key column, the rest can be hidden / reordered
  // per user (edit mode, My Details). Without `allHeaders`, a tab with no
  // headers picked shows no table at all (cards / graphs only).
  const { key: firstHeaderDef, rest: restHeaderDefs } = tabColumnDefs(tab, resolved.headers || [], {
    allHeaders,
    groupByHeaderId: config.marketplace?.groupByHeaderId,
  });

  const cardsArrange = useArrangeableList(allCards, cardsSection, (next) => onSetTabSection(tabId, 'titleCards', next));
  const graphsArrange = useArrangeableList(allGraphs, graphsSection, (next) => onSetTabSection(tabId, 'graphs', next));
  const headersArrange = useArrangeableList(restHeaderDefs, headersSection, (next) => onSetTabSection(tabId, 'headers', next));

  if (!tab) return null;

  const tabHeaderDefs = firstHeaderDef ? [firstHeaderDef, ...headersArrange.visible] : headersArrange.visible;

  const columns =
    viewMode === 'my' && tabHeaderDefs.length
      ? [tabHeaderDefs[0], ...tabHeaderDefs.slice(1).filter((h) => myColumns.includes(h.id))]
      : tabHeaderDefs;

  const pills = (
    <DetailsViewPills
      mode={viewMode}
      onModeChange={onViewModeChange}
      tabHeaders={tabHeaderDefs}
      myColumns={myColumns}
      onMyColumnsChange={onMyColumnsChange}
      size={viewPillsSlot ? 'md' : 'sm'}
    />
  );

  return (
    <div className="space-y-5">
      {allCards.length > 0 && (
        <div className="space-y-2">
          {editMode && <SectionLabel text="Title Cards" hidden={cardsArrange.hidden} onShow={cardsArrange.show} />}
          {cardsArrange.visible.length > 0 && (
            <KpiCardRow cards={cardsArrange.visible} values={resolved.titleCardValues} editMode={editMode} arrange={cardsArrange} columns={tab?.layout?.titleCards?.columns} />
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

      {tabHeaderDefs.length > 0 && (
        <>
          {viewPillsSlot ? (
            <>
              {createPortal(pills, viewPillsSlot)}
              {editMode && <HiddenItemsChip hidden={headersArrange.hidden} onShow={headersArrange.show} />}
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {editMode ? (
                <HiddenItemsChip hidden={headersArrange.hidden} onShow={headersArrange.show} />
              ) : <span />}
              {pills}
            </div>
          )}
          <DetailsTable
            columns={columns}
            rows={resolved.tableRows}
            editMode={editMode}
            arrange={headersArrange}
            costBySku={costBySku}
            onCostChange={onCostChange}
            selectedKeys={selectedKeys}
            onToggleRow={onToggleRow}
            onToggleAll={onToggleAll}
            dirtyKeys={dirtyKeys}
            totalCount={totalCount}
            pagerSlot={pagerSlot}
          />
        </>
      )}
    </div>
  );
}
