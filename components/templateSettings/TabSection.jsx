'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { makeTab } from '@/data/templateSchema';
import HeaderPickerStrip from './HeaderPickerStrip';
import SectionHead from './SectionHead';
import Field from './Field';
import NameField from './NameField';

const ICON_OPTIONS = ['LayoutDashboard', 'ShoppingCart', 'Undo2', 'TrendingUp', 'LineChart', 'Package', 'Map', 'ClipboardCheck'];

// image 2 · Tab — each entry in the user's sidebar. Compose + order its Title
// Cards, Graphs and Headers, and set the KPI grid width. Every tab that
// exists shows in the dashboard sidebar — no separate visibility toggle,
// same as Overview Tab. Rename / delete / reorder a tab from the sidebar
// list (Settings toggle); this panel edits whichever one is active.
export default function TabSection({ draft, activeId: activeIdProp, onActiveId }) {
  const { config, addItem, patchItem } = draft;
  const tabs = [...(config.tabs || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const [localId, setLocalId] = useState(null);
  const activeId = activeIdProp !== undefined ? activeIdProp : localId;
  const setActiveId = onActiveId || setLocalId;
  const active = tabs.find((t) => t.id === activeId) || null;

  const cardOpts = (config.titleCards || []).map((c) => ({ id: c.id, name: c.name }));
  const graphOpts = (config.graphs || []).map((g) => ({ id: g.id, name: g.name }));
  const headerOpts = (config.headers || []).map((h) => ({ id: h.id, name: h.name }));

  const patchLayout = (patch) => patchItem('tabs', active.id, { layout: { ...active.layout, ...patch } });

  const addTab = () => {
    const item = makeTab(`Tab ${tabs.length + 1}`, tabs.length);
    addItem('tabs', item);
    setActiveId(item.id);
  };

  return (
    <div id="section-tab" className="scroll-mt-24">
      <SectionHead
        title="Tab"
        desc="The dashboard sidebar entries and what each one shows."
        right={(
          <button type="button" onClick={addTab} className="inline-flex items-center gap-1 rounded-full border border-dashed border-divider-light px-2.5 py-1 text-[12px] font-medium text-action hover:bg-action-soft">
            <Plus size={12} /> Add Tab
          </button>
        )}
      />
      <div className="space-y-4 rounded-xl border border-divider bg-background p-4">
        {!active ? (
          <p className="py-10 text-center text-sm text-subtle">Pick a tab from the list on the left, or add one.</p>
        ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <NameField
                  list={tabs}
                  id={active.id}
                  value={active.name}
                  onChange={(name) => patchItem('tabs', active.id, { name })}
                  placeholder="Enter Tab name"
                  className="min-w-[10rem] flex-1"
                />
                <select
                  value={active.icon || 'LayoutDashboard'}
                  onChange={(e) => patchItem('tabs', active.id, { icon: e.target.value })}
                  className="rounded-md border border-divider bg-background px-2 py-1.5 text-xs focus:outline-none"
                >
                  {ICON_OPTIONS.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>

              <Field label="Title Cards" hint={`KPI grid — ${active.titleCardIds.length} card(s)`}>
                <HeaderPickerStrip label="Title Card" options={cardOpts} selectedIds={active.titleCardIds} onChange={(titleCardIds) => patchItem('tabs', active.id, { titleCardIds })} />
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

              <Field label="Graphs" hint={`${active.graphIds.length} graph(s)`}>
                <HeaderPickerStrip label="Graph" options={graphOpts} selectedIds={active.graphIds} onChange={(graphIds) => patchItem('tabs', active.id, { graphIds })} />
              </Field>

              <Field label="Headers" hint={`table columns — ${active.headerIds.length}`}>
                <HeaderPickerStrip label="Header" options={headerOpts} selectedIds={active.headerIds} onChange={(headerIds) => patchItem('tabs', active.id, { headerIds })} />
              </Field>
            </>
          )}
      </div>
    </div>
  );
}
