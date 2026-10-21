'use client';

import { Lock } from 'lucide-react';
import { GENERAL_GROUP_ID } from '@/lib/profitLoss/headerGroups';

// The pick side of the My Details window: every header the table can show,
// under its header group (Template Settings › Header › Our Groups, in that
// order), each one a tick. A group's own tick (on its title) ticks / unticks
// all of it that is listed — just the search results while searching — and
// goes half-ticked when only some are. The key column sits on top, locked:
// it is always shown. `sections` = groupSections(…) below.

// `items` split by header group, in `groups` order. A header with no
// `groupId` is in General; one whose group isn't listed goes under Other;
// with no groups at all (a version saved before groups) it's one plain
// list. Empty groups are left out.
export function groupSections(items, groups) {
  if (!Array.isArray(groups) || !groups.length) return items.length ? [{ id: '__all', name: 'Columns', items }] : [];
  const known = new Set(groups.map((g) => g.id));
  const groupOf = (h) => h.groupId || GENERAL_GROUP_ID;
  const sections = groups.map((g) => ({ id: g.id, name: g.name, items: items.filter((h) => groupOf(h) === g.id) }));
  const rest = items.filter((h) => !known.has(groupOf(h)));
  if (rest.length) sections.push({ id: '__other', name: 'Other', items: rest });
  return sections.filter((s) => s.items.length);
}

const BOX = 'shrink-0 accent-[var(--color-action)]';

export function KeyRow({ header }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-divider-light bg-background px-2.5 py-1.5 text-[13px] text-foreground" title="Row key — always the first column">
      <Lock size={13} className="shrink-0 text-subtle" />
      <span className="min-w-0 truncate font-medium">{header.name}</span>
      <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wide text-subtle">key · always first</span>
    </div>
  );
}

export default function MyDetailsGroupList({ sections = [], ticked, onToggle, onSetMany, keyHeader = null, total = 0, query = '' }) {
  return (
    <div className="@container flex flex-col gap-3">
      {keyHeader && <KeyRow header={keyHeader} />}
      {total === 0 && <p className="px-2 py-6 text-center text-sm text-muted">Only one column on this tab.</p>}
      {total > 0 && sections.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted">No column matches “{query.trim()}”.</p>}

      {sections.map((s) => {
        const on = s.items.filter((h) => ticked.has(h.id)).length;
        const all = on === s.items.length;
        return (
          <section key={s.id} aria-label={s.name} className="overflow-hidden rounded-xl border border-divider bg-background">
            <label className="flex cursor-pointer items-center gap-2 border-b border-divider bg-surface px-3 py-2">
              <input
                type="checkbox"
                checked={all}
                ref={(el) => { if (el) el.indeterminate = on > 0 && !all; }}
                onChange={() => onSetMany(s.items.map((h) => h.id), !all)}
                aria-label={`${all ? 'Untick' : 'Tick'} every column in ${s.name}`}
                className={BOX}
              />
              <span className="min-w-0 truncate text-[11.5px] font-semibold uppercase tracking-wide text-accent">{s.name}</span>
              <span className="ml-auto shrink-0 text-[11px] tabular-nums text-subtle">{on} / {s.items.length}</span>
            </label>
            <div className="grid gap-0.5 p-1.5 @md:grid-cols-2 @2xl:grid-cols-3">
              {s.items.map((h) => {
                const isOn = ticked.has(h.id);
                return (
                  <label
                    key={h.id}
                    title={h.name}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-card-hover ${isOn ? 'text-foreground' : 'text-muted'}`}
                  >
                    <input type="checkbox" checked={isOn} onChange={() => onToggle(h.id)} className={BOX} />
                    <span className="min-w-0 truncate">{h.name}</span>
                  </label>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
