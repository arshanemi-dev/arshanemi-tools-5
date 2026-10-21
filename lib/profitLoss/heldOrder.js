import { flattenTree } from './overviewTree';

// A table's rows kept where they are while costs are typed into it
// (components/dashboard/useHeldOrder.js). Typing a cost changes that SKU's
// numbers — its P&L, a column it's sorted on, whether a filter still keeps it
// — and the table used to re-sort / re-filter on every one, so the row being
// edited jumped away. A snapshot of what was on screen is taken at the first
// cost typed; until it's let go, the rows keep that order and that set (with
// their new values), the way a spreadsheet leaves a sorted / filtered range
// alone while it is edited. All pure.

// The same keys in any order give the same text — so a re-sort alone never
// reads as "different rows".
export const keySignature = (keys) => [...keys].sort().join('\u0000');

// ── a flat table (DetailsTable): rows = [{ key, … }] ────────────────────────

export const holdRows = (view) => view.map((r) => r.key);

// `keys` (holdRows) back into rows, each the fresh row of that key.
export function heldRows(rows, keys) {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return keys.map((k) => byKey.get(k)).filter(Boolean);
}

// ── a tree (OverviewTreeTable): nodes = [{ key, children, openedByMatch? }] ──

// Every node on screen, its place among its siblings, and which ones a filter
// had opened to show a match.
export function holdTree(view) {
  const index = new Map();
  const opened = new Set();
  const walk = (list) => (list || []).forEach((n, i) => {
    index.set(n.key, i);
    if (n.openedByMatch) opened.add(n.key);
    walk(n.children);
  });
  walk(view);
  return { index, opened };
}

// The fresh (unfiltered, unsorted) `tree` cut down to the held nodes, each
// level in the held order.
export function heldTree(tree, { index, opened }) {
  const walk = (list) => (list || [])
    .filter((n) => index.has(n.key))
    .sort((a, b) => index.get(a.key) - index.get(b.key))
    .map((n) => ({ ...n, children: n.children?.length ? walk(n.children) : n.children, openedByMatch: opened.has(n.key) }));
  return walk(tree);
}

// Do the two show the same rows in the same order? (a tree: every level)
export function sameOrder(a, b, tree = false) {
  const ka = (tree ? flattenTree(a) : a).map((n) => n.key);
  const kb = (tree ? flattenTree(b) : b).map((n) => n.key);
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
}
