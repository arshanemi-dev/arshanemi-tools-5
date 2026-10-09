'use client';

import { useState } from 'react';
import { AGGREGATE_BUILTIN_NAMES } from '@/data/templateSchema';
import { countCall } from '@/lib/profitLoss/formula';
import SearchSelect from '@/components/dashboard/SearchSelect';

const MODES = [['all', 'All'], ['filter', 'Filter']];

// "Delivered, Shipped" (or one per line) → ['Delivered', 'Shipped'].
const splitValues = (text) => String(text || '').split(/[,\n]/).map((v) => v.trim()).filter(Boolean);

// “A”, “B” or “C”
export function quotedList(values) {
  const q = values.map((v) => `“${v}”`);
  return q.length > 1 ? `${q.slice(0, -1).join(', ')} or ${q[q.length - 1]}` : q[0] || '';
}

// The Count builder FormulaEditor opens under its token strip: which header
// to count, and whether to count every row that has a value ("All", the
// default) or only the rows whose value is one of the typed ones ("Filter" —
// Status → Delivered gives a per-status count). Insert hands the finished
// COUNT(...) text back to drop into the formula at the cursor. Mount it with
// a `key` per open so it starts from the header picked in the Header List.
export default function CountFilterPanel({ columns = [], initialColumn = '', onInsert, onClose }) {
  const options = columns.filter((n) => !AGGREGATE_BUILTIN_NAMES.includes(n));
  const [column, setColumn] = useState(options.includes(initialColumn) ? initialColumn : '');
  const [mode, setMode] = useState('all');
  const [text, setText] = useState('');

  const values = mode === 'filter' ? splitValues(text) : [];
  const ready = !!column && (mode === 'all' || values.length > 0);
  const insert = () => { if (ready) onInsert(countCall(column, values)); };
  const name = column || 'the header';

  return (
    <div className="space-y-2.5 rounded-xl border border-accent/40 bg-accent/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-foreground">Count</span>
        <SearchSelect
          value={column}
          options={options.map((n) => ({ value: n, label: n }))}
          onChange={setColumn}
          placeholder="Pick a header…"
          searchPlaceholder="Search headers…"
          ariaLabel="Header to count"
          className="min-w-[11rem]"
          triggerClass="flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-divider bg-background px-2 text-left text-[12.5px] text-foreground hover:bg-card-hover focus:border-accent focus:outline-none"
        />
        <div role="radiogroup" aria-label="Which values to count" className="inline-flex gap-1.5">
          {MODES.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={mode === id}
              onClick={() => setMode(id)}
              className={`rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors ${
                mode === id ? 'border-action bg-action text-white' : 'border-divider-light bg-background text-foreground hover:bg-card-hover'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'filter' && (
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); insert(); } }}
          placeholder="Values to count, comma separated — e.g. Delivered, Shipped"
          aria-label="Values to count"
          className="h-9 w-full rounded-lg border border-divider bg-background px-3 text-[13px] text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        />
      )}

      <p className="text-[11.5px] leading-relaxed text-muted">
        {mode === 'all' && <>Counts every row that has a value in <span className="font-medium text-foreground">{name}</span>.</>}
        {mode === 'filter' && (values.length
          ? <>Counts only the rows where <span className="font-medium text-foreground">{name}</span> is {quotedList(values)}.</>
          : <>Type the value(s) of <span className="font-medium text-foreground">{name}</span> to count — every other row is left out.</>)}
        {mode === 'filter' && <> Capital letters and spacing don&rsquo;t matter; <code>*</code> stands for any text (<code>*return*</code>).</>}
      </p>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-full border border-divider px-3 py-1 text-[12.5px] font-medium text-muted hover:bg-card-hover">
          Cancel
        </button>
        <button type="button" onClick={insert} disabled={!ready} className="rounded-full bg-action px-3.5 py-1 text-[12.5px] font-semibold text-white hover:bg-action-hover disabled:opacity-40">
          Insert
        </button>
      </div>
    </div>
  );
}
