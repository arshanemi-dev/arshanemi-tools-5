// Per-user dashboard personalization ("show/hide + reorder" on top of
// whatever the active marketplace template defines) — one `section` shape
// reused for sidebar tabs, sidebar overview tabs, and a tab's title cards /
// graphs / table columns: { order: [id,...], hidden: [id,...] }.
//
// Stored in the same /api/profit-loss/settings row as "My Details"
// (preferences.layout), only written when the user hits Save in the
// sidebar's Settings -> Save toggle (see useDashboardSettings.js) — never
// auto-saved per click.

export function emptySection() {
  return { order: [], hidden: [] };
}

// Filters out hidden ids and sorts the rest per `section.order`. An id not
// yet in `order` (a tab/card/graph/header the user hasn't touched, including
// one added by the admin after the user's last save) keeps its original
// relative position, appended after every explicitly-ordered id.
export function applyLayout(items, section) {
  if (!section || (!section.order?.length && !section.hidden?.length)) return items;
  const hidden = new Set(section.hidden || []);
  const visible = items.filter((it) => !hidden.has(it.id));
  const orderIndex = new Map((section.order || []).map((id, i) => [id, i]));
  return visible
    .map((it, i) => ({ it, key: orderIndex.has(it.id) ? orderIndex.get(it.id) : 1e9 + i }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.it);
}

export function toggleHidden(section, id) {
  const hidden = section.hidden.includes(id)
    ? section.hidden.filter((x) => x !== id)
    : [...section.hidden, id];
  return { ...section, hidden };
}

// Swaps `id` with its neighbour in the given direction (-1 up, +1 down),
// within the full `allIds` order — seeding `section.order` from `allIds` the
// first time so relative position is well defined even before the user has
// reordered anything.
export function moveItem(section, allIds, id, dir) {
  const order = section.order?.length ? [...section.order] : [...allIds];
  for (const aid of allIds) if (!order.includes(aid)) order.push(aid);
  const i = order.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return section;
  [order[i], order[j]] = [order[j], order[i]];
  return { ...section, order };
}

// The inline ArrangeControl's core action: pick any other item (visible or
// hidden) from this item's own dropdown and the two trade places — same
// position swap either way, but when their shown/hidden status differs, that
// status trades too. So swapping with a currently-visible item just
// reorders (both stay visible); swapping with a currently-hidden one hides
// `idA` (bumped out of its spot) and reveals `idB` in its place — one
// action covers both "reorder" and "replace this slot with a hidden item".
export function swapItems(section, allIds, idA, idB) {
  const order = section.order?.length ? [...section.order] : [...allIds];
  for (const aid of allIds) if (!order.includes(aid)) order.push(aid);
  const ia = order.indexOf(idA);
  const ib = order.indexOf(idB);
  if (ia < 0 || ib < 0) return section;
  [order[ia], order[ib]] = [order[ib], order[ia]];

  let hidden = section.hidden;
  const aHidden = hidden.includes(idA);
  const bHidden = hidden.includes(idB);
  if (aHidden !== bHidden) {
    hidden = hidden.filter((id) => id !== idA && id !== idB);
    hidden = [...hidden, aHidden ? idB : idA];
  }

  return { ...section, order, hidden };
}
