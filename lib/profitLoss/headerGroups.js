// Template Settings › Header: every Global Settings header has
//   - a group (the "Our Groups" row) — the built-in General, where every
//     header starts, or one the admin made. Groups only sort the headers.
//   - an `isHidden` flag (the Show / Hide switch on its row), default
//     false. A hidden header is never a dashboard column, My Details pick
//     or export column — it is still worked out, formulas can read it.
// Both are part of the Global Settings VERSION, like everything Template
// Settings edits: the version's `headerGroups` ([{ id, name, kind:
// 'general' | 'custom', position }]) and, on each header, `groupId` (left off
// = General) and `isHidden: true` (left off = shown). Save New Version keeps
// them; switching a version Live brings back that version's. The readers
// below take them as `headerGroups` = { groups, members: { [headerId]:
// groupId }, hiddenHeaderIds: [headerId, …] } — headerGroupsOf(config)
// makes that from a version; a version saved before groups were versioned
// has none (null = nothing hidden, no groups).

export const GENERAL_GROUP_ID = 'grp_general';
export const GENERAL_GROUP = { id: GENERAL_GROUP_ID, name: 'General', kind: 'general', position: 0 };

// A version's groups + flags in the readers' shape — null when it has none.
export function headerGroupsOf(config) {
  if (!Array.isArray(config?.headerGroups)) return null;
  const headers = config.headers || [];
  return {
    groups: config.headerGroups,
    members: Object.fromEntries(headers.filter((h) => h.groupId).map((h) => [h.id, h.groupId])),
    hiddenHeaderIds: headers.filter((h) => h.isHidden).map((h) => h.id),
  };
}

// ── editing a version's groups + flags (Template Settings) — all pure ───────

// One header with `groupId` / `isHidden` set the way they're kept: the key
// left off for General / shown.
function headerWith(h, { groupId, isHidden }) {
  const next = { ...h };
  if (groupId !== undefined) { if (groupId && groupId !== GENERAL_GROUP_ID) next.groupId = groupId; else delete next.groupId; }
  if (isHidden !== undefined) { if (isHidden) next.isHidden = true; else delete next.isHidden; }
  return next;
}
const patchHeaders = (config, ids, patch) => {
  const set = new Set(ids);
  return { ...config, headers: (config.headers || []).map((h) => (set.has(h.id) ? headerWith(h, patch) : h)) };
};

export const withHeadersInGroup = (config, headerIds, groupId) => patchHeaders(config, headerIds, { groupId });
export const withHeadersHidden = (config, headerIds, isHidden) => patchHeaders(config, headerIds, { isHidden });

export function withGroupAdded(config, group) {
  const groups = config.headerGroups || [GENERAL_GROUP];
  const position = groups.reduce((m, g) => Math.max(m, g.position ?? 0), 0) + 1;
  return { ...config, headerGroups: [...groups, { kind: 'custom', ...group, position }] };
}
export const withGroupRenamed = (config, id, name) => ({
  ...config, headerGroups: (config.headerGroups || []).map((g) => (g.id === id && g.kind !== 'general' ? { ...g, name } : g)),
});
// Its headers go back to General (their Hidden flags stay).
export function withGroupRemoved(config, id) {
  const ids = (config.headers || []).filter((h) => h.groupId === id).map((h) => h.id);
  return { ...withHeadersInGroup(config, ids, GENERAL_GROUP_ID), headerGroups: (config.headerGroups || []).filter((g) => g.id !== id || g.kind === 'general') };
}

// A version as the editor opens it: with its own groups (General always
// among them), or — one saved before groups were versioned — the groups
// and flags set before then (`legacy` = the hub's header group tables, in
// the readers' shape) put onto its headers, else just General. Returns
// `config` itself when it already has them.
export function withVersionGroups(config, legacy = null) {
  if (Array.isArray(config.headerGroups)) {
    return config.headerGroups.some((g) => g.kind === 'general') ? config : { ...config, headerGroups: [GENERAL_GROUP, ...config.headerGroups] };
  }
  const known = (legacy?.groups || []).filter((g) => g?.id && g.kind !== 'general');
  const headerGroups = [GENERAL_GROUP, ...known.map((g) => ({ id: g.id, name: g.name, kind: 'custom', position: g.position ?? 0 }))];
  const groupIds = new Set(headerGroups.map((g) => g.id));
  const hidden = new Set(legacy?.hiddenHeaderIds || []);
  return {
    ...config,
    headerGroups,
    headers: (config.headers || []).map((h) => {
      const g = legacy?.members?.[h.id];
      return headerWith(h, { groupId: groupIds.has(g) ? g : GENERAL_GROUP_ID, isHidden: hidden.has(h.id) });
    }),
  };
}

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
