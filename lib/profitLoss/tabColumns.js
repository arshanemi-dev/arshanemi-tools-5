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
//    global order — so "All Details" lists all of them on every tab, and "My
//    Details" can pick from all of them. A tab with none picked keys on the
//    marketplace's group-by header (the rows are grouped by it), else the
//    SKU header, else the first header.
export function tabColumnDefs(tab, headers = [], { allHeaders = false, groupByHeaderId = null } = {}) {
  const byId = new Map(headers.map((h) => [h.id, h]));
  const picked = (tab?.headerIds || []).map((id) => byId.get(id)).filter(Boolean);
  if (!allHeaders) return { key: picked[0] || null, rest: picked.slice(1) };

  const key = picked[0] || byId.get(groupByHeaderId) || headers.find((h) => h.primitive === 'sku') || headers[0] || null;
  const taken = new Set(picked.map((h) => h.id));
  if (key) taken.add(key.id);
  return { key, rest: [...picked.slice(1), ...headers.filter((h) => !taken.has(h.id))] };
}
