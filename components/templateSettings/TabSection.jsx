'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { MAX_CARDS_PER_ROW, makeTab } from '@/data/templateSchema';
import { headerPickerOptions } from '@/lib/profitLoss/headerUsage';
import { DEFAULT_TAB_ICON } from '@/components/dashboard/tabIcons';
import HeaderPickerStrip from './HeaderPickerStrip';
import SectionHead from './SectionHead';
import Field from './Field';
import NameField from './NameField';
import IconPicker from './IconPicker';
import TotalRulesEditor from './TotalRulesEditor';

// image 2 · Tab — each entry in the user's sidebar. Compose + order its Title
// Cards, Graphs and Headers, and set the KPI grid width. Every tab that
// exists shows in the dashboard sidebar — no separate visibility toggle,
// same as Overview Tab. The tabs are listed here (one chip each — pick one
// to edit it; the first is picked until another is), with Add and Delete;
// the left rail has just a "Tab" row, and Tabs Organizer sets their order.
export default function TabSection({ draft, activeId: activeIdProp, onActiveId }) {
  const { config, addItem, patchItem, removeItem } = draft;
  const tabs = [...(config.tabs || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const [localId, setLocalId] = useState(null);
  const activeId = activeIdProp !== undefined ? activeIdProp : localId;
  const setActiveId = onActiveId || setLocalId;
  const active = tabs.find((t) => t.id === activeId) || tabs[0] || null;

  const cardOpts = (config.titleCards || []).map((c) => ({ id: c.id, name: c.name }));
  const graphOpts = (config.graphs || []).map((g) => ({ id: g.id, name: g.name }));
  const headerOpts = headerPickerOptions(config.headers); // every header, sheet columns flagged

  const patchLayout = (patch) => patchItem('tabs', active.id, { layout: { ...active.layout, ...patch } });

  const addTab = () => {
    const item = makeTab(`Tab ${tabs.length + 1}`, tabs.length);
    addItem('tabs', item);
    setActiveId(item.id);
  };
  const deleteTab = () => {
    const rest = tabs.filter((t) => t.id !== active.id);
    removeItem('tabs', active.id);
    setActiveId(rest[0]?.id ?? null);
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
        {tabs.length > 0 && (
          <div role="tablist" aria-label="Tabs" className="flex flex-wrap gap-1.5 border-b border-divider pb-3">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={t.id === active?.id}
                onClick={() => setActiveId(t.id)}
                className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors ${
                  t.id === active?.id ? 'bg-footer text-white' : 'border border-divider text-foreground/80 hover:bg-card-hover'
                }`}
              >
                {t.name || 'Untitled'}
              </button>
            ))}
          </div>
        )}
        {!active ? (
          <p className="py-10 text-center text-sm text-subtle">No tabs yet — press Add Tab.</p>
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
                <IconPicker
                  value={active.icon}
                  fallback={DEFAULT_TAB_ICON}
                  onChange={(icon) => patchItem('tabs', active.id, { icon })}
                />
                <button
                  type="button"
                  onClick={deleteTab}
                  title="Delete this tab — Save New Version to keep it"
                  className="inline-flex items-center gap-1 rounded-full border border-neg/40 px-2.5 py-1 text-[12px] font-medium text-neg hover:bg-neg/10"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>

              <Field label="Title Cards" hint={`KPI grid — ${active.titleCardIds.length} card(s)`}>
                <HeaderPickerStrip label="Title Card" options={cardOpts} selectedIds={active.titleCardIds} onChange={(titleCardIds) => patchItem('tabs', active.id, { titleCardIds })} />
                <label className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
                  Cards per row
                  <input
                    type="number"
                    min={1}
                    max={MAX_CARDS_PER_ROW}
                    value={active.layout?.titleCards?.columns || 4}
                    onChange={(e) => patchLayout({ titleCards: { columns: Math.max(1, Math.min(MAX_CARDS_PER_ROW, Number(e.target.value) || 4)) } })}
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

              <Field label="Total row" hint="how each column's Total is worked out">
                <TotalRulesEditor headers={config.headers || []} headerIds={active.headerIds} rules={active.totals} onChange={(totals) => patchItem('tabs', active.id, { totals })} />
              </Field>
            </>
          )}
      </div>
    </div>
  );
}
