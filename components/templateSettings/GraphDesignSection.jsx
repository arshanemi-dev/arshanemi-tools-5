'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { CHART_TYPES, CHART_LABELS } from '@/data/templateSchema';
import SectionHead from './SectionHead';

// image 2 · Graph Design — reusable chart shells (a name + a chart type). Graph
// Data entries bind to one of these.
export default function GraphDesignSection({ draft, activeId: activeIdProp, onActiveId }) {
  const { config, patchItem, removeItem } = draft;
  const designs = config.graphDesigns || [];
  const [localId, setLocalId] = useState(null);
  const activeId = activeIdProp !== undefined ? activeIdProp : localId;
  const setActiveId = onActiveId || setLocalId;
  const active = designs.find((d) => d.id === activeId) || null;

  return (
    <div id="section-graph-design" className="scroll-mt-24">
      <SectionHead title="Graph Design" desc="Name a chart and pick its type." />
      <div className="space-y-4 rounded-xl border border-divider bg-background p-4">
        {!active ? (
          <p className="py-10 text-center text-sm text-subtle">Pick a graph design from the list on the left, or add one.</p>
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
  );
}
