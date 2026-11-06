'use client';

import { useRef, useState } from 'react';
import SearchSelect from '@/components/dashboard/SearchSelect';
import { aggregateCalls, describeCall, evaluateFormulaTyped } from '@/lib/profitLoss/formula';
import { fmtTyped } from '@/lib/profitLoss/fmt';
import CountFilterPanel from './CountFilterPanel';

const TOKENS = ['+', '-', '*', '/', '(', ')', '%'];

// The formula builder from the Header design, stacked in three rows: a Header
// List dropdown (searchable) with Copy / Paste, then the operator token strip, then the
// formula field + helper + live preview. Used by Header / Title Card (×2) /
// Graph Data. `refNames` are the names a [bracket] can point at;
// `previewScope` (optional) is a { name: number } map for the live result.
// Copy puts the picked header's [Name] on the clipboard; Paste drops it in at
// the cursor. Sum / Count open CountFilterPanel — the aggregate operators
// (lib/profitLoss/formula.js: SUM, COUNT, AVG, MIN, MAX, VALUE) that reduce a
// column across every row in the current group, over every row or only the
// rows where a header has the typed values — SUM([Settlement], [Status],
// "Delivered"). Every call in the formula is spelled out in words below it.
// Today drops in TODAY() — today's date. `dateNames` (optional) = the
// headers that are Dates, so the live result can show what date maths gives:
// one Date minus another, or TODAY() minus one, is a number of days.
// `listNames` (optional) narrows only the Header List dropdown — e.g. to Our
// Headers — while `refNames` stays the full set the live preview resolves.
export default function FormulaEditor({ value = '', onChange, refNames = [], listNames = refNames, previewScope, dateNames = [], placeholder = 'ed.abc&123*dss', disabled = false }) {
  const inputRef = useRef(null);
  const [pick, setPick] = useState('');
  const [panelFn, setPanelFn] = useState(null); // 'SUM' | 'COUNT' — which button opened the builder

  const insert = (text) => {
    if (disabled) return;
    const el = inputRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  };

  // Every SUM / COUNT / … call, in words. One with a condition can't be
  // previewed off the placeholder scope (no sample value ever equals
  // "Delivered"), nor can VALUE (it takes real text) — the words stand in.
  const calls = aggregateCalls(value);
  const noPreview = calls.some((c) => c.values.length || c.where || c.fn === 'VALUE');
  // The placeholder scope holds a number for every name; a Date header gets
  // a date instead (each one a day apart, a few days back) so date maths
  // previews as real days.
  const dateSet = new Set(dateNames);
  const today = new Date();
  const sampleDate = (i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - 5 + i).getTime();
  const typedScope = previewScope && dateNames.length
    ? { ...previewScope, ...Object.fromEntries(dateNames.map((n, i) => [n, sampleDate(i % 4)])) }
    : previewScope;
  const result = previewScope && !noPreview
    ? evaluateFormulaTyped(value, typedScope, refNames, null, { kindOf: (n) => (dateSet.has(n) ? 'date' : null) })
    : null;
  const preview = result ? (result.kind === 'date' || result.kind === 'days' ? fmtTyped(result.value, result.kind) : result.value) : null;
  const token = 'flex h-8 min-w-8 items-center justify-center rounded-full border border-divider-light bg-background px-2 text-[13px] text-muted hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-40';
  const ghost = 'h-9 rounded-full border border-divider-light bg-background px-3 text-[13px] text-muted hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <SearchSelect
          value={pick}
          options={listNames.map((n) => ({ value: n, label: n }))}
          onChange={setPick}
          placeholder="Header List"
          searchPlaceholder="Search headers…"
          ariaLabel="Header List"
          disabled={disabled}
          className="w-full max-w-xs"
          panelClass="w-full min-w-[15rem]"
          triggerClass="flex h-9 w-full items-center justify-between gap-2 rounded-xl border border-divider bg-card px-3 text-left text-[13px] text-foreground hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-40"
        />
        <button type="button" onClick={() => pick && navigator.clipboard?.writeText(`[${pick}]`)} disabled={disabled || !pick} className={ghost}>
          Copy
        </button>
        <button type="button" onClick={() => pick && insert(`[${pick}]`)} disabled={disabled || !pick} className={ghost}>
          Paste
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-divider bg-card px-3 py-2">
        {TOKENS.map((t) => (
          <button key={t} type="button" disabled={disabled} onClick={() => insert(t)} className={token}>
            {t}
          </button>
        ))}
        <button type="button" disabled={disabled} onClick={() => insert('Text')} className={token}>
          Text
        </button>
        <button type="button" title="Today's date — TODAY() - [a Date header] is how many days ago" disabled={disabled} onClick={() => insert('TODAY()')} className={token}>
          Today
        </button>
        <span className="mx-0.5 h-5 w-px bg-divider-light" />
        {[['SUM', 'Sum', 'Add up / average / min / max a column across the group — every row, or only where a header has a value (SUMIF)'],
          ['COUNT', 'Count', "Count a column's values across the group — all of them, or only where a header has a value"]].map(([fn, label, hint]) => (
          <button
            key={fn}
            type="button"
            title={hint}
            disabled={disabled}
            aria-expanded={panelFn === fn}
            onClick={() => setPanelFn((cur) => (cur === fn ? null : fn))}
            className={`${token} ${panelFn === fn ? 'border-accent text-foreground' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>

      {panelFn && !disabled && (
        <CountFilterPanel
          key={`${panelFn}:${pick}`}
          columns={listNames}
          initialColumn={pick}
          initialFn={panelFn}
          onInsert={(text) => { insert(text); setPanelFn(null); }}
          onClose={() => setPanelFn(null)}
        />
      )}

      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="h-11 w-full rounded-xl border border-divider bg-card px-3 text-[13px] text-foreground placeholder:text-muted focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      />

      <p className="text-[11.5px] leading-relaxed text-muted">
        Reference other columns by name in brackets. Supports <code>+ - * /</code>, <code>^</code> (or the word “power”),
        parentheses, and <code>SUM</code> / <code>COUNT</code> / <code>AVG</code> / <code>MIN</code> / <code>MAX</code> / <code>VALUE([..])</code> across the group —{' '}
        <code>COUNT([Status], &quot;Delivered&quot;)</code> counts only that value; <code>SUM([Settlement], [Status], &quot;Delivered&quot;)</code> adds Settlement only where Status is Delivered.
        Dates: one Date header minus another gives days, <code>TODAY() - [Order Date]</code> is days since, <code>[Order Date] + 7</code> is a date.
        {calls.map((c, i) => (
          <span key={i} className="block font-medium text-foreground">
            {calls.length > 1 ? `${i + 1}. ` : ''}{describeCall(c)}
          </span>
        ))}
        {preview !== null && (
          <>
            {' '}·{' '}
            <span className="font-medium text-foreground">
              = {preview === '' ? '—' : String(preview)}
            </span>
          </>
        )}
      </p>
    </div>
  );
}
