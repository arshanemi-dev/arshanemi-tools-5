import { overviewLevelIds } from './overviewTree';

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

// What "My Details" offers on the dashboard, worked out here in the browser:
// every header some Tab or Overview Tab of the template picks (its
// headerIds — an Overview's own hierarchy levels aside), each once — the
// Tabs in their order, then the Overview Tabs, each tab's picks in its own
// order. Not every header the version defines: one no tab uses never shows.
export function tabsHeaderPool(config) {
  const ids = [];
  const seen = new Set();
  const add = (id) => { if (id && !seen.has(id)) { seen.add(id); ids.push(id); } };
  for (const tab of [...(config?.tabs || [])].sort(byOrder)) (tab.headerIds || []).forEach(add);
  for (const ov of [...(config?.overviewTabs || [])].sort(byOrder)) {
    const levels = new Set(overviewLevelIds(ov));
    (ov.headerIds || []).filter((id) => !levels.has(id)).forEach(add);
  }
  return ids;
}

// `pool` (tabsHeaderPool) → those headers' defs, in pool order; none given →
// every header, in global order.
const fromPool = (headers, byId, pool) => (pool ? pool.map((id) => byId.get(id)).filter(Boolean) : headers);

// The header defs a regular Tab's details table can show, split into the
// sticky row-key column (`key`) and everything after it (`rest`). Shared by
// TabView (what's on screen) and DashboardWorkspace's export (what gets
// downloaded) so the two can't drift.
//
//  - allHeaders = false (Template Settings' live preview): only the headers
//    picked for this tab, in the tab's order — a tab with none picked has no
//    table.
//  - allHeaders = true (the /profit-loss dashboard): the tab's own picks
//    first, then the other headers of `pool` (tabsHeaderPool — the headers
//    the template's tabs pick, merged; every header of the version when no
//    pool is given) — so "My Details" can pick from all of them on every
//    tab, while the tab's own picks are the ones ticked by default (see
//    myDetailColumns). A tab with none picked keys on the marketplace's
//    group-by header (the rows are grouped by it), else the SKU header, else
//    the first header.
export function tabColumnDefs(tab, headers = [], { allHeaders = false, groupByHeaderId = null, pool = null } = {}) {
  const byId = new Map(headers.map((h) => [h.id, h]));
  const picked = (tab?.headerIds || []).map((id) => byId.get(id)).filter(Boolean);
  if (!allHeaders) return { key: picked[0] || null, rest: picked.slice(1) };

  const key = picked[0] || byId.get(groupByHeaderId) || headers.find((h) => h.primitive === 'sku') || headers[0] || null;
  const taken = new Set(picked.map((h) => h.id));
  if (key) taken.add(key.id);
  return { key, rest: [...picked.slice(1), ...fromPool(headers, byId, pool).filter((h) => !taken.has(h.id))] };
}

// Which of `rest` (everything after the key column) "My Details" shows, in
// table order — the first of these that names at least one column of this
// table:
//  1. `picks` — the user's own ticks for this tab (header ids);
//  2. `defaultIds` — the tab's default: the headers the template picked for
//     it (tab.headerIds — Template Settings → Tab → Headers). What a
//     never-saved / signed-out user sees, and what Reset Position goes back
//     to;
//  3. every column — a tab with no headers of its own picked.
// So the table never collapses to just its key column, and ids left over
// from headers the template has since dropped can't blank it either.
// `fallback` replaces step 3 — an Overview tab passes [] (see below).
export function myDetailColumns(rest = [], picks = [], defaultIds = [], fallback = rest) {
  for (const ids of [picks, defaultIds]) {
    const shown = rest.filter((h) => (ids || []).includes(h.id));
    if (shown.length) return shown;
  }
  return fallback;
}

// An Overview tab's counterpart to tabColumnDefs. Its hierarchy levels are
// the pinned first column, so `rest` is every OTHER header — the overview's
// own picks first (in its order), then the rest of `pool` (tabsHeaderPool;
// every header of the version when none is given) — for "My Details" to
// pick from; `defaultIds` = its own picks.
export function overviewColumnDefs(ov, headers = [], pool = null) {
  const levelIds = new Set(overviewLevelIds(ov));
  const byId = new Map(headers.map((h) => [h.id, h]));
  const picked = (ov?.headerIds || []).filter((id) => !levelIds.has(id)).map((id) => byId.get(id)).filter(Boolean);
  const taken = new Set(picked.map((h) => h.id));
  return {
    rest: [...picked, ...fromPool(headers, byId, pool).filter((h) => !levelIds.has(h.id) && !taken.has(h.id))],
    defaultIds: picked.map((h) => h.id),
  };
}

// The headers an Overview tab shows on the dashboard: its My Details ticks
// (`picks`), else its own picks — never "every column": an overview with no
// headers of its own stays just its hierarchy. resolveTemplate computes an
// overview's nodes for exactly these (its `overviewHeaderIds` option), which
// is why this is decided up in DashboardWorkspace and not in the table.
export function overviewShownHeaders(ov, headers = [], picks = [], pool = null) {
  const { rest, defaultIds } = overviewColumnDefs(ov, headers, pool);
  return myDetailColumns(rest, picks, defaultIds, []);
}
