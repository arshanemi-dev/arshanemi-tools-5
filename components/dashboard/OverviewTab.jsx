'use client';

import { Fragment, useCallback, useState } from 'react';
import { ChevronRight, PanelLeftOpen } from 'lucide-react';
import KpiCardRow from './KpiCardRow';
import GraphStrip from './GraphStrip';
import HiddenItemsChip from './HiddenItemsChip';
import OverviewHierarchyNav from './OverviewHierarchyNav';
import OverviewTreeTable from './OverviewTreeTable';
import { levelStyle } from './overviewLevelStyles';
import { emptySection } from '@/lib/profitLoss/layoutSections';
import { useArrangeableList } from '@/lib/profitLoss/useArrangeableList';
import { ancestorKeys, keysToDepth } from '@/lib/profitLoss/overviewTree';

function SectionLabel({ text, hidden, onShow }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{text}</span>
      <HiddenItemsChip hidden={hidden} onShow={onShow} />
    </div>
  );
}

// One Overview tab (one entry of config.overviewTabs) — its own Title Cards
// (KPI band, reading the same global resolved.titleCardValues every Tab
// reads) → its own Graphs → then the pivot on its unique-value hierarchy
// (resolveTemplate().overviews[tab.id].tree, e.g. Company → Sku → Order Id):
// a left hierarchy sidebar (OverviewHierarchyNav) beside a tree table
// (OverviewTreeTable). The two share ONE expanded-set here, so opening a
// Company in the sidebar opens its Sku rows in the table and vice versa;
// every level has its own colour in both.
//
// Callers key this component by tab id, so expand state resets per tab.
// Laid out with a container query (not viewport breakpoints) — it renders
// both full-width on /profit-loss and in Template Settings' half-width live
// preview, and should go side-by-side whenever ITS OWN width allows.
//
// Edit mode works exactly like TabView's — layout.perTab[tab.id] — the
// hierarchy column stays pinned, same rule as a regular Tab's first column.
export default function OverviewTab({ config, tab, resolved, editMode = false, layout = {}, onSetTabSection = () => {}, costBySku, onCostChange, companyControl, selectedKeys, onToggleRow, onToggleAll, dirtyKeys }) {
  // Every hook below must run unconditionally (same order every render), so
  // the `!tab` bail-out happens at the return instead of up here.
  const tabId = tab?.id ?? null;
  const ov = (tabId && resolved.overviews?.[tabId]) || { name: tab?.name, levels: [], headers: [], tree: [] };
  const levels = ov.levels || (ov.fixedHeader ? [ov.fixedHeader] : []);
  const tree = ov.tree || [];

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

  const [expanded, setExpanded] = useState(() => new Set());
  // `tick` only moves on a sidebar focus — that's what makes the table
  // jump/scroll to the row; a click inside the table just marks it active.
  const [active, setActive] = useState({ key: null, tick: 0 });
  const [navOpen, setNavOpen] = useState(true);

  const toggle = useCallback((key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  const expandToDepth = (depth) => setExpanded(new Set(keysToDepth(tree, depth)));
  // Sidebar label click: open the path down to it, open/close the node
  // itself like a dropdown, and bring its row into view in the table.
  const focusFromNav = (key) => {
    const reclick = active.key === key;
    setExpanded((prev) => {
      const next = new Set(prev);
      ancestorKeys(key).forEach((k) => next.add(k));
      if (reclick && next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    setActive((a) => ({ key, tick: a.tick + 1 }));
  };
  const activateFromTable = (key) => {
    toggle(key);
    setActive((a) => ({ key, tick: a.tick }));
  };

  if (!tab) return null;

  return (
    <div className="@container space-y-5">
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

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-foreground">{ov.name || tab.name || 'Overview'}</h2>
          {levels.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {levels.map((h, i) => {
                const st = levelStyle(i);
                return (
                  <Fragment key={h.id}>
                    {i > 0 && <ChevronRight size={12} className="text-subtle" />}
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.badge}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                      {h.name}
                    </span>
                  </Fragment>
                );
              })}
              <span className="ml-1 text-[12px] text-muted">— other columns summed within each level, for the current filters.</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!navOpen && levels.length > 0 && (
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-divider px-3 py-1 text-[12px] font-medium text-muted hover:bg-card-hover"
            >
              <PanelLeftOpen size={13} /> Hierarchy
            </button>
          )}
          {editMode && ov.headers?.length > 0 && (
            <HiddenItemsChip hidden={headersArrange.hidden} onShow={headersArrange.show} />
          )}
        </div>
      </div>

      {!levels.length ? (
        <div className="rounded-xl border border-divider bg-background px-4 py-10 text-center text-sm text-muted">
          Pick at least one unique value level for this Overview tab in Template Settings.
        </div>
      ) : (
        <div className="flex flex-col gap-4 @lg:flex-row @lg:items-start">
          {navOpen && (
            <OverviewHierarchyNav
              className="shrink-0 @lg:sticky @lg:top-4 @lg:w-44 @3xl:w-56 @5xl:w-64"
              levels={levels}
              tree={tree}
              expanded={expanded}
              onToggle={toggle}
              activeKey={active.key}
              onFocus={focusFromNav}
              onExpandToDepth={expandToDepth}
              onHide={() => setNavOpen(false)}
            />
          )}
          <div className="min-w-0 flex-1">
            <OverviewTreeTable
              levels={levels}
              columns={headersArrange.visible}
              tree={tree}
              expanded={expanded}
              onToggle={toggle}
              activeKey={active.key}
              focusTick={active.tick}
              onActivate={activateFromTable}
              editMode={editMode}
              arrange={headersArrange}
              costBySku={costBySku}
              onCostChange={onCostChange}
              companyControl={companyControl}
              selectedKeys={selectedKeys}
              onToggleRow={onToggleRow}
              onToggleAll={onToggleAll}
              dirtyKeys={dirtyKeys}
            />
          </div>
        </div>
      )}
    </div>
  );
}
