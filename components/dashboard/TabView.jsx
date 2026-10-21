'use client';

import { createPortal } from 'react-dom';
import KpiCardRow from './KpiCardRow';
import GraphStrip from './GraphStrip';
import DetailsViewPills from './DetailsViewPills';
import DetailsTable from './DetailsTable';
import HiddenItemsChip from './HiddenItemsChip';
import { emptySection } from '@/lib/profitLoss/layoutSections';
import { myDetailColumns, tabColumnDefs } from '@/lib/profitLoss/tabColumns';
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
// My Details column pill → the details table. Everything is pre-computed in
// `resolved` (lib/profitLoss/resolveTemplate). The table's columns come from
// tabColumnDefs: the headers the admin picked for this tab (tab.headerIds, in
// order) and — with `allHeaders` (the /profit-loss dashboard) — every other
// header of the active version after them, so My Details can pick from all
// of them on every tab (the tab's own picks are the ones ticked until the
// user ticks their own — `myColumns` is this tab's ticks). The first is the
// sticky key column; the rest can be hidden/reordered per user.
//
// In edit mode (sidebar Settings -> Save), each card/graph/column carries
// its own inline ArrangeControl (see KpiCard/GraphStrip/ColumnHeaderCell) —
// layout.perTab[tab.id] is the signed-in user's own show/hide + reorder on
// top of the template's own definition. The first table column is never
// hideable/reorderable — it's the sticky row key, same rule "My Details"
// already applies. The My Details window gets a Column order list then too
// (headersArrange.reorder) — the same arrangement, moved from one place.
//
// `viewPillsSlot` / `pagerSlot` (optional DOM nodes): on /profit-loss the
// My Details pill portals into DashboardHeaderBar instead of sitting above
// the table. The pager stays in the table's footer (no page passes
// `pagerSlot` now), as does Template Settings' preview.
export default function TabView({ config, tab, resolved, myColumns, onMyColumnsChange, editMode = false, layout = {}, onSetTabSection = () => {}, skuCosts, onCostChange, onCostFill, selectedKeys, onToggleRow, onToggleAll, dirtyKeys, dirtyCostCells, totalCount = null, viewPillsSlot = null, pagerSlot = null, allHeaders = false, fillHeight = false, cardsSlot = null }) {
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

  // Costs are typed per SKU, so only into a table whose rows are SKUs — the
  // grouping unless the marketplace names another header to group by.
  const groupBy = (config.headers || []).find((h) => h.id === config.marketplace?.groupByHeaderId);
  const rowsAreSkus = !groupBy || groupBy.primitive === 'sku';

  const tabHeaderDefs = firstHeaderDef ? [firstHeaderDef, ...headersArrange.visible] : headersArrange.visible;

  const columns = tabHeaderDefs.length
    ? [tabHeaderDefs[0], ...myDetailColumns(tabHeaderDefs.slice(1), myColumns, tab.headerIds)]
    : tabHeaderDefs;

  const pills = (
    <DetailsViewPills
      tabHeaders={tabHeaderDefs}
      myColumns={myColumns}
      defaultIds={tab.headerIds}
      onMyColumnsChange={onMyColumnsChange}
      onReorder={editMode ? headersArrange.reorder : null}
      size={viewPillsSlot ? 'md' : 'sm'}
      groups={config.headerGroups}
    />
  );

  // The Title Cards. On the dashboard they portal up into `cardsSlot` —
  // above the header bar (DashboardWorkspace) — so the header bar sits
  // between them and the graphs / table; the preview keeps them here.
  const cards = allCards.length > 0 && (
    <div className="space-y-2">
      {editMode && <SectionLabel text="Title Cards" hidden={cardsArrange.hidden} onShow={cardsArrange.show} />}
      {cardsArrange.visible.length > 0 && (
        <KpiCardRow cards={cardsArrange.visible} values={resolved.titleCardValues} editMode={editMode} arrange={cardsArrange} columns={tab?.layout?.titleCards?.columns} />
      )}
    </div>
  );

  // fillHeight (the dashboard, not Template Settings' preview): stretch to
  // the height the page leaves and let the table take what's left over.
  return (
    <div className={fillHeight ? 'flex flex-1 flex-col gap-5' : 'space-y-5'}>
      {cards && (cardsSlot ? createPortal(cards, cardsSlot) : cards)}

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
            skuCosts={skuCosts}
            onCostChange={onCostChange}
            onCostFill={onCostFill}
            disableCostColumn={!rowsAreSkus}
            selectedKeys={selectedKeys}
            onToggleRow={onToggleRow}
            onToggleAll={onToggleAll}
            dirtyKeys={dirtyKeys}
            dirtyCostCells={dirtyCostCells}
            totalCount={totalCount}
            pagerSlot={pagerSlot}
            fillHeight={fillHeight}
            headers={config.headers}
          />
        </>
      )}
    </div>
  );
}
