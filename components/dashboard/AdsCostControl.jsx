'use client';

import { Megaphone } from 'lucide-react';

// Ad spend has no column in any marketplace settlement sheet, so it's a manual
// input: a % of settlement, or a flat ₹ amount (allocated pro-rata per SKU).
export default function AdsCostControl({ value, onChange }) {
  const { mode = 'percent', value: v = 0 } = value || {};

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-divider-light bg-background px-3 py-1.5 text-sm">
      <Megaphone size={14} className="text-muted" />
      <span className="text-muted">Ad spend</span>
      <div className="flex overflow-hidden rounded-full border border-divider-light">
        {['percent', 'flat'].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange({ mode: m, value: v })}
            className={`px-2 py-0.5 text-xs font-medium transition-colors ${
              mode === m ? 'bg-action text-white' : 'bg-background text-muted hover:bg-card-hover'
            }`}
          >
            {m === 'percent' ? '%' : '₹'}
          </button>
        ))}
      </div>
      <input
        type="number"
        min="0"
        step={mode === 'percent' ? '0.5' : '100'}
        value={v}
        onChange={(e) => onChange({ mode, value: Math.max(0, Number(e.target.value) || 0) })}
        className="w-16 rounded-md border border-divider-light bg-background px-2 py-0.5 text-sm text-foreground focus:border-accent focus:outline-none"
      />
    </div>
  );
}
