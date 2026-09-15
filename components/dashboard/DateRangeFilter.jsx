'use client';

import { useState } from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import Popover from './Popover';
import { DATE_PRESETS, rangeForPreset, validateCustomRange, todayISO } from '@/lib/profitLoss/dateRanges';

// "Date ▾" — presets (7 Days / 1 Month / 6 Months / 1 Year) + Custom with
// from/to inputs. Emits { preset, from, to }. The parent's "Apply" button is
// what recomputes.
export default function DateRangeFilter({ value, onChange }) {
  const { preset = '7d', from = null, to = null } = value || {};
  const [customFrom, setCustomFrom] = useState(from || '');
  const [customTo, setCustomTo] = useState(to || '');
  const [err, setErr] = useState('');

  const summaryLabel = () => {
    if (preset !== 'custom') return DATE_PRESETS.find((p) => p.id === preset)?.label ?? 'Date';
    if (from && to) return `${from} → ${to}`;
    return 'Custom';
  };

  return (
    <Popover
      align="right"
      panelClass="min-w-[16rem] p-2"
      trigger={(open) => (
        <button
          type="button"
          className={`inline-flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors ${
            open ? 'border-accent' : 'border-divider-light hover:border-divider'
          }`}
        >
          <CalendarDays size={15} className="text-muted" />
          {summaryLabel()}
          <ChevronDown size={15} className="text-muted" />
        </button>
      )}
    >
      {(close) => (
        <div>
          {DATE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                if (p.id === 'custom') {
                  onChange({ preset: 'custom', from: customFrom || null, to: customTo || null });
                } else {
                  onChange({ preset: p.id, ...rangeForPreset(p.id) });
                  close();
                }
              }}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-card-hover ${
                preset === p.id ? 'font-semibold text-action' : 'text-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}

          {preset === 'custom' && (
            <div className="mt-1 space-y-2 border-t border-divider p-2">
              <label className="block text-xs font-medium text-muted">
                From
                <input
                  type="date"
                  max={todayISO()}
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-divider-light bg-background px-2.5 py-1.5 text-sm text-foreground focus:border-accent focus:outline-none"
                />
              </label>
              <label className="block text-xs font-medium text-muted">
                To
                <input
                  type="date"
                  max={todayISO()}
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-divider-light bg-background px-2.5 py-1.5 text-sm text-foreground focus:border-accent focus:outline-none"
                />
              </label>
              {err && <p className="text-xs text-neg">{err}</p>}
              <button
                type="button"
                onClick={() => {
                  const v = validateCustomRange(customFrom, customTo);
                  if (!v.ok) {
                    setErr(v.error);
                    return;
                  }
                  setErr('');
                  onChange({ preset: 'custom', from: customFrom, to: customTo });
                  close();
                }}
                className="w-full rounded-lg bg-action px-3 py-1.5 text-sm font-semibold text-white hover:bg-action-hover"
              >
                Set range
              </button>
            </div>
          )}
        </div>
      )}
    </Popover>
  );
}
