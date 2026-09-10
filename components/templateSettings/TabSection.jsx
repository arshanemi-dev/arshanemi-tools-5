'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { makeTab } from '@/data/templateSchema';
import ListEditorColumn from './ListEditorColumn';
import HeaderPickerStrip from './HeaderPickerStrip';
import SectionHead from './SectionHead';

const ICON_OPTIONS = ['LayoutDashboard', 'ShoppingCart', 'Undo2', 'TrendingUp', 'LineChart', 'Package', 'Map', 'ClipboardCheck'];

// image 2 · Tab — each entry in the user's sidebar. Compose + order its Title
// Cards, Graphs and Headers, set the KPI grid width, and toggle whether the
// tab shows in the dashboard sidebar at all.
export default function TabSection({ draft }) {
  const { config, addItem, patchItem, removeItem, setTabVisible } = draft;
  const tabs = [...(config.tabs || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const [activeId, setActiveId] = useState(tabs[0]?.id || null);
  const active = tabs.find((t) => t.id === activeId) || null;

  const cardOpts = (config.titleCards || []).map((c) => ({ id: c.id, name: c.name }));
  const graphOpts = (config.graphData || []).map((g) => ({ id: g.id, name: g.name }));
  const headerOpts = (config.headers || []).map((h) => ({ id: h.id, name: h.name }));
  const visible = (id) => config.visibility?.tabs?.[id] !== false;

  const add = () => {
    const t = makeTab(`Tab ${tabs.length + 1}`, tabs.length);
    addItem('tabs', t);
    setActiveId(t.id);
  };
  const patchLayout = (patch) => patchItem('tabs', active.id, { layout: { ...active.layout, ...patch } });

  return (
    <div id="section-tab" className="scroll-mt-24">
      <SectionHead title="Tab" desc="The dashboard sidebar entries and what each one shows." />
      <div className="flex flex-wrap gap-4">
        <ListEditorColumn
          title="Tabs"
          items={tabs.map((t) => ({ id: t.id, label: t.name }))}
          activeId={activeId}
          onSelect={setActiveId}
          onAdd={add}
          addLabel="Add New Tab"
          renderMeta={(it) => (
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${visible(it.id) ? 'bg-action' : 'bg-divider-light'}`} />
          )}
        />
        <div className="min-w-0 flex-1 space-y-4 rounded-xl border border-divider bg-background p-4">
          {!active ? (
            <p className="py-10 text-center text-sm text-subtle">Select or add a tab.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={active.name}
                  onChange={(e) => patchItem('tabs', active.id, { name: e.target.value })}
                  placeholder="Enter Tab name"
                  className="min-w-[10rem] flex-1 rounded-lg border border-divider bg-background px-3 py-1.5 text-sm font-medium focus:border-accent focus:outline-none"
                />
                <select
                  value={active.icon || 'LayoutDashboard'}
                  onChange={(e) => patchItem('tabs', active.id, { icon: e.target.value })}
                  className="rounded-md border border-divider bg-background px-2 py-1.5 text-xs focus:outline-none"
                >
                  {ICON_OPTIONS.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  <input type="checkbox" checked={visible(active.id)} onChange={(e) => setTabVisible(active.id, e.target.checked)} className="accent-[var(--color-action)]" />
                  Show in sidebar
                </label>
                <button
                  type="button"
                  onClick={() => { removeItem('tabs', active.id); setActiveId(null); }}
                  className="inline-flex items-center gap-1 rounded-full bg-neg/10 px-3 py-1.5 text-xs font-semibold text-neg hover:bg-neg/20"
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
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="rounded-lg border border-divider bg-card p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-foreground">{label}</span>
        {hint && <span className="text-[11px] text-subtle">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
