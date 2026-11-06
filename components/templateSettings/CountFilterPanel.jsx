'use client';

import { useState } from 'react';
import { AGGREGATE_BUILTIN_NAMES } from '@/data/templateSchema';
import { aggregateCall, describeCall } from '@/lib/profitLoss/formula';
import SearchSelect from '@/components/dashboard/SearchSelect';

// What each operator does, for its picker.
const FNS = [
  ['SUM', 'Sum', 'Add up the numbers'],
  ['COUNT', 'Count', 'Count the rows that have a value'],
  ['AVG', 'Average', 'Average of the numbers'],
  ['MIN', 'Min', 'Smallest number'],
  ['MAX', 'Max', 'Largest number'],
  ['VALUE', 'Value', 'Take the value itself (text too)'],
];
const MODES = [['all', 'All rows'], ['filter', 'Only where…']];

// "Delivered, Shipped" (or one per line) → ['Delivered', 'Shipped'].
const splitValues = (text) => String(text || '').split(/[,\n]/).map((v) => v.trim()).filter(Boolean);

// “A”, “B” or “C”
export function quotedList(values) {
  const q = values.map((v) => `“${v}”`);
  return q.length > 1 ? `${q.slice(0, -1).join(', ')} or ${q[q.length - 1]}` : q[0] || '';
}

const selectClass = 'flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-divider bg-background px-2 text-left text-[12.5px] text-foreground hover:bg-card-hover focus:border-accent focus:outline-none';

// The builder FormulaEditor opens under its token strip for the aggregate
// operators (lib/profitLoss/formula.js): which operator, which header to
// take, and whether over every row of the group ("All rows") or only the
// rows where a header — that one, or another — has one of the typed values
// ("Only where…"):
//   Sum of Settlement, only where Status is Delivered → SUM([Settlement], [Status], "Delivered")
//   Count of Status, only where Status is RTO         → COUNT([Status], "RTO")
// Insert hands the finished text back to drop in at the cursor. Mount it with
// a `key` per open so it starts from the header picked in the Header List.
export default function CountFilterPanel({ columns = [], initialColumn = '', initialFn = 'COUNT', onInsert, onClose }) {
  const options = columns.filter((n) => !AGGREGATE_BUILTIN_NAMES.includes(n));
  const [fn, setFn] = useState(initialFn);
  const [column, setColumn] = useState(options.includes(initialColumn) ? initialColumn : '');
  const [mode, setMode] = useState('all');
  const [where, setWhere] = useState('');
  const [text, setText] = useState('');

  const values = mode === 'filter' ? splitValues(text) : [];
  const whereName = where || column; // the condition header — the same one unless another is picked
  const ready = !!column && (mode === 'all' || (!!whereName && values.length > 0));
  // COUNT's short form when the condition is the counted header itself.
  const call = mode === 'filter'
    ? { fn, name: column, where: fn === 'COUNT' && whereName === column ? null : whereName, values }
    : { fn, name: column, where: null, values: [] };
  const insert = () => { if (ready) onInsert(aggregateCall(call.fn, call.name, call.where, call.values)); };
  const strong = (t) => <span className="font-medium text-foreground">{t}</span>;

  return (
    <div className="space-y-2.5 rounded-xl border border-accent/40 bg-accent/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={fn}
          onChange={(e) => setFn(e.target.value)}
          aria-label="Operator"
          title={FNS.find(([id]) => id === fn)?.[2]}
          className="h-8 rounded-lg border border-divider bg-background px-2 text-[12.5px] font-semibold text-foreground focus:border-accent focus:outline-none"
        >
          {FNS.map(([id, label, hint]) => <option key={id} value={id} title={hint}>{label}</option>)}
        </select>
        <span className="text-[12.5px] text-muted">of</span>
        <SearchSelect
          value={column}
          options={options.map((n) => ({ value: n, label: n }))}
          onChange={setColumn}
          placeholder="Pick a header…"
          searchPlaceholder="Search headers…"
          ariaLabel="Header to take"
          className="min-w-[11rem]"
          triggerClass={selectClass}
        />
        <div role="radiogroup" aria-label="Which rows" className="inline-flex gap-1.5">
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-muted">where</span>
          <SearchSelect
            value={where}
            options={options.map((n) => ({ value: n, label: n }))}
            onChange={setWhere}
            placeholder={column ? `${column} (same header)` : 'Pick a header…'}
            searchPlaceholder="Search headers…"
            ariaLabel="Condition header"
            className="min-w-[11rem]"
            triggerClass={selectClass}
          />
          <span className="text-[12.5px] text-muted">is</span>
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); insert(); } }}
            placeholder="Delivered, Shipped"
            aria-label="Values to match"
            className="h-8 min-w-[12rem] flex-1 rounded-lg border border-divider bg-background px-2 text-[12.5px] text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>
      )}

      <p className="text-[11.5px] leading-relaxed text-muted">
        {!column && 'Pick the header to take.'}
        {column && (mode === 'filter' && !values.length
          ? <>Type the value(s) of {strong(whereName)} to match — every other row is left out.</>
          : <>{strong(describeCall(call))}</>)}
        {column && <> <code className="text-[11px]">{aggregateCall(call.fn, call.name, call.where, call.values)}</code></>}
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
