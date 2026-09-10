'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { CHART_TYPES, CHART_LABELS, makeGraphDesign } from '@/data/templateSchema';
import ListEditorColumn from './ListEditorColumn';
import SectionHead from './SectionHead';

// image 2 · Graph Design — reusable chart shells (a name + a chart type). Graph
// Data entries bind to one of these.
export default function GraphDesignSection({ draft }) {
  const { config, addItem, patchItem, removeItem } = draft;
  const designs = config.graphDesigns || [];
  const [activeId, setActiveId] = useState(designs[0]?.id || null);
  const active = designs.find((d) => d.id === activeId) || null;

  const add = () => {
    const d = makeGraphDesign(`Graph Design ${designs.length + 1}`, 'line');
    addItem('graphDesigns', d);
    setActiveId(d.id);
  };

  return (
    <div id="section-graph-design" className="scroll-mt-24">
      <SectionHead title="Graph Design" desc="Name a chart and pick its type." />
      <div className="flex flex-wrap gap-4">
        <ListEditorColumn
          title="Graph Designs"
          items={designs.map((d) => ({ id: d.id, label: d.name }))}
          activeId={activeId}
          onSelect={setActiveId}
          onAdd={add}
          addLabel="Add Graph Design"
        />
        <div className="min-w-0 flex-1 space-y-4 rounded-xl border border-divider bg-background p-4">
          {!active ? (
            <p className="py-10 text-center text-sm text-subtle">Select or add a graph design.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={active.name}
                  onChange={(e) => patchItem('graphDesigns', active.id, { name: e.target.value })}
                  placeholder="Enter Graph Design name"
                  className="min-w-[12rem] flex-1 rounded-lg border border-divider bg-background px-3 py-1.5 text-sm font-medium focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => { removeItem('graphDesigns', active.id); setActiveId(null); }}
                  className="inline-flex items-center gap-1 rounded-full bg-neg/10 px-3 py-1.5 text-xs font-semibold text-neg hover:bg-neg/20"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {CHART_TYPES.map((ct) => (
                  <button
                    key={ct}
                    type="button"
                    onClick={() => patchItem('graphDesigns', active.id, { chartType: ct })}
                    className={`rounded-xl border p-6 text-center text-sm font-medium transition-colors ${
                      active.chartType === ct ? 'border-accent bg-accent/5 text-foreground' : 'border-divider text-muted hover:bg-card-hover'
                    }`}
                  >
                    {CHART_LABELS[ct]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
