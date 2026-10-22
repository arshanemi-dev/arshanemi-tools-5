import { applyLayout, emptySection, startingOrder } from './layoutSections';

// A tab's Title Cards and Graphs ("parts") as a user can arrange them —
// like its columns: every card / graph of the version can be on any tab,
// and the tab's own (tab.titleCardIds / tab.graphIds — Template Settings)
// are what it shows by default. One rule, read by everything that shows,
// works out or downloads them (TabView / OverviewTab, calculationTasks
// configForView, exportView, reconcileLayout, the Position Settings page):
//  - a card the tab has shows unless the user took it off (`hidden`);
//  - any other shows once the user added it (`added`);
//  - all in the section's `order`, over the list "the tab's own, in its
//    order, then every other in the version's order" — so with nothing
//    arranged the tab looks exactly as the template made it.
// The section ({ order, hidden, added, base, picks } — layoutSections.js) is
// saved with the tab's own ids then (`picks`): a newer version adding one to
// the tab, or taking one off, moves it between the two parts of the list,
// which mustn't read as re-positioning (reconcileLayout.js `moved`). An
// added one the version made the tab's own simply stays; a card the version
// took off the tab goes — unless the user added it. All pure.

const OWN = { titleCards: 'titleCardIds', graphs: 'graphIds' };

// Every card / graph a tab can show, each once — `own` = the tab has it.
export function partItems(tab, config, kind) {
  const all = config?.[kind] || [];
  const byId = new Map(all.map((x) => [x.id, x]));
  const ownIds = [...new Set(tab?.[OWN[kind]] || [])].filter((id) => byId.has(id));
  const own = new Set(ownIds);
  return [
    ...ownIds.map((id) => ({ ...byId.get(id), own: true })),
    ...all.filter((x) => !own.has(x.id)).map((x) => ({ ...x, own: false })),
  ];
}

// The section as applyLayout reads it: a card the tab doesn't have is
// hidden unless the user added it.
export function partLayout(items, section) {
  const sec = section || emptySection();
  const added = new Set(sec.added || []);
  const notAdded = items.filter((it) => !it.own && !added.has(it.id)).map((it) => it.id);
  return { ...sec, hidden: [...(sec.hidden || []), ...notAdded] };
}

// What the tab shows, in order.
export const partShown = (items, section) => applyLayout(items, partLayout(items, section));

// The ids a tab shows of one kind — `layout` = the user's whole arrangement.
export const partShownIds = (tab, config, layout, kind) => partShown(partItems(tab, config, kind), layout?.perTab?.[tab?.id]?.[kind]).map((it) => it.id);

// For editing (Position Settings): every id in the section's order — shown
// and not alike, each in its own place — and the shown ones.
export function partList(items, section) {
  const allIds = items.map((it) => it.id);
  const all = new Set(allIds);
  return { allIds, order: startingOrder(section || emptySection(), allIds).filter((id) => all.has(id)), shown: partShown(items, section).map((it) => it.id) };
}

// …and back: the section showing exactly `ticked`, in `order`.
export function partSection(section, items, order, ticked) {
  const on = new Set(ticked);
  const ids = items.map((it) => it.id);
  const all = new Set(ids);
  return {
    ...(section || {}),
    order: order.filter((id) => all.has(id)),
    hidden: items.filter((it) => it.own && !on.has(it.id)).map((it) => it.id),
    added: items.filter((it) => !it.own && on.has(it.id)).map((it) => it.id),
    base: ids,
    picks: items.filter((it) => it.own).map((it) => it.id),
  };
}
