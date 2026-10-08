// The header defs a regular Tab's details table can show, split into the
// sticky row-key column (`key`) and everything after it (`rest`). Shared by
// TabView (what's on screen) and DashboardWorkspace's export (what gets
// downloaded) so the two can't drift.
//
//  - allHeaders = false (Template Settings' live preview): only the headers
//    picked for this tab, in the tab's order — a tab with none picked has no
//    table.
//  - allHeaders = true (the /profit-loss dashboard): the tab's own picks
//    first, then every other header of the active (published) version in its
//    global order — so "My Details" can pick from all of them on every tab.
//    A tab with none picked keys on the marketplace's group-by header (the
//    rows are grouped by it), else the SKU header, else the first header.
export function tabColumnDefs(tab, headers = [], { allHeaders = false, groupByHeaderId = null } = {}) {
  const byId = new Map(headers.map((h) => [h.id, h]));
  const picked = (tab?.headerIds || []).map((id) => byId.get(id)).filter(Boolean);
  if (!allHeaders) return { key: picked[0] || null, rest: picked.slice(1) };

  const key = picked[0] || byId.get(groupByHeaderId) || headers.find((h) => h.primitive === 'sku') || headers[0] || null;
  const taken = new Set(picked.map((h) => h.id));
  if (key) taken.add(key.id);
  return { key, rest: [...picked.slice(1), ...headers.filter((h) => !taken.has(h.id))] };
}

// Which of `rest` (everything after the key column) "My Details" shows: the
// user's saved picks (`myColumns`, header ids), in table order. When none of
// them is a column of this table — a signed-out / never-saved user, or ids
// left over from headers the template has since dropped — every column
// shows, so the table never collapses to just its key column.
export function myDetailColumns(rest = [], myColumns = []) {
  const picked = rest.filter((h) => myColumns.includes(h.id));
  return picked.length ? picked : rest;
}
