'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { makeOverviewTab } from '@/data/templateSchema';
import HeaderPickerStrip from './HeaderPickerStrip';
import SectionHead from './SectionHead';
import Field from './Field';
import NameField from './NameField';

// image 2 · Overview Tab — one or more "Header Wise Overview" pivots. Every
// one that exists shows in the dashboard sidebar after the regular Tabs — no
// separate visibility toggle, same as a Tab's rows: create it and it's live.
// A pivot: the Fixed Header is a unique key (e.g. Sku Name) — one row per
// value it takes — and every other picked header aggregates (Σ, or
// SUM([..]) / COUNT([..]) inside its own formula) within that group. Same as
// a Tab, it can also carry its own Title Cards (KPI band) and Graphs — those
// pick from the same global title cards / graphs every Tab picks from. Rename
// / delete / reorder one from the sidebar list; this panel edits whichever is
// active.
export default function OverviewTabSection({ draft, activeId: activeIdProp, onActiveId }) {
  const { config, addItem, patchItem } = draft;
  const overviewTabs = config.overviewTabs || [];
  const headers = config.headers || [];
  const [localId, setLocalId] = useState(null);
  const activeId = activeIdProp !== undefined ? activeIdProp : localId;
  const setActiveId = onActiveId || setLocalId;
  const active = overviewTabs.find((o) => o.id === activeId) || null;

  const headerOpts = headers.map((h) => ({ id: h.id, name: h.name }));
  const otherHeaderOpts = headerOpts.filter((h) => h.id !== active?.fixedHeaderId);
  const cardOpts = (config.titleCards || []).map((c) => ({ id: c.id, name: c.name }));
  const graphOpts = (config.graphs || []).map((g) => ({ id: g.id, name: g.name }));

  const patchLayout = (patch) => patchItem('overviewTabs', active.id, { layout: { ...active.layout, ...patch } });

  const addOverview = () => {
    const item = makeOverviewTab(`Overview ${overviewTabs.length + 1}`, overviewTabs.length);
    addItem('overviewTabs', item);
    setActiveId(item.id);
  };

  return (
    <div id="section-overview" className="scroll-mt-24">
      <SectionHead
        title="Overview Tab"
        desc="One or more pivots, each on its own fixed header — shown after the tabs in the sidebar."
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
              <NameField
                list={overviewTabs}
                id={active.id}
                value={active.name}
                onChange={(name) => patchItem('overviewTabs', active.id, { name })}
                placeholder="Enter Overview Tab name"
                className="w-full max-w-md"
              />
              <div className="rounded-lg border border-divider bg-card p-3">
                <label className="block text-[11px] font-medium text-muted">
                  Fixed Header (unique key — one row per value)
                  <select
                    value={active.fixedHeaderId || ''}
                    onChange={(e) => patchItem('overviewTabs', active.id, { fixedHeaderId: e.target.value || null })}
                    className="mt-1 w-full max-w-xs rounded-md border border-divider bg-background px-2 py-1.5 text-xs focus:outline-none"
                  >
                    <option value="">— pick a header —</option>
                    {headerOpts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
                </label>
              </div>

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
                {!active.fixedHeaderId ? (
                  <p className="text-[11px] text-subtle">Pick a Fixed Header above first.</p>
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
