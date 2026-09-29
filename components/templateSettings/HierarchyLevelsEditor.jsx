'use client';

import { AlertTriangle, ArrowDown, ArrowUp, X } from 'lucide-react';
import { MAX_OVERVIEW_LEVELS } from '@/lib/profitLoss/overviewTree';
import { levelStyle } from '@/components/dashboard/overviewLevelStyles';

// An Overview tab's "Unique Value Hierarchy" — the ordered key headers its
// pivot nests by (Level 1 → Level N, e.g. Company → Sku → Order Id). Each
// level is stepped in under the one above and carries the same colour the
// dashboard's hierarchy sidebar + tree table use for it. At least one level
// is required: the last one can't be removed (swap it via its dropdown
// instead), and an empty list shows red until Level 1 is picked. Picking a
// header another level already uses swaps the two levels, same as
// HeaderPickerStrip. `options` = [{ id, name }]; `value` = ordered ids.
export default function HierarchyLevelsEditor({ options = [], value = [], onChange }) {
  const byId = new Map(options.map((o) => [o.id, o]));
  const unused = options.filter((o) => !value.includes(o.id));
  const missing = value.length === 0;
  const canAdd = value.length < MAX_OVERVIEW_LEVELS && unused.length > 0;

  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const pick = (i, id) => {
    if (!id || id === value[i]) return;
    const j = value.indexOf(id);
    const next = [...value];
    next[i] = id;
    if (j !== -1) next[j] = value[i];
    onChange(next);
  };
  const remove = (i) => { if (value.length > 1) onChange(value.filter((_, j) => j !== i)); };
  const add = (id) => { if (id) onChange([...value, id]); };

  const nextStyle = levelStyle(value.length);

  return (
    <div className={`rounded-lg border bg-card p-3 ${missing ? 'border-neg/60' : 'border-divider'}`}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-foreground">Unique Value Hierarchy</span>
        <span className="text-[11px] text-subtle">{value.length}/{MAX_OVERVIEW_LEVELS} levels · min 1</span>
      </div>
      <p className="mb-2.5 text-[11px] text-subtle">
        Level 1&rsquo;s values become the dashboard&rsquo;s hierarchy sidebar; each next level opens inside the one
        above it (e.g. Company → Sku → Order Id).
      </p>

      {value.length > 0 && (
        <ol className="space-y-1.5">
          {value.map((id, i) => {
            const st = levelStyle(i);
            return (
              <li key={id} className={`flex items-center gap-1.5 rounded-lg border border-l-4 border-divider-light bg-background py-1 pl-2 pr-1 ${st.stripe} ${st.step}`}>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${st.badge}`}>L{i + 1}</span>
                <select
                  value={id}
                  onChange={(e) => pick(i, e.target.value)}
                  aria-label={`Level ${i + 1} header`}
                  className="min-w-0 flex-1 rounded-md border border-divider bg-background px-2 py-1 text-[12px] text-foreground focus:border-accent focus:outline-none"
                >
                  {!byId.has(id) && <option value={id}>{id} (deleted header)</option>}
                  {options.map((o) => {
                    const at = value.indexOf(o.id);
                    return <option key={o.id} value={o.id}>{o.name}{at !== -1 && at !== i ? ` (swap with L${at + 1})` : ''}</option>;
                  })}
                </select>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move level up" className="shrink-0 rounded p-0.5 text-subtle hover:text-foreground disabled:opacity-30">
                  <ArrowUp size={12} />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label="Move level down" className="shrink-0 rounded p-0.5 text-subtle hover:text-foreground disabled:opacity-30">
                  <ArrowDown size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  disabled={value.length <= 1}
                  title={value.length <= 1 ? 'At least one level is required' : 'Remove level'}
                  aria-label="Remove level"
                  className="shrink-0 rounded-full p-0.5 text-subtle hover:bg-card-hover hover:text-neg disabled:opacity-30"
                >
                  <X size={11} />
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {canAdd && (
        <div className={`${value.length ? 'mt-1.5' : ''} ${nextStyle.step}`}>
          <select
            value=""
            onChange={(e) => add(e.target.value)}
            aria-label={`Add level ${value.length + 1}`}
            className={`rounded-full border border-dashed bg-background px-2.5 py-1 text-[12px] font-medium focus:outline-none ${
              missing ? 'border-neg text-neg' : 'border-divider-light text-action'
            }`}
          >
            <option value="">+ Add Level {value.length + 1}{missing ? ' (required)' : ''}…</option>
            {unused.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      )}
      {missing && (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-neg">
          <AlertTriangle size={12} /> Required — pick at least one unique value level.
        </p>
      )}
      {!options.length && <p className="mt-1.5 text-[11px] text-subtle">Add some headers first.</p>}
    </div>
  );
}
