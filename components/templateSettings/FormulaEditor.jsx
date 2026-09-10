'use client';

import { useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { evaluateFormula } from '@/lib/profitLoss/formula';

const TOKENS = ['+', '-', '/', '*', '(', ')', '%'];

// The formula builder from image 2: a token row + a Header List dropdown with
// Copy / Post + a text field + helper + live preview. Used by Header /
// Title Card (×2) / Graph Data. `refNames` are the names a [bracket] can point
// at; `previewScope` (optional) is a { name: number } map for the live result.
export default function FormulaEditor({ value = '', onChange, refNames = [], previewScope, placeholder = 'ed.abc&123*dss' }) {
  const inputRef = useRef(null);
  const [pick, setPick] = useState(refNames[0] || '');
  const [open, setOpen] = useState(false);

  const insert = (text) => {
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

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {TOKENS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => insert(t)}
            className="h-7 w-7 rounded-md border border-divider bg-background text-[13px] font-medium text-muted hover:bg-card-hover"
          >
            {t}
          </button>
        ))}
        <button
          type="button"
          onClick={() => insert('Text')}
          className="h-7 rounded-md border border-divider bg-background px-2 text-[12px] font-medium text-muted hover:bg-card-hover"
        >
          Text
        </button>

        <span className="mx-1 h-5 w-px bg-divider" />

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-divider bg-background px-2 text-[12px] text-muted hover:bg-card-hover"
          >
            <span className="max-w-[8rem] truncate">{pick || 'Header List'}</span>
            <ChevronDown size={12} />
          </button>
          {open && (
            <ul className="absolute z-30 mt-1 max-h-60 w-52 overflow-y-auto rounded-lg border border-divider-light bg-background p-1 shadow-lg">
              {refNames.map((n) => (
                <li key={n}>
                  <button
                    type="button"
                    onClick={() => { setPick(n); setOpen(false); }}
                    className={`block w-full truncate rounded px-2 py-1 text-left text-[12px] hover:bg-card-hover ${n === pick ? 'font-semibold text-foreground' : 'text-muted'}`}
                  >
                    {n}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={() => pick && navigator.clipboard?.writeText(`[${pick}]`)}
          disabled={!pick}
          className="h-7 rounded-md border border-divider bg-background px-2 text-[12px] font-medium text-muted hover:bg-card-hover disabled:opacity-40"
        >
          Copy
        </button>
        <button
          type="button"
          onClick={() => pick && insert(`[${pick}]`)}
          disabled={!pick}
          className="h-7 rounded-md bg-action px-2 text-[12px] font-semibold text-white hover:bg-action-hover disabled:opacity-40"
        >
          Post
        </button>
      </div>

      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-divider bg-background px-2.5 py-1.5 text-[13px] focus:border-accent focus:outline-none"
      />

      <p className="text-[11px] text-subtle">
        Reference other columns by name in brackets. Supports <code>+ - / *</code> (or the word “power”), and parentheses.
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
