'use client';

import { useEffect, useRef, useState } from 'react';

const COMMIT_MS = 600; // a pause in typing this long hands the reason over

// The Transactions page's two editable cells for a (pending) payment's
// confirmation — data/fixedHeaders.js Review + Reason, kept on the order's
// own row (DashboardWorkspace.onReviewChange) and saved with it.

// Review: Yes / No, No until someone picks Yes.
export function ReviewSelect({ value, onChange, label }) {
  const yes = value === 'Yes';
  return (
    <select
      value={yes ? 'yes' : 'no'}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={`rounded-lg border px-2 py-1 text-sm font-medium focus:border-accent focus:outline-none ${
        yes ? 'border-action/40 bg-action-soft text-action' : 'border-divider bg-background text-muted'
      }`}
    >
      <option value="no">No</option>
      <option value="yes">Yes</option>
    </select>
  );
}

// Reason: free text, only while Review is Yes. Like CostCell, what is typed
// is handed over (`onCommit(text)`) once the typing pauses, on Enter or on
// leaving the box — not on every key — and still handed over if the row
// leaves the screen mid-edit.
export function ReasonInput({ value, enabled, onCommit, label }) {
  const [text, setText] = useState(null); // what's being typed; null = showing `value`
  const timer = useRef(null);
  const waiting = useRef(null);
  const commit = useRef(onCommit);
  useEffect(() => { commit.current = onCommit; });

  const flush = () => {
    clearTimeout(timer.current);
    if (waiting.current == null) return;
    const typed = waiting.current;
    waiting.current = null;
    commit.current?.(typed);
  };

  useEffect(() => () => {
    clearTimeout(timer.current);
    if (waiting.current != null) commit.current?.(waiting.current);
  }, []);

  const onType = (next) => {
    setText(next);
    waiting.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, COMMIT_MS);
  };

  return (
    <input
      type="text"
      autoComplete="off"
      value={enabled ? text ?? value ?? '' : ''}
      disabled={!enabled}
      onChange={(e) => onType(e.target.value)}
      onBlur={() => { flush(); setText(null); }}
      onKeyDown={(e) => { if (e.key === 'Enter') flush(); }}
      placeholder={enabled ? 'Why is it Yes?' : 'Set Review to Yes first'}
      aria-label={label}
      className="w-48 rounded-lg border border-divider bg-background px-2 py-1 text-sm focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:bg-card disabled:opacity-60"
    />
  );
}
