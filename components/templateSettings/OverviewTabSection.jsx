'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { makeOverviewTab } from '@/data/templateSchema';
import { overviewLevelIds } from '@/lib/profitLoss/overviewTree';
import { ourHeaderOptions } from '@/lib/profitLoss/headerUsage';
import { DEFAULT_OVERVIEW_ICON } from '@/components/dashboard/tabIcons';
import IconPicker from './IconPicker';
import HierarchyLevelsEditor from './HierarchyLevelsEditor';
import HeaderPickerStrip from './HeaderPickerStrip';
import SectionHead from './SectionHead';
import Field from './Field';
import NameField from './NameField';

// image 2 · Overview Tab — one or more "Header Wise Overview" pivots. Every
// one that exists shows in the dashboard sidebar after the regular Tabs — no
// separate visibility toggle, same as a Tab's rows: create it and it's live.
// A pivot nests on its Unique Value Hierarchy (HierarchyLevelsEditor — 1+
// key headers, e.g. Company → Sku → Order Id): Level 1's values become the
// dashboard's left hierarchy sidebar, each opening onto the next level, and
// every other picked header aggregates (Σ, or SUM([..]) / COUNT([..]) inside
// its own formula) within each node. Same as a Tab, it can also carry its
// own Title Cards (KPI band) and Graphs — those pick from the same global
// title cards / graphs every Tab picks from. Rename / delete / reorder one
// from the sidebar list; this panel edits whichever is active.
export default function OverviewTabSection({ draft, activeId: activeIdProp, onActiveId }) {
  const { config, addItem, patchItem } = draft;
  const overviewTabs = config.overviewTabs || [];
  const headers = config.headers || [];
  const [localId, setLocalId] = useState(null);
  const activeId = activeIdProp !== undefined ? activeIdProp : localId;
  const setActiveId = onActiveId || setLocalId;
  const active = overviewTabs.find((o) => o.id === activeId) || null;

  const levelIds = overviewLevelIds(active);
  // Our Headers only, never sheet columns (an existing sheet-header pick still shows, flagged).
  const headerOpts = ourHeaderOptions(headers, [...levelIds, ...(active?.headerIds || [])]);
  const otherHeaderOpts = headerOpts.filter((h) => !levelIds.includes(h.id));
  const cardOpts = (config.titleCards || []).map((c) => ({ id: c.id, name: c.name }));
  const graphOpts = (config.graphs || []).map((g) => ({ id: g.id, name: g.name }));

  const patchLayout = (patch) => patchItem('overviewTabs', active.id, { layout: { ...active.layout, ...patch } });
  // A header can't be both a level and a summed column — promoting one to
  // a level drops it from the columns. fixedHeaderId mirrors Level 1 for
  // configs/readers from before hierarchies existed.
  const setLevels = (ids) => patchItem('overviewTabs', active.id, {
    hierarchyHeaderIds: ids,
    fixedHeaderId: ids[0] || null,
    headerIds: (active.headerIds || []).filter((id) => !ids.includes(id)),
  });

  const addOverview = () => {
    const item = makeOverviewTab(`Overview ${overviewTabs.length + 1}`, overviewTabs.length);
    addItem('overviewTabs', item);
    setActiveId(item.id);
  };

  return (
    <div id="section-overview" className="scroll-mt-24">
      <SectionHead
        title="Overview Tab"
        desc="One or more pivots, each nested on its own unique value hierarchy — shown after the tabs in the sidebar."
        right={(
          <button type="button" onClick={addOverview} className="inline-flex items-center gap-1 rounded-full border border-dashed border-divider-light px-2.5 py-1 text-[12px] font-medium text-action hover:bg-action-soft">
            <Plus size={12} /> Add Overview Tab
          </button>
        )}
      />
      <div className="space-y-3 rounded-xl border border-divider bg-background p-4">
        {!active ? (
          <p className="py-10 text-center text-sm text-subtle">Pick an overview tab from the list on the left, or add one.</p>
        ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <NameField
                  list={overviewTabs}
                  id={active.id}
                  value={active.name}
                  onChange={(name) => patchItem('overviewTabs', active.id, { name })}
                  placeholder="Enter Overview Tab name"
                  className="min-w-[10rem] flex-1"
                />
                <IconPicker
                  value={active.icon}
                  fallback={DEFAULT_OVERVIEW_ICON}
                  onChange={(icon) => patchItem('overviewTabs', active.id, { icon })}
                />
              </div>
              <HierarchyLevelsEditor options={headerOpts} value={levelIds} onChange={setLevels} />

              <Field label="Title Cards" hint={`KPI grid — ${(active.titleCardIds || []).length} card(s)`}>
                <HeaderPickerStrip label="Title Card" options={cardOpts} selectedIds={active.titleCardIds || []} onChange={(titleCardIds) => patchItem('overviewTabs', active.id, { titleCardIds })} />
                <label className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
                  Cards per row
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={active.layout?.titleCards?.columns || 4}
                    onChange={(e) => patchLayout({ titleCards: { columns: Math.max(1, Math.min(8, Number(e.target.value) || 4)) } })}
                    className="w-16 rounded-md border border-divider bg-background px-2 py-0.5 text-[11px] focus:outline-none"
                  />
                </label>
              </Field>

              <Field label="Graphs" hint={`${(active.graphIds || []).length} graph(s)`}>
                <HeaderPickerStrip label="Graph" options={graphOpts} selectedIds={active.graphIds || []} onChange={(graphIds) => patchItem('overviewTabs', active.id, { graphIds })} />
              </Field>

              <Field label="Header Wise Overview" hint={`table columns — ${(active.headerIds || []).length}`}>
                {!levelIds.length ? (
                  <p className="text-[11px] text-subtle">Pick at least one hierarchy level above first.</p>
                ) : (
                  <HeaderPickerStrip label="Header" options={otherHeaderOpts} selectedIds={active.headerIds || []} onChange={(headerIds) => patchItem('overviewTabs', active.id, { headerIds })} />
                )}
              </Field>
            </>
          )}
      </div>
    </div>
  );
}
