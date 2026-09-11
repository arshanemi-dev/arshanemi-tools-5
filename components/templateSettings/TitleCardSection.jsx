'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { AGGREGATE_BUILTIN_NAMES, makeTitleCard } from '@/data/templateSchema';
import TypeToggle from './TypeToggle';
import FormulaEditor from './FormulaEditor';
import SectionHead from './SectionHead';
import NameField from './NameField';

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
// sub), exactly the KPI card shape the dashboard renders. Rename / delete an
// item from the sidebar list; this panel edits whichever one is active.
export default function TitleCardSection({ draft, activeId: activeIdProp, onActiveId }) {
  const { config, addItem, patchItem } = draft;
  const cards = config.titleCards || [];
  const [localId, setLocalId] = useState(null);
  const activeId = activeIdProp !== undefined ? activeIdProp : localId;
  const setActiveId = onActiveId || setLocalId;
  const active = cards.find((c) => c.id === activeId) || null;

  const refNames = [...(config.headers || []).map((h) => h.name), ...AGGREGATE_BUILTIN_NAMES];
  const previewScope = Object.fromEntries(refNames.map((n) => [n, 100]));

  const addCard = () => {
    const item = makeTitleCard(`Title Card ${cards.length + 1}`);
    addItem('titleCards', item);
    setActiveId(item.id);
  };

  return (
    <div id="section-title-card" className="scroll-mt-24">
      <SectionHead
        title="Title Card"
        desc="A card name plus a main value and a sub value — each its own formula."
        right={(
          <button type="button" onClick={addCard} className="inline-flex items-center gap-1 rounded-full border border-dashed border-divider-light px-2.5 py-1 text-[12px] font-medium text-action hover:bg-action-soft">
            <Plus size={12} /> Add Title Card
          </button>
        )}
      />
      <div className="space-y-3 rounded-xl border border-divider bg-background p-4">
        {!active ? (
          <p className="py-10 text-center text-sm text-subtle">Pick a title card from the list on the left, or add one.</p>
        ) : (
            <>
              <NameField
                list={cards}
                id={active.id}
                value={active.name}
                onChange={(name) => patchItem('titleCards', active.id, { name })}
                placeholder="Enter Title card name"
                className="w-full max-w-md"
              />
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
  );
}
