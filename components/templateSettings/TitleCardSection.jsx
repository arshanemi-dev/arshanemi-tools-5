'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { AGGREGATE_BUILTIN_NAMES, makeTitleCard } from '@/data/templateSchema';
import ListEditorColumn from './ListEditorColumn';
import TypeToggle from './TypeToggle';
import FormulaEditor from './FormulaEditor';
import SectionHead from './SectionHead';

const FORMATS = ['money', 'int', 'pct', 'text'];

function ValueEditor({ label, value, onChange, refNames, previewScope }) {
  return (
    <div className="rounded-lg border border-divider bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-foreground">{label}</span>
        <TypeToggle
          value={value.type}
          onChange={(type) => onChange({ ...value, type })}
          options={['formula', 'number', 'text']}
        />
        <label className="ml-auto flex items-center gap-1 text-[11px] text-muted">
          Format
          <select
            value={value.format || 'money'}
            onChange={(e) => onChange({ ...value, format: e.target.value })}
            className="rounded-md border border-divider bg-background px-1.5 py-0.5 text-[11px] focus:outline-none"
          >
            {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
      </div>
      {value.type === 'formula' ? (
        <FormulaEditor value={value.formula || ''} onChange={(formula) => onChange({ ...value, formula })} refNames={refNames} previewScope={previewScope} />
      ) : (
        <input
          value={value.formula || ''}
          onChange={(e) => onChange({ ...value, formula: e.target.value })}
          placeholder={value.type === 'number' ? 'e.g. 0' : 'text'}
          className="w-full rounded-lg border border-divider bg-background px-2.5 py-1.5 text-[13px] focus:border-accent focus:outline-none"
        />
      )}
    </div>
  );
}

// image 2 · Title Card — one name + two independently-formula'd values (main +
// sub), exactly the KPI card shape the dashboard renders.
export default function TitleCardSection({ draft }) {
  const { config, addItem, patchItem, removeItem } = draft;
  const cards = config.titleCards || [];
  const [activeId, setActiveId] = useState(cards[0]?.id || null);
  const active = cards.find((c) => c.id === activeId) || null;

  const refNames = [...(config.headers || []).map((h) => h.name), ...AGGREGATE_BUILTIN_NAMES];
  const previewScope = Object.fromEntries(refNames.map((n) => [n, 100]));

  const add = () => {
    const c = makeTitleCard(`Title Card ${cards.length + 1}`);
    addItem('titleCards', c);
    setActiveId(c.id);
  };

  return (
    <div id="section-title-card" className="scroll-mt-24">
      <SectionHead title="Title Card" desc="A card name plus a main value and a sub value — each its own formula." />
      <div className="flex flex-wrap gap-4">
        <ListEditorColumn
          title="Title Cards"
          items={cards.map((c) => ({ id: c.id, label: c.name }))}
          activeId={activeId}
          onSelect={setActiveId}
          onAdd={add}
          addLabel="Add Title Card"
        />
        <div className="min-w-0 flex-1 space-y-3 rounded-xl border border-divider bg-background p-4">
          {!active ? (
            <p className="py-10 text-center text-sm text-subtle">Select or add a title card.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={active.name}
                  onChange={(e) => patchItem('titleCards', active.id, { name: e.target.value })}
                  placeholder="Enter Title card name"
                  className="min-w-[12rem] flex-1 rounded-lg border border-divider bg-background px-3 py-1.5 text-sm font-medium focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => { removeItem('titleCards', active.id); setActiveId(null); }}
                  className="inline-flex items-center gap-1 rounded-full bg-neg/10 px-3 py-1.5 text-xs font-semibold text-neg hover:bg-neg/20"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>
              <ValueEditor
                label="Add Main Value"
                value={active.mainValue}
                onChange={(v) => patchItem('titleCards', active.id, { mainValue: v })}
                refNames={refNames}
                previewScope={previewScope}
              />
              <ValueEditor
                label="Add Sub Value"
                value={active.subValue}
                onChange={(v) => patchItem('titleCards', active.id, { subValue: v })}
                refNames={refNames}
                previewScope={previewScope}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
