'use client';

import { useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { evaluateFormula } from '@/lib/profitLoss/formula';

const TOKENS = ['+', '-', '*', '/', '(', ')', '%'];

// The formula builder from the Header design, stacked in three rows: a Header
// List dropdown with Copy / Paste, then the operator token strip, then the
// formula field + helper + live preview. Used by Header / Title Card (×2) /
// Graph Data. `refNames` are the names a [bracket] can point at;
// `previewScope` (optional) is a { name: number } map for the live result.
// Copy puts the picked header's [Name] on the clipboard; Paste drops it in at
// the cursor. Sum / Count wrap it as SUM([Name]) / COUNT([Name]) — the two
// aggregate operators (lib/profitLoss/formula.js) that reduce a column across
// every row in the current group, instead of just this row/scope.
// `listNames` (optional) narrows only the Header List dropdown — e.g. to Our
// Headers — while `refNames` stays the full set the live preview resolves.
export default function FormulaEditor({ value = '', onChange, refNames = [], listNames = refNames, previewScope, placeholder = 'ed.abc&123*dss', disabled = false }) {
  const inputRef = useRef(null);
  const [pick, setPick] = useState('');
  const [open, setOpen] = useState(false);

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

  const preview = previewScope ? evaluateFormula(value, previewScope, refNames) : null;
  const token = 'flex h-8 min-w-8 items-center justify-center rounded-full border border-divider-light bg-background px-2 text-[13px] text-muted hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-40';
  const ghost = 'h-9 rounded-full border border-divider-light bg-background px-3 text-[13px] text-muted hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen((o) => !o)}
            className="flex h-9 w-full items-center justify-between gap-2 rounded-xl border border-divider bg-card px-3 text-[13px] text-muted hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="truncate">{pick || 'Header List'}</span>
            <ChevronDown size={16} className="shrink-0 text-foreground" />
          </button>
          {open && !disabled && (
            <ul className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-divider-light bg-background p-1 shadow-lg">
              {listNames.length === 0 && <li className="px-2 py-1 text-[12px] text-subtle">No headers yet.</li>}
              {listNames.map((n) => (
                <li key={n}>
                  <button
                    type="button"
                    onClick={() => { setPick(n); setOpen(false); }}
                    className={`block w-full truncate rounded-lg px-2 py-1 text-left text-[12.5px] hover:bg-card-hover ${n === pick ? 'font-semibold text-foreground' : 'text-muted'}`}
                  >
                    {n}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
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
        <span className="mx-0.5 h-5 w-px bg-divider-light" />
        <button type="button" title="Sum this column across every row in the group" disabled={disabled} onClick={() => insert(pick ? `SUM([${pick}])` : 'SUM()')} className={token}>
          Sum
        </button>
        <button type="button" title="Count this column's non-blank values across every row in the group" disabled={disabled} onClick={() => insert(pick ? `COUNT([${pick}])` : 'COUNT()')} className={token}>
          Count
        </button>
      </div>

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
        parentheses, and <code>SUM([..])</code> / <code>COUNT([..])</code> across the group.
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
