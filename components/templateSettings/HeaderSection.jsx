'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { AGGREGATE_BUILTIN_NAMES, makeHeader } from '@/data/templateSchema';
import ListEditorColumn from './ListEditorColumn';
import TypeToggle from './TypeToggle';
import FormulaEditor from './FormulaEditor';
import SectionHead from './SectionHead';

const SOURCE_LABEL = { default: 'default', extracted: 'sheet', manual: 'added' };
const FORMATS = ['money', 'int', 'pct', 'text'];

// image 2 · Header — the template's header list. Default headers (bound to an
// engine metric) can be renamed / re-formulated but not deleted. Extracted
// headers appear only for sheet columns that were NOT mapped to a default one
// in the Market Place section (the "union" rule). Formula headers reference
// other headers by [name].
export default function HeaderSection({ draft }) {
  const { config, addItem, patchItem, removeItem } = draft;
  const headers = config.headers || [];
  const [activeId, setActiveId] = useState(headers[0]?.id || null);
  const active = headers.find((h) => h.id === activeId) || null;

  const refNames = [
    ...headers.filter((h) => h.id !== activeId).map((h) => h.name),
    ...AGGREGATE_BUILTIN_NAMES,
  ];
  const previewScope = Object.fromEntries(refNames.map((n) => [n, 100]));

  const addHeader = () => {
    const h = makeHeader({ name: `Header ${headers.length + 1}`, type: 'number', source: 'manual' });
    addItem('headers', h);
    setActiveId(h.id);
  };

  const counts = headers.reduce((acc, h) => { acc[h.source] = (acc[h.source] || 0) + 1; return acc; }, {});

  return (
    <div id="section-header" className="scroll-mt-24">
      <SectionHead
        title="Header"
        desc={`The template's column list — default ${counts.default || 0} · from sheets ${counts.extracted || 0} · added ${counts.manual || 0}.`}
      />
      <div className="flex flex-wrap gap-4">
        <ListEditorColumn
          title="Headers"
          items={headers.map((h) => ({ id: h.id, label: h.name }))}
          activeId={activeId}
          onSelect={setActiveId}
          onAdd={addHeader}
          addLabel="Add New Header"
          renderMeta={(it) => {
            const h = headers.find((x) => x.id === it.id);
            return <span className="shrink-0 text-[10px] uppercase text-subtle">{SOURCE_LABEL[h?.source] || ''}</span>;
          }}
        />

        <div className="min-w-0 flex-1 rounded-xl border border-divider bg-background p-4">
          {!active ? (
            <p className="py-10 text-center text-sm text-subtle">Select or add a header.</p>
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
    </div>
  );
}
