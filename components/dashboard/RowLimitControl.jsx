'use client';

import { Gauge } from 'lucide-react';

// The "smart limit" — caps the live dashboard to the N most-recently-ordered
// uploaded rows (default 100) before they ever reach the P&L engine, so a
// huge settlement sheet doesn't recompute every KPI/graph/table row off
// thousands of records on every Apply. Download PDF/Excel always ignores
// this (and the date filter) and exports every uploaded row instead — see
// DashboardWorkspace's `fullResolved`.
export default function RowLimitControl({ value, onChange }) {
  return (
    <div className="inline-flex h-9 items-center gap-1.5 rounded-full border border-divider-light bg-background px-3 text-sm text-muted" title="Only the N most recent rows feed the live dashboard — Download always uses every row">
      <Gauge size={14} className="shrink-0" />
      <span className="hidden sm:inline">Latest</span>
      <input
        type="number"
        min="1"
        step="1"
        value={value}
        onChange={(e) => onChange(Math.max(1, Math.trunc(Number(e.target.value)) || 1))}
        aria-label="Number of most recent rows to load into the live dashboard"
        className="w-14 rounded-md border border-divider-light bg-background px-1.5 py-0.5 text-center text-foreground focus:border-accent focus:outline-none"
      />
      <span className="hidden sm:inline">rows</span>
    </div>
  );
}
