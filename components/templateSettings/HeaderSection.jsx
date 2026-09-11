'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { AGGREGATE_BUILTIN_NAMES } from '@/data/templateSchema';
import TypeToggle from './TypeToggle';
import FormulaEditor from './FormulaEditor';
import SectionHead from './SectionHead';

const FORMATS = ['money', 'int', 'pct', 'text'];

// image 2 · Header — the template's header list. Default headers (bound to an
// engine metric) can be renamed / re-formulated but not deleted. Extracted
// headers appear only for sheet columns that were NOT mapped to a default one
// in the Market Place section (the "union" rule). Formula headers reference
// other headers by [name].
export default function HeaderSection({ draft, activeId: activeIdProp, onActiveId }) {
  const { config, patchItem, removeItem } = draft;
  const headers = config.headers || [];
  const [localId, setLocalId] = useState(null);
  const activeId = activeIdProp !== undefined ? activeIdProp : localId;
  const setActiveId = onActiveId || setLocalId;
  const active = headers.find((h) => h.id === activeId) || null;

  const refNames = [
    ...headers.filter((h) => h.id !== activeId).map((h) => h.name),
    ...AGGREGATE_BUILTIN_NAMES,
  ];
  const previewScope = Object.fromEntries(refNames.map((n) => [n, 100]));

  const counts = headers.reduce((acc, h) => { acc[h.source] = (acc[h.source] || 0) + 1; return acc; }, {});

  return (
    <div id="section-header" className="scroll-mt-24">
      <SectionHead
        title="Header"
        desc={`The template's column list — default ${counts.default || 0} · from sheets ${counts.extracted || 0} · added ${counts.manual || 0}.`}
      />
      <div className="rounded-xl border border-divider bg-background p-4">
        {!active ? (
          <p className="py-10 text-center text-sm text-subtle">Pick a header from the list on the left, or add one.</p>
        ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={active.name}
                  onChange={(e) => patchItem('headers', active.id, { name: e.target.value })}
                  placeholder="Enter Header name"
                  className="min-w-[12rem] flex-1 rounded-lg border border-divider bg-background px-3 py-1.5 text-sm font-medium focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  disabled={active.source === 'default'}
                  onClick={() => { removeItem('headers', active.id); setActiveId(null); }}
                  className="inline-flex items-center gap-1 rounded-full bg-neg/10 px-3 py-1.5 text-xs font-semibold text-neg hover:bg-neg/20 disabled:opacity-40"
                  title={active.source === 'default' ? 'Default headers can’t be deleted' : 'Delete header'}
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <TypeToggle value={active.type} onChange={(type) => patchItem('headers', active.id, { type })} />
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  Format
                  <select
                    value={active.format || 'money'}
                    onChange={(e) => patchItem('headers', active.id, { format: e.target.value })}
                    className="rounded-md border border-divider bg-background px-2 py-1 text-xs focus:outline-none"
                  >
                    {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={active.showInTable !== false}
                    onChange={(e) => patchItem('headers', active.id, { showInTable: e.target.checked })}
                    className="accent-[var(--color-action)]"
                  />
                  Show in table
                </label>
              </div>

              {active.type === 'formula' && (
                <FormulaEditor
                  value={active.formula || ''}
                  onChange={(formula) => patchItem('headers', active.id, { formula })}
                  refNames={refNames}
                  previewScope={previewScope}
                />
              )}

              {active.source === 'default' && (
                <p className="text-[11px] text-subtle">
                  Bound to the <code>{active.primitive}</code> engine metric{active.note ? ` — ${active.note}` : ''}.
                </p>
              )}
              {active.mappedFrom && (
                <p className="text-[11px] text-subtle">
                  Filled from <code>{active.mappedFrom.slot}</code> · <code>{active.mappedFrom.sheetHeader}</code>.
                </p>
              )}
            </div>
          )}
      </div>
    </div>
  );
}
