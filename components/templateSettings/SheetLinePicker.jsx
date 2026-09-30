'use client';

import { useState } from 'react';
import { Plus, RotateCcw, X } from 'lucide-react';
import { columnLetter, parseLineSpec } from '@/lib/sheet/sheetLayout';

// One sheet's Header + Value line picks (SheetHeadersUploader card). Lines
// are rows or columns, following the sheet's Row / Column direction.
//   Headers — one or more line numbers as chips (+ add, × remove). Several
//     header lines join into one name per column ("Group › Header").
//   Values  — which lines hold data, typed like "4-end", "4-200",
//     "4, 6-10, 15" (letters work for columns: "B-D"). Empty = auto: every
//     line after the headers.
// `headerIndexes` = what's in effect (auto-detected or picked);
// `explicitHeaders` = the admin's own pick, or null while on auto.
export default function SheetLinePicker({
  isCol, disabled, headerIndexes = [], explicitHeaders = null, onHeaders,
  valueSpec = '', onValueSpec, valueFrom, valueTo, valueSpecOk = true,
}) {
  const [adding, setAdding] = useState('');
  const unit = isCol ? 'Columns' : 'Rows';
  const label = (n) => (isCol ? `${columnLetter(n)}` : String(n));
  const current = explicitHeaders?.length ? explicitHeaders : headerIndexes;

  const addLine = () => {
    const parsed = parseLineSpec(adding, 100000);
    if (!parsed?.length) return;
    const next = [...new Set([...current, ...parsed.map((i) => i + 1)])].sort((a, b) => a - b);
    onHeaders(next);
    setAdding('');
  };
  const removeLine = (n) => {
    const next = current.filter((x) => x !== n);
    onHeaders(next.length ? next : null);
  };

  const autoHint = valueFrom ? `auto: ${label(valueFrom)}–${label(valueTo)}` : 'auto';

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 shrink-0 text-[12px] font-medium text-muted">Headers</span>
        <span className="text-[11.5px] text-subtle">{unit}:</span>
        {current.map((n) => (
          <span key={n} className="inline-flex items-center gap-0.5 rounded-md border border-action/40 bg-action-soft py-0.5 pl-1.5 pr-0.5 text-[11.5px] text-foreground">
            {label(n)}
            <button
              type="button"
              disabled={disabled || current.length <= 1}
              onClick={() => removeLine(n)}
              aria-label={`Remove header ${isCol ? 'column' : 'row'} ${label(n)}`}
              className="rounded p-0.5 text-subtle hover:text-neg disabled:opacity-30"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <span className="inline-flex items-center gap-0.5">
          <input
            value={adding}
            disabled={disabled}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addLine(); }}
            placeholder={isCol ? 'B' : '2'}
            aria-label={`Add header ${isCol ? 'column' : 'row'}`}
            className="w-12 rounded-md border border-divider bg-background px-1.5 py-0.5 text-[11.5px] focus:border-accent focus:outline-none disabled:opacity-50"
          />
          <button type="button" onClick={addLine} disabled={disabled || !adding.trim()} className="rounded-md p-1 text-action hover:bg-action-soft disabled:opacity-30" aria-label="Add">
            <Plus size={12} />
          </button>
        </span>
        {explicitHeaders?.length ? (
          <button type="button" disabled={disabled} onClick={() => onHeaders(null)} title="Back to auto-detect" className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] text-subtle hover:text-foreground">
            <RotateCcw size={11} /> Auto
          </button>
        ) : (
          <span className="text-[11px] text-subtle">auto</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 shrink-0 text-[12px] font-medium text-muted">Values</span>
        <span className="text-[11.5px] text-subtle">{unit}:</span>
        <input
          value={valueSpec}
          disabled={disabled}
          onChange={(e) => onValueSpec(e.target.value)}
          placeholder={autoHint}
          aria-label={`Value ${unit.toLowerCase()}`}
          className={`w-44 rounded-md border bg-background px-2 py-0.5 text-[11.5px] focus:outline-none disabled:opacity-50 ${
            valueSpecOk ? 'border-divider focus:border-accent' : 'border-neg text-neg'
          }`}
        />
        {valueSpec ? (
          <button type="button" disabled={disabled} onClick={() => onValueSpec('')} title="Back to auto" className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] text-subtle hover:text-foreground">
            <RotateCcw size={11} /> Auto
          </button>
        ) : (
          <span className="text-[11px] text-subtle">auto</span>
        )}
        <span className={`text-[10.5px] ${valueSpecOk ? 'text-subtle' : 'text-neg'}`}>
          {valueSpecOk ? `e.g. ${isCol ? 'B-end · B-F · B, D-F' : '4-end · 4-200 · 4, 6-10'}` : 'Not understood — use e.g. 4-end or 4, 6-10'}
        </span>
      </div>
    </div>
  );
}
