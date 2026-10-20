// Template Settings › Header: every Global Settings header has
//   - a group (the "Our Groups" row) — the built-in General, where every
//     header starts, or one the admin made. Groups only sort the headers.
//   - an `isHidden` flag (the Show / Hide switch on its row), default
//     false. A hidden header is never a dashboard column, My Details pick
//     or export column — it is still worked out, formulas can read it.
// Both live on the hub (profit_loss_header_groups / _members — the hub's
// lib/db.js), not in a Global Settings version, so a change shows on the
// dashboard at once. The dashboard gets them with the live templates
// (`headerGroups` = { groups: [{ id, name, kind, position }],
// members: { [headerId]: groupId }, hiddenHeaderIds: [headerId, …] }, or
// null = not set up yet: nothing hidden).

export const GENERAL_GROUP_ID = 'grp_general';

const groupsOf = (headerGroups) => (Array.isArray(headerGroups?.groups) ? headerGroups.groups : []);

// The group `headerId` is in — General when it has none, or its group is gone.
export function groupIdOf(headerGroups, headerId) {
  const id = headerGroups?.members?.[headerId];
  return id && groupsOf(headerGroups).some((g) => g.id === id) ? id : GENERAL_GROUP_ID;
}

// The headers switched to Hidden.
export function hiddenHeaderIds(headerGroups) {
  return new Set(Array.isArray(headerGroups?.hiddenHeaderIds) ? headerGroups.hiddenHeaderIds : []);
}

// `config` as the dashboard renders it: every header with its `isHidden`
// flag (what the column helpers — tabColumns.js — and the Transactions table
// skip) and, when there are groups, its `groupId`; the groups themselves, in
// order, as `config.headerGroups` (what My Details groups its list by).
// Used by effectiveConfig.js and Template Settings' preview. Pure.
export function withHeaderGroups(config, headerGroups) {
  const hidden = hiddenHeaderIds(headerGroups);
  return {
    ...config,
    headers: (config?.headers || []).map((h) => ({
      ...h,
      isHidden: hidden.has(h.id),
      ...(headerGroups ? { groupId: groupIdOf(headerGroups, h.id) } : {}),
    })),
    ...(headerGroups ? { headerGroups: [...groupsOf(headerGroups)].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) } : {}),
  };
}

export const isShown = (h) => !!h && !h.isHidden;

// How many of `headers` are in each group → { [groupId]: n }.
export function groupCounts(headerGroups, headers) {
  const out = Object.fromEntries(groupsOf(headerGroups).map((g) => [g.id, 0]));
  for (const h of headers || []) {
    const g = groupIdOf(headerGroups, h.id);
    out[g] = (out[g] || 0) + 1;
  }
  return out;
}
