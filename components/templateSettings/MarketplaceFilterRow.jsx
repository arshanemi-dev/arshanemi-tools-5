'use client';

import { Chip } from './HeaderGroupsRow';

// "Market Places" — the row under Our Groups (HeaderSection). Multi-select,
// every marketplace ticked by default: the mapping table shows one column
// per ticked marketplace. A view choice only — nothing here is saved.
// `items` = [{ id, name, count }] (count = its sheet headers);
// `selectedIds`, `onToggle(id)`, `onAll(on)`.
export default function MarketplaceFilterRow({ items = [], selectedIds = [], onToggle, onAll }) {
  if (!items.length) return null;
  const selected = new Set(selectedIds);
  const allOn = items.every((m) => selected.has(m.id));
  const someOn = items.some((m) => selected.has(m.id));
  const total = items.reduce((n, m) => n + m.count, 0);

  return (
    <div className="flex flex-wrap items-center gap-2 px-4">
      <span className="w-24 shrink-0 text-[12.5px] font-semibold text-foreground">Market Places</span>
      <Chip active={allOn} mixed={!allOn && someOn} onClick={() => onAll(!allOn)} count={total}>All</Chip>
      {items.map((m) => (
        <Chip key={m.id} active={selected.has(m.id)} onClick={() => onToggle(m.id)} count={m.count}>
          {m.name}
        </Chip>
      ))}
    </div>
  );
}
