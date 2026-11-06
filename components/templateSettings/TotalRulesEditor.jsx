'use client';

import { TOTAL_MODES } from '@/lib/profitLoss/tableTotals';

// A Tab's / Overview Tab's Total-row rules — one line per header the tab
// shows: how that column's Total is worked out on the dashboard
// (lib/profitLoss/tableTotals.js). Auto = the built-in rule (sum; a ratio
// formula over the totals; a % averaged; text left blank). Formula = any
// formula over the other columns' totals — [Profit/Loss] / [Total Order] —
// or over the table's rows: SUM([X]), COUNT([Status], "RTO").
// `rules` = the tab's `totals` ({ [headerId]: { mode, formula } });
// `onChange(next)` gets the whole map back (an Auto line is left out).
export default function TotalRulesEditor({ headers = [], headerIds = [], rules = {}, onChange }) {
  const byId = new Map(headers.map((h) => [h.id, h]));
  const shown = headerIds.map((id) => byId.get(id)).filter(Boolean);
  const current = rules || {};

  const setRule = (id, patch) => {
    const next = { ...current, [id]: { mode: 'auto', formula: '', ...current[id], ...patch } };
    if (next[id].mode === 'auto') delete next[id];
    else if (next[id].mode !== 'formula') delete next[id].formula;
    onChange(next);
  };

  if (!shown.length) {
    return <p className="text-[11.5px] text-subtle">Pick this tab&rsquo;s Headers above — each one then gets its own Total rule here.</p>;
  }

  return (
    <div className="space-y-1.5">
      {shown.map((h) => {
        const rule = current[h.id] || { mode: 'auto' };
        return (
          <div key={h.id} className="flex flex-wrap items-center gap-2">
            <span className="w-44 shrink-0 truncate text-[12.5px] text-foreground" title={h.name}>{h.name}</span>
            <select
              value={rule.mode}
              onChange={(e) => setRule(h.id, { mode: e.target.value })}
              aria-label={`Total rule for ${h.name}`}
              className="rounded-md border border-divider bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none"
            >
              {TOTAL_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            {rule.mode === 'formula' && (
              <input
                value={rule.formula || ''}
                onChange={(e) => setRule(h.id, { formula: e.target.value })}
                placeholder="[Profit/Loss] / [Total Order]   or   COUNT([Status], &quot;RTO&quot;)"
                aria-label={`Total formula for ${h.name}`}
                className="min-w-[16rem] flex-1 rounded-md border border-divider bg-background px-2 py-1 font-mono text-xs focus:border-accent focus:outline-none"
              />
            )}
          </div>
        );
      })}
      <p className="pt-1 text-[11px] leading-relaxed text-subtle">
        Auto: numbers add up, a ratio formula is worked out again over the totals, a % is averaged, text is left blank.
        Formula: <code>[Header]</code> is that column&rsquo;s total; <code>SUM([Header])</code> / <code>COUNT([Header], &quot;Value&quot;)</code> go down the table&rsquo;s rows.
      </p>
    </div>
  );
}
