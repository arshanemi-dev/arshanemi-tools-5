import { applyLayout, emptySection, startingOrder } from './layoutSections';
import { myDetailColumns, overviewColumnDefs, overviewShownHeaders, tabColumnDefs } from './tabColumns';
import { TREE_COL, overviewLevelIds } from './overviewTree';

// The Position Settings page (components/positionSettings/) edits the same
// saved arrangement the dashboard reads — preferences.layout ({ tabs,
// overviewTabs, perTab: { [tabId]: { titleCards, graphs, headers } } }, each
// a layoutSections.js section) and each tab's My Details ticks. These turn
// the page's lists into those and back, the way the dashboard shows them
// (TabView / OverviewTab / DashboardWorkspace). All pure.

const byOrder = (list) => [...(list || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

// Every Tab / Overview Tab the version has, in its order — { id, name }.
export const tabItems = (config) => byOrder(config?.tabs).map((t) => ({ id: t.id, name: t.name || 'Untitled tab' }));
export const overviewItems = (config) => byOrder(config?.overviewTabs).map((o) => ({ id: o.id, name: o.name || 'Untitled overview' }));

// A tab's own Title Cards / Graphs — what its dashboard page can show.
export function cardItems(tab, config) {
  const byId = new Map((config?.titleCards || []).map((c) => [c.id, c]));
  return (tab?.titleCardIds || []).map((id) => byId.get(id)).filter(Boolean).map((c) => ({ id: c.id, name: c.name || c.id }));
}
export function graphItems(tab, config) {
  const byId = new Map((config?.graphs || []).map((g) => [g.id, g]));
  return (tab?.graphIds || []).map((id) => ({ id, name: byId.get(id)?.name || id }));
}

// What a section shows now, in order (applyLayout) — the ids.
export const shownIds = (items, section) => applyLayout(items, section || emptySection()).map((it) => it.id);

// The section that shows exactly `visibleIds`, in that order: every other
// item of `allIds` is hidden and keeps its place after them. Saved with
// `allIds` as its base — the version order it was arranged on.
export function sectionShowing(section, allIds, visibleIds) {
  const all = new Set(allIds);
  const shown = new Set(visibleIds.filter((id) => all.has(id)));
  const rest = startingOrder(section || emptySection(), allIds).filter((id) => all.has(id) && !shown.has(id));
  return { ...(section || {}), order: [...shown, ...rest], hidden: allIds.filter((id) => !shown.has(id)), base: [...allIds] };
}

// One tab's columns as the page edits them (My Details' two lists):
//  - `keyHeader` — the locked first column (an Overview tab: its hierarchy);
//  - `headers` — every other column it can show, in the order the table
//    arranges them (`orderIds`);
//  - `shownIds` — the ones the table shows now: ticked, and not hidden by an
//    older inline × (the page folds that into the ticks — see columnsSaved);
//  - `defaultIds` — what the tab shows with no ticks of its own ("Tab default").
// `ticks` = the tab's My Details ticks (useDashboardSettings myColumnsFor).
export function columnsModel(tab, config, layout, ticks = [], overview = false) {
  const headers = config?.headers || [];
  const section = layout?.perTab?.[tab?.id]?.headers || emptySection();
  let keyHeader;
  let rest;
  let shown;
  let defaults;
  if (overview) {
    const byId = new Map(headers.map((h) => [h.id, h]));
    const levels = overviewLevelIds(tab).map((id) => byId.get(id)).filter(Boolean);
    const pickable = overviewColumnDefs(tab, headers);
    keyHeader = levels.length ? { id: TREE_COL, name: levels.map((h) => h.name).join(' › ') } : null;
    rest = pickable.rest;
    shown = overviewShownHeaders(tab, headers, ticks).map((h) => h.id);
    defaults = pickable.defaultIds;
  } else {
    const defs = tabColumnDefs(tab, headers, { allHeaders: true, groupByHeaderId: config?.marketplace?.groupByHeaderId });
    keyHeader = defs.key;
    rest = defs.rest;
    shown = myDetailColumns(applyLayout(rest, section), ticks, tab?.headerIds || []).map((h) => h.id);
    defaults = myDetailColumns(rest, [], tab?.headerIds || []).map((h) => h.id);
  }
  const allIds = rest.map((h) => h.id);
  const all = new Set(allIds);
  const hidden = new Set(section.hidden || []);
  const orderIds = startingOrder(section, allIds).filter((id) => all.has(id));
  const byId = new Map(rest.map((h) => [h.id, h]));
  return {
    keyHeader,
    headers: orderIds.map((id) => byId.get(id)),
    allIds,
    orderIds,
    shownIds: shown.filter((id) => all.has(id) && !hidden.has(id)),
    defaultIds: defaults.filter((id) => all.has(id)),
  };
}

// What the page saves for a tab whose columns it changed: its ticks (the
// shown ones), what they were made against (the tab's own headers — the
// dashboard's My Details base), and a headers section in the new order with
// nothing hidden — showing is the ticks' job now.
export function columnsSaved(tab, section, allIds, orderIds, ticked) {
  const tickedSet = new Set(ticked);
  return {
    ticks: orderIds.filter((id) => tickedSet.has(id)),
    base: [...(tab?.headerIds || [])],
    section: { ...(section || {}), order: [...orderIds], hidden: [], base: [...allIds], picks: [...(tab?.headerIds || [])] },
  };
}
