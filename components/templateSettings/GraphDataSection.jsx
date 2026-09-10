'use client';

import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { AGGREGATE_BUILTIN_NAMES, TIME_UNITS, makeGraphData, makeSeries } from '@/data/templateSchema';
import ListEditorColumn from './ListEditorColumn';
import TypeToggle from './TypeToggle';
import FormulaEditor from './FormulaEditor';
import SectionHead from './SectionHead';

// Reshape series when the bound chart type flips between pie and non-pie.
function fitSeries(series, isPie) {
  if (isPie) {
    const out = series.map((s) => ({ title: s.title || '', value: s.value }));
    while (out.length < 2) out.push(makeSeries(true));
    return out;
  }
  const first = series[0] || makeSeries(false);
  return [{ title: first.title || '', value: first.value, category: first.category || { type: 'times', unit: 'day' } }];
}

// image 2 · Graph Data — binds data to a Graph Design. Pie needs ≥ 2
// formula-driven title/value pairs; every other chart takes exactly one
// measure formula plus a fixed "times" (time-bucket) x-axis.
export default function GraphDataSection({ draft }) {
  const { config, addItem, patchItem, removeItem } = draft;
  const graphs = config.graphData || [];
  const designs = config.graphDesigns || [];
  const [activeId, setActiveId] = useState(graphs[0]?.id || null);
  const active = graphs.find((g) => g.id === activeId) || null;

  const refNames = [...(config.headers || []).map((h) => h.name), ...AGGREGATE_BUILTIN_NAMES];
  const previewScope = Object.fromEntries(refNames.map((n) => [n, 100]));
  const chartType = designs.find((d) => d.id === active?.graphDesignId)?.chartType || null;
  const isPie = chartType === 'pie';

  const add = () => {
    const g = makeGraphData(`Graph ${graphs.length + 1}`, 'line');
    addItem('graphData', g);
    setActiveId(g.id);
  };
  const setSeries = (series) => patchItem('graphData', active.id, { series });
  const patchSeries = (i, patch) => setSeries(active.series.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const chooseDesign = (graphDesignId) => {
    const nextIsPie = designs.find((d) => d.id === graphDesignId)?.chartType === 'pie';
    patchItem('graphData', active.id, { graphDesignId, series: fitSeries(active.series, nextIsPie) });
  };

  return (
    <div id="section-graph-data" className="scroll-mt-24">
      <SectionHead title="Graph Data" desc="Bind a measure (or measures, for pie) to a Graph Design." />
      <div className="flex flex-wrap gap-4">
        <ListEditorColumn
          title="Graph Data"
          items={graphs.map((g) => ({ id: g.id, label: g.name }))}
          activeId={activeId}
          onSelect={setActiveId}
          onAdd={add}
          addLabel="Add Graph Data"
        />
        <div className="min-w-0 flex-1 space-y-4 rounded-xl border border-divider bg-background p-4">
          {!active ? (
            <p className="py-10 text-center text-sm text-subtle">Select or add a graph.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={active.name}
                  onChange={(e) => patchItem('graphData', active.id, { name: e.target.value })}
                  placeholder="Enter Graph Data name"
                  className="min-w-[12rem] flex-1 rounded-lg border border-divider bg-background px-3 py-1.5 text-sm font-medium focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => { removeItem('graphData', active.id); setActiveId(null); }}
                  className="inline-flex items-center gap-1 rounded-full bg-neg/10 px-3 py-1.5 text-xs font-semibold text-neg hover:bg-neg/20"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <TypeToggle
                  value={active.type}
                  onChange={(type) => patchItem('graphData', active.id, { type })}
                  options={['formula', 'number', 'text', 'graphDesign']}
                />
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  Graph Design
                  <select
                    value={active.graphDesignId || ''}
                    onChange={(e) => chooseDesign(e.target.value || null)}
                    className="rounded-md border border-divider bg-background px-2 py-1 text-xs focus:outline-none"
                  >
                    <option value="">— pick —</option>
                    {designs.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.chartType})</option>)}
                  </select>
                </label>
              </div>

              {!active.graphDesignId ? (
                <p className="rounded-lg bg-card p-3 text-xs text-subtle">Pick a Graph Design to configure its series.</p>
              ) : isPie ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-foreground">Slices ({active.series.length})</span>
                    <button type="button" onClick={() => setSeries([...active.series, makeSeries(true)])} className="inline-flex items-center gap-1 rounded-full border border-dashed border-divider-light px-2.5 py-1 text-[12px] font-medium text-action hover:bg-action-soft">
                      <Plus size={12} /> Add pair
                    </button>
                  </div>
                  {active.series.length < 2 && <p className="text-[11px] text-neg">A pie needs at least 2 title/value pairs.</p>}
                  {active.series.map((s, i) => (
                    <div key={i} className="rounded-lg border border-divider bg-card p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <input
                          value={s.title}
                          onChange={(e) => patchSeries(i, { title: e.target.value })}
                          placeholder={`Slice ${i + 1} title`}
                          className="flex-1 rounded-md border border-divider bg-background px-2 py-1 text-[12.5px] focus:border-accent focus:outline-none"
                        />
                        <button type="button" onClick={() => setSeries(active.series.filter((_, idx) => idx !== i))} disabled={active.series.length <= 2} className="rounded-full p-1 text-subtle hover:text-neg disabled:opacity-30">
                          <X size={13} />
                        </button>
                      </div>
                      <FormulaEditor value={s.value?.formula || ''} onChange={(formula) => patchSeries(i, { value: { ...s.value, formula } })} refNames={refNames} previewScope={previewScope} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2 rounded-lg border border-divider bg-card p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={active.series[0]?.title || ''}
                      onChange={(e) => patchSeries(0, { title: e.target.value })}
                      placeholder="Measure title"
                      className="flex-1 rounded-md border border-divider bg-background px-2 py-1 text-[12.5px] focus:border-accent focus:outline-none"
                    />
                    <label className="flex items-center gap-1 text-[11px] text-muted">
                      times
                      <select
                        value={active.series[0]?.category?.unit || 'day'}
                        onChange={(e) => patchSeries(0, { category: { type: 'times', unit: e.target.value } })}
                        className="rounded-md border border-divider bg-background px-1.5 py-0.5 text-[11px] focus:outline-none"
                      >
                        {TIME_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </label>
                  </div>
                  <FormulaEditor value={active.series[0]?.value?.formula || ''} onChange={(formula) => patchSeries(0, { value: { ...active.series[0].value, formula } })} refNames={refNames} previewScope={previewScope} />
                  <p className="text-[11px] text-subtle">The second axis is always the time bucket selected above.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
