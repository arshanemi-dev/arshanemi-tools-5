'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { CHART_TYPES, CHART_LABELS, TIME_UNITS, makeGraph } from '@/data/templateSchema';
import HeaderPickerStrip from './HeaderPickerStrip';
import GraphPreviewChart from './GraphPreviewChart';
import SectionHead from './SectionHead';
import NameField from './NameField';

// image 2 · Graph — Graph Design (the chart type) and Graph Data (what it
// plots) are one entity: name it, pick a chart type, then pick the "Graph
// Header" columns to draw. Pie needs >= 2 headers (one slice each);
// line/bar/area auto-split into one series per header over a shared time
// bucket — no manual per-slice formula, the chart IS the picked headers.
// Rename / delete an item from the sidebar list; this panel edits whichever
// one is active.
export default function GraphSection({ draft, activeId: activeIdProp, onActiveId }) {
  const { config, addItem, patchItem } = draft;
  const graphs = config.graphs || [];
  const headers = config.headers || [];
  const [localId, setLocalId] = useState(null);
  const activeId = activeIdProp !== undefined ? activeIdProp : localId;
  const setActiveId = onActiveId || setLocalId;
  const active = graphs.find((g) => g.id === activeId) || null;

  const headerOpts = headers.map((h) => ({ id: h.id, name: h.name }));
  const isPie = active?.chartType === 'pie';
  const minNeeded = isPie ? 2 : 1;
  const pickedHeaders = (active?.headerIds || []).map((id) => headers.find((h) => h.id === id)).filter(Boolean);

  const addGraph = () => {
    const item = makeGraph(`Graph ${graphs.length + 1}`, 'line');
    addItem('graphs', item);
    setActiveId(item.id);
  };

  return (
    <div id="section-graph" className="scroll-mt-24">
      <SectionHead
        title="Graph"
        desc="Name a chart, pick its type, then pick the headers it plots — Graph Design and Graph Data in one place."
        right={(
          <button type="button" onClick={addGraph} className="inline-flex items-center gap-1 rounded-full border border-dashed border-divider-light px-2.5 py-1 text-[12px] font-medium text-action hover:bg-action-soft">
            <Plus size={12} /> Add Graph
          </button>
        )}
      />
      <div className="space-y-4 rounded-xl border border-divider bg-background p-4">
        {!active ? (
          <p className="py-10 text-center text-sm text-subtle">Pick a graph from the list on the left, or add one.</p>
        ) : (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <div className="space-y-4">
                <NameField
                  list={graphs}
                  id={active.id}
                  value={active.name}
                  onChange={(name) => patchItem('graphs', active.id, { name })}
                  placeholder="Enter Graph name"
                  className="w-full max-w-md"
                />

                <div>
                  <div className="mb-1.5 text-[11px] font-medium text-muted">Chart type</div>
                  <div className="inline-flex flex-wrap gap-1 rounded-lg border border-divider bg-card p-0.5">
                    {CHART_TYPES.map((ct) => (
                      <button
                        key={ct}
                        type="button"
                        onClick={() => patchItem('graphs', active.id, { chartType: ct })}
                        className={`rounded-md px-2.5 py-1 text-[12.5px] font-semibold transition-colors ${
                          active.chartType === ct ? 'bg-action text-white shadow-sm' : 'text-subtle hover:text-foreground'
                        }`}
                      >
                        {CHART_LABELS[ct]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <span className="text-[12px] font-semibold text-foreground">Graph Header{isPie ? 's' : ''}</span>
                    <span className="text-[11px] text-subtle">{pickedHeaders.length} picked</span>
                  </div>
                  <HeaderPickerStrip label="Graph Header" options={headerOpts} selectedIds={active.headerIds || []} onChange={(headerIds) => patchItem('graphs', active.id, { headerIds })} />
                  {pickedHeaders.length < minNeeded && (
                    <p className="mt-1.5 text-[11px] text-neg">
                      {isPie ? 'A pie needs at least 2 headers.' : 'Pick at least 1 header.'}
                    </p>
                  )}
                </div>

                {!isPie && (
                  <label className="flex items-center gap-1.5 text-[11px] text-muted">
                    Time bucket
                    <select
                      value={active.timeUnit || 'day'}
                      onChange={(e) => patchItem('graphs', active.id, { timeUnit: e.target.value })}
                      className="rounded-md border border-divider bg-background px-1.5 py-0.5 text-[11px] focus:outline-none"
                    >
                      {TIME_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </label>
                )}
              </div>

              <div className="rounded-lg border border-divider bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-foreground">Preview</span>
                  <span className="text-[10.5px] text-subtle">demo data — live on the dashboard</span>
                </div>
                <div className="h-72">
                  <GraphPreviewChart chartType={active.chartType} headers={pickedHeaders} />
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
