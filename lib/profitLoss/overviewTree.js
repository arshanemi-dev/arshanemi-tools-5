// An Overview tab's "unique value hierarchy" — Level 1 → Level 2 → … Level N,
// each level one header whose distinct values become a node (e.g. Brand →
// Category → Sku Name). Shared by resolveTemplate (builds the tree), the
// dashboard's OverviewTab (left hierarchy nav + right tree table, which share
// one expanded-set) and DashboardWorkspace (delete + export). Pure, no React.
//
// A node: { key, value, path, depth, headerId, rowCount, company, cells,
// children }. `key` is the JSON of its full path — unique across the whole
// tree even when two branches share a value ("Shirts" under two brands).

export const BLANK_VALUE = '(Blank)';
export const MAX_OVERVIEW_LEVELS = 6;

// Overview tabs saved before hierarchies existed only carry a single
// `fixedHeaderId` — that's just a 1-level hierarchy.
export function overviewLevelIds(ov) {
  const ids = Array.isArray(ov?.hierarchyHeaderIds) ? ov.hierarchyHeaderIds.filter(Boolean) : [];
  if (ids.length) return [...new Set(ids)];
  return ov?.fixedHeaderId ? [ov.fixedHeaderId] : [];
}

// A row missing a level's value still counts toward its parent — it lands in
// a "(Blank)" node instead of being dropped, so every parent's totals always
// reconcile with the sum of its children.
export function levelValue(raw) {
  const s = raw == null ? '' : String(raw).trim();
  return s || BLANK_VALUE;
}

export function pathKey(values) {
  return JSON.stringify(values);
}

export function pathOf(key) {
  try {
    const v = JSON.parse(key);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// Keys of every strict ancestor of `key`, root first.
export function ancestorKeys(key) {
  const path = pathOf(key);
  return path.slice(0, -1).map((_, i) => pathKey(path.slice(0, i + 1)));
}

// Every prefix key of one raw row's path. A raw row belongs to each of its
// ancestor nodes, so selecting any of them (for delete) matches it.
export function rowPathKeys(levels, row, readValue) {
  const path = [];
  return levels.map((h) => {
    path.push(levelValue(readValue(h, row)));
    return pathKey(path);
  });
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
function compareValues(a, b) {
  if (a === BLANK_VALUE) return b === BLANK_VALUE ? 0 : 1;
  if (b === BLANK_VALUE) return -1;
  return collator.compare(a, b);
}

// `cellsFor(groupRows)` → { cells, company } for the non-level (aggregated)
// headers. Level headers are then filled in by path — a node's own and its
// ancestors' values, blank for deeper levels — so a flattened tree reads as
// a pivot with subtotal rows when exported.
export function buildOverviewTree({ levels, rows, readValue, cellsFor }) {
  if (!levels?.length) return [];
  const build = (groupRows, depth, parentPath) => {
    const header = levels[depth];
    const groups = new Map();
    for (const r of groupRows) {
      const v = levelValue(readValue(header, r));
      if (!groups.has(v)) groups.set(v, []);
      groups.get(v).push(r);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => compareValues(a, b))
      .map(([value, nodeRows]) => {
        const path = [...parentPath, value];
        const { cells, company } = cellsFor(nodeRows);
        levels.forEach((lh, i) => {
          const v = i <= depth ? path[i] : '';
          cells[lh.id] = { raw: v, display: v };
        });
        return {
          key: pathKey(path),
          value,
          path,
          depth,
          headerId: header.id,
          rowCount: nodeRows.length,
          company,
          cells,
          children: depth + 1 < levels.length ? build(nodeRows, depth + 1, path) : [],
        };
      });
  };
  return build(rows, 0, []);
}

// Depth-first, parents before their children — the export / pivot order.
export function flattenTree(nodes, out = []) {
  for (const n of nodes || []) {
    out.push(n);
    flattenTree(n.children, out);
  }
  return out;
}

// Every parent key shallower than `depth` (0-based) — opening exactly these
// makes levels 1…depth+1 visible. depth 0 → nothing open.
export function keysToDepth(nodes, depth) {
  const out = [];
  const walk = (list) => {
    for (const n of list || []) {
      if (n.depth >= depth || !n.children?.length) continue;
      out.push(n.key);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

// Siblings sorted within every level. `sort` = { key, dir } where key is a
// header id, or TREE_COL to sort on the node's own value.
export const TREE_COL = '__tree__';
export function sortTree(nodes, sort) {
  if (!sort?.key) return nodes;
  const dir = sort.dir === 'asc' ? 1 : -1;
  const valueOf = (n) => (sort.key === TREE_COL ? n.value : n.cells[sort.key]?.raw);
  const cmp = (a, b) => {
    const av = valueOf(a);
    const bv = valueOf(b);
    if (typeof av === 'string' || typeof bv === 'string') return compareValues(String(av ?? ''), String(bv ?? '')) * dir;
    return ((Number(av) || 0) - (Number(bv) || 0)) * dir;
  };
  const walk = (list) => [...list].sort(cmp).map((n) => (n.children?.length ? { ...n, children: walk(n.children) } : n));
  return walk(nodes);
}

// Keeps a node when it matches or has a matching descendant. A match keeps
// all its children when none of them match on their own (so it can still be
// drilled into); otherwise only the matching branches survive. Surviving
// ancestors of a deeper match carry `openedByMatch` so the UI can show the
// path to it already expanded.
export function filterTree(nodes, pred) {
  const walk = (list) => {
    const out = [];
    for (const n of list || []) {
      const self = pred(n);
      const kids = n.children?.length ? walk(n.children) : [];
      if (kids.length) out.push({ ...n, children: kids, openedByMatch: true });
      else if (self) out.push({ ...n, openedByMatch: false });
    }
    return out;
  };
  return walk(nodes);
}

// Where `key` sits: each ancestor's index among its siblings (root first,
// the node itself last), or null when it isn't in `nodes`.
export function indexPathOf(nodes, key) {
  const path = pathOf(key);
  const out = [];
  let list = nodes;
  for (let d = 0; d < path.length; d += 1) {
    const k = pathKey(path.slice(0, d + 1));
    const i = (list || []).findIndex((n) => n.key === k);
    if (i < 0) return null;
    out.push(i);
    list = list[i].children;
  }
  return out;
}
