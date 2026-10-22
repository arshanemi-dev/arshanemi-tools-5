'use client';

import MyDetailsPanes from '@/components/dashboard/MyDetailsPanes';
import { sectionFrom, sectionList } from '@/lib/profitLoss/positionDraft';

// How a list reads its section and writes it back: shown = not hidden
// (market places, the tab strip) — a tab's Title Cards / Graphs pass their
// own (tabParts.js: the tab's own shown, any other once added).
const PLAIN = {
  list: (items, section) => sectionList(items, section),
  save: (section, items, list, order, ticked) => sectionFrom(section, list.allIds, order, ticked),
};

// What one of Position Settings' lists calls its items — the words on My
// Details' two lists (MyDetailsPanes COLUMN_WORDS), for market places, tabs,
// title cards, graphs.
export const listWords = (one, many, order, off) => ({
  all: `All ${many}`, order, search: `Search ${many}…`, searchLabel: `Search ${many}`,
  none: `No ${many}.`, noMatch: `No ${one} matches`, every: `every ${one} in`,
  empty: `Tick a ${one} to place it here.`, off,
});

// One of Position Settings' lists — Market Places, the tab strip, a tab's
// Title Cards and Graphs — added and removed the way its Columns are: My
// Details' two lists (MyDetailsPanes). Tick what shows (group by group, a
// tick per group too, search, Select all / Clear), then put the ticked ones
// in order on the right — drag ⋮⋮, "Position N", ↑ / ↓ / ⇈ / ⇊; × unticks.
// One unticked keeps its place for when it's ticked again.
// `items` = [{ id, name, groupId? }] in the version's order; `section` = its
// saved layout section; `onChange(nextSection)`. `groups` = [{ id, name }]
// for items that come in kinds (the tab strip's Tabs / Overview Tabs) — else
// one group, titled `title`. As tall as its lists (each scrolls past a height).
// `model` = { list(items, section) → { allIds, order, shown }, save(section,
// items, list, order, ticked) → section } — PLAIN unless given.
export default function TickOrderList({ items = [], section, onChange, groups = null, title, words, model = PLAIN }) {
  const list = model.list(items, section);
  const { order, shown } = list;
  const one = !groups;
  return (
    <MyDetailsPanes
      headers={one ? items.map((it) => ({ ...it, groupId: '__list' })) : items}
      groups={one ? [{ id: '__list', name: title }] : groups}
      ticked={new Set(shown)}
      onTicked={(set) => onChange(model.save(section, items, list, order, [...set]))}
      order={order}
      onOrder={(ids) => onChange(model.save(section, items, list, ids, shown))}
      fill={false}
      words={words}
    />
  );
}
