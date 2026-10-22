import { orderStands, withNewIds } from './layoutSections';
import { overviewColumnDefs, tabColumnDefs } from './tabColumns';
import { partItems } from './tabParts';

// A signed-in user's saved dashboard arrangement brought up to date with the
// version that is live now — and then saved back to their settings row
// (useDashboardSettings `reconcile`), so what is stored always matches what
// the version has:
//   - an item the version ADDED (a tab, overview tab, title card or graph on
//     a tab, a header column) joins the user's order where the version puts
//     it, shown; a header the version added to a tab's own headers is also
//     ticked in that tab's My Details;
//   - an item the version DELETED leaves the user's order, hidden list and
//     My Details ticks; a header taken off a tab's own headers leaves that
//     tab's ticks too — unless the user ticked it themselves (it wasn't one
//     of the tab's headers when they did);
//   - everything else stays as the user had it. A tab the version deleted
//     takes its whole arrangement + ticks with it.
// Re-positioning is the one thing the version still wins: an order made
// before the version moved those items around is dropped (layoutSections.js
// `orderStands`), the version's order shows, hidden items stay hidden.
// All pure; returns the very same objects when nothing changes.

// Same content — whatever order the keys were written in.
const canon = (v) => {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]));
  return v;
};
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

// One { order, hidden, base } section against the version's `listIds` (in
// its order). `knownIds` = every id that still exists — a header can be off
// this list (hidden, or the key column of another marketplace) without
// being deleted; for the rest the list is all there is. `moved` = ids the
// version moved for a reason that isn't re-positioning: a header added to
// or taken off a tab's own headers jumps between the two parts of the
// column list (the tab's headers first, then all the others) — it is put
// where the version puts it, and the rest of the user's order still stands.
export function reconcileSection(section, listIds, knownIds = listIds, moved = null) {
  if (!section || typeof section !== 'object') return section;
  const known = new Set(knownIds);
  const hidden = (section.hidden || []).filter((id) => known.has(id));
  const strict = orderStands(section, listIds);
  const jumped = !strict && moved?.length && Array.isArray(section.base) ? new Set(moved) : null;
  const stands = strict || (!!jumped && orderStands(
    { ...section, base: section.base.filter((id) => !jumped.has(id)) },
    listIds.filter((id) => !jumped.has(id)),
  ));
  const { base: oldBase, ...rest } = section;
  let next = { ...rest, order: [], hidden };
  if (stands) {
    const order = withNewIds(section.order.filter((id) => known.has(id) && !jumped?.has(id)), listIds);
    // A base only moves on when something was added or deleted — a
    // marketplace switch alone (another list) must not rewrite the row.
    next = { ...rest, order, hidden, base: same(order, section.order) ? oldBase : [...listIds] };
  }
  return same(next, section) ? section : next;
}

// The ids in exactly one of `a` / `b`.
const eitherNotBoth = (a, b) => {
  const A = new Set(a);
  const B = new Set(b);
  return [...a.filter((id) => !B.has(id)), ...b.filter((id) => !A.has(id))];
};

// One tab's My Details ticks (`ticks`, made against the tab's own headers
// `base`) against its own headers now (`defaults`). `knownIds` null = don't
// check which headers exist (the dashboard's read — it can't show a deleted
// one anyway).
export function reconcileTicks(ticks, base, defaults = [], knownIds = null) {
  const known = knownIds ? new Set(knownIds) : null;
  let next = (ticks || []).filter((id) => !known || known.has(id));
  if (Array.isArray(base)) {
    const was = new Set(base);
    const now = new Set(defaults);
    next = next.filter((id) => !(was.has(id) && !now.has(id)));
    for (const id of defaults) if (!was.has(id) && !next.includes(id)) next.push(id);
  }
  return { ticks: next, base: [...defaults] };
}

const byOrder = (list) => [...(list || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

// The whole saved arrangement — { layout, myDetails, myDetailsBase, headers
// (the older ticks shared by every tab) } — against `config`, the merged
// dashboard config (effectiveConfig) of the marketplace on screen, and
// `marketplaceIds` — every marketplace of the live version, in its order
// (the user's own order of them, layout.marketplaces; left alone without).
// → { ...the four, changed }.
export function reconcileLayout(saved, config, marketplaceIds = null) {
  const tabs = byOrder(config?.tabs);
  const overviews = byOrder(config?.overviewTabs);
  const headers = config?.headers || [];
  // A config with no tabs or no headers isn't a version anyone set up (the
  // hub answered with an empty one) — never "delete" the whole row against it.
  if (!headers.length || !(tabs.length + overviews.length)) return { ...saved, changed: false };
  const headerIds = headers.map((h) => h.id);
  const tabById = new Map([...tabs, ...overviews].map((t) => [t.id, t]));
  const isOverview = new Set(overviews.map((o) => o.id));

  const layout = saved.layout || {};
  const nextLayout = { ...layout };
  if (layout.tabs) nextLayout.tabs = reconcileSection(layout.tabs, tabs.map((t) => t.id));
  if (layout.overviewTabs) nextLayout.overviewTabs = reconcileSection(layout.overviewTabs, overviews.map((o) => o.id));
  // The tab strip as one list — Tabs then Overview Tabs (positionDraft.js).
  if (layout.strip) nextLayout.strip = reconcileSection(layout.strip, [...tabs, ...overviews].map((t) => t.id));
  if (layout.marketplaces && Array.isArray(marketplaceIds) && marketplaceIds.length) {
    nextLayout.marketplaces = reconcileSection(layout.marketplaces, marketplaceIds);
  }
  if (layout.perTab && typeof layout.perTab === 'object') {
    const perTab = {};
    for (const [tabId, sections] of Object.entries(layout.perTab)) {
      const tab = tabById.get(tabId);
      if (!tab || !sections || typeof sections !== 'object') continue; // the tab is gone
      // A tab's cards / graphs: its own, then every other (tabParts.js) —
      // one the version added to the tab or took off it moved between the
      // two parts (`picks` = the tab's own then, older rows: their base).
      const parts = { titleCards: partItems(tab, config, 'titleCards'), graphs: partItems(tab, config, 'graphs') };
      const columns = isOverview.has(tabId)
        ? overviewColumnDefs(tab, headers).rest
        : tabColumnDefs(tab, headers, { allHeaders: true, groupByHeaderId: config?.marketplace?.groupByHeaderId }).rest;
      const next = { ...sections };
      for (const kind of ['titleCards', 'graphs']) {
        const sec = sections[kind];
        if (!sec) continue;
        const ids = parts[kind].map((it) => it.id);
        const ownNow = parts[kind].filter((it) => it.own).map((it) => it.id);
        const ownThen = Array.isArray(sec.picks) ? sec.picks : sec.base;
        const r = reconcileSection(sec, ids, ids, Array.isArray(ownThen) ? eitherNotBoth(ownThen, ownNow) : null);
        const known = new Set(ids);
        const added = (r.added || []).filter((id) => known.has(id));
        const out = r === sec && added.length === (sec.added || []).length ? sec : { ...r, added, picks: ownNow };
        next[kind] = same(out, sec) ? sec : out;
      }
      if (sections.headers) {
        // The tab's own headers when the columns were arranged (`picks`,
        // saved with the arrangement), else when its ticks were — which of
        // them the version added / took off is what jumped (see above).
        const picksNow = tab.headerIds || [];
        const picksThen = Array.isArray(sections.headers.picks) ? sections.headers.picks : saved.myDetailsBase?.[tabId];
        const moved = Array.isArray(picksThen) ? eitherNotBoth(picksThen, picksNow) : null;
        const h = reconcileSection(sections.headers, columns.map((c) => c.id), headerIds, moved);
        next.headers = h !== sections.headers && h.order.length ? { ...h, picks: [...picksNow] } : h;
      }
      perTab[tabId] = Object.keys(next).every((k) => next[k] === sections[k]) ? sections : next;
    }
    nextLayout.perTab = perTab;
  }

  const myDetails = {};
  const myDetailsBase = {};
  for (const [tabId, ticks] of Object.entries(saved.myDetails || {})) {
    const tab = tabById.get(tabId);
    if (!tab || !Array.isArray(ticks)) continue;
    // A tab's own headers — what the dashboard passes as its My Details default.
    const r = reconcileTicks(ticks, saved.myDetailsBase?.[tabId], tab.headerIds || [], headerIds);
    myDetails[tabId] = r.ticks;
    myDetailsBase[tabId] = r.base;
  }
  const shared = (saved.headers || []).filter((id) => headerIds.includes(id));

  const out = {
    layout: same(nextLayout, layout) ? saved.layout : nextLayout,
    myDetails: same(myDetails, saved.myDetails || {}) ? saved.myDetails : myDetails,
    myDetailsBase: same(myDetailsBase, saved.myDetailsBase || {}) ? saved.myDetailsBase : myDetailsBase,
    headers: same(shared, saved.headers || []) ? saved.headers : shared,
  };
  out.changed = out.layout !== saved.layout || out.myDetails !== saved.myDetails
    || out.myDetailsBase !== saved.myDetailsBase || out.headers !== saved.headers;
  return out;
}
