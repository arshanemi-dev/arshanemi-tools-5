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

// ▶ Overview left padding: how many px each deeper level steps in from its
// parent — in the right tree table (row + colour bar) and the left
// hierarchy list alike. Change this one number to indent more or less.
export const OVERVIEW_LEVEL_INDENT_PX = 28;
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

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
// One cell against another for a column sort, `dir` 1 (A→Z, low→high) or -1.
// Numbers by value; text naturally ("SKU 2" before "SKU 10"), case-blind;
// blanks always last, whichever way.
const isBlank = (v) => v == null || v === '' || v === '—' || v === BLANK_VALUE;
// Clothing sizes sort by size, not alphabet: XS, S, M, L, XL, XXL…
const SIZE_ORDER = ['XXXS', '3XS', 'XXS', '2XS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL', 'XXXXL', '5XL', '6XL', 'FREE SIZE', 'FREESIZE', 'FREE'];
const SIZE_RANK = new Map(SIZE_ORDER.map((s, i) => [s, i]));
const sizeRank = (v) => SIZE_RANK.get(String(v).trim().toUpperCase().replace(/\s+/g, ' '));
export function compareCellValues(av, bv, dir = 1) {
  const ab = isBlank(av);
  const bb = isBlank(bv);
  if (ab || bb) return ab === bb ? 0 : ab ? 1 : -1;
  if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
  const ar = sizeRank(av);
  const br = sizeRank(bv);
  if (ar != null && br != null) return (ar - br) * dir;
  return collator.compare(String(av), String(bv)) * dir;
}

// Every dashboard table opens sorted by its FIRST column, A→Z — until the
// user picks another sort.
export const firstColumnSort = (key) => (key ? { key, dir: 'asc' } : null);

// A sort that goes column by column, like a spreadsheet's multi-level sort:
// the sorted column first (its own direction), and rows it leaves tied are
// ordered by the next column, then the next… every column in table order,
// A→Z. → a `(a, b) => number` comparator. `valueOf(item, key)` reads a cell.
export function hierarchyComparator(sort, keys, valueOf) {
  const order = sort?.key
    ? [[sort.key, sort.dir === 'desc' ? -1 : 1], ...keys.filter((k) => k !== sort.key).map((k) => [k, 1])]
    : keys.map((k) => [k, 1]);
  return (a, b) => {
    for (const [k, dir] of order) {
      const c = compareCellValues(valueOf(a, k), valueOf(b, k), dir);
      if (c) return c;
    }
    return 0;
  };
}

function compareValues(a, b) {
  if (a === BLANK_VALUE) return b === BLANK_VALUE ? 0 : 1;
  if (b === BLANK_VALUE) return -1;
  return collator.compare(a, b);
}

// `cellsFor(groupRows)` → { cells, company } for the non-level (aggregated)
// headers. Level headers are then filled in by path — a node's own and its
// ancestors' values, blank for deeper levels — so a flattened tree reads as
// a pivot with subtotal rows when exported.
//
// The LAST level never hides two different items in one row:
// `splitRows(rows, path)` (optional) → [{ id, label, rows }], one per unique
// item (resolveTemplate — Account Name + SKU + Size, + Transaction / Order Id
// only when the overview shows that column — rowIdentity.js). A hierarchy
// field that IS a level is a dropdown; one that isn't simply splits the last
// level into plain rows, like a normal tab's table: SKU1 in 2 accounts with
// 4 sizes, Level = SKU → 2 × 4 = 8 rows (each showing "SKU1 · <size>").
// Lines of one and the same item still add up into its one row.
//
// A uniqueness field that is NOT a level still splits rows — at the level it
// belongs to: `splitsAt[depth]` (optional) = [{ of(row) → { id, label },
// show }] — the extra fields that level's nodes are told apart by
// (resolveTemplate overviewSplits). E.g. levels SKU → Order Id → Transaction
// Id with Size not a level: one SKU dropdown PER SIZE, each opening onto
// only that size's orders. Accounts (never merged) split Level 1 the same
// way. `show` = the node's label also names it ("SKU1 · M") — for a field
// whose own column isn't shown; otherwise it only goes into the key.
// `field` ('account' / 'sku' / 'size') = the name its value is kept under
// in each node's `fields` (and its descendants') — what the SKU price boxes
// read a node's size from when Size isn't a level.
const ITEM_SEP = '\u0001';
export function buildOverviewTree({ levels, rows, readValue, cellsFor, splitRows = null, splitsAt = [] }) {
  if (!levels?.length) return [];
  const nodeOf = ({ header, depth, path, key, value, nodeRows, fields = {}, item = false, children = [] }) => {
    const { cells, company, txns, noTxn } = cellsFor(nodeRows);
    levels.forEach((lh, i) => {
      const v = i <= depth ? path[i] : '';
      cells[lh.id] = { raw: v, display: v };
    });
    return {
      key,
      value,
      path,
      depth,
      fields, // the split fields' values on this node and above, e.g. { size: 'M' }
      headerId: header.id,
      rowCount: nodeRows.length,
      company,
      cells,
      ...(item ? { item: true } : {}),
      ...(txns ? { txns } : {}), // the node's orders, when a Review column is shown
      ...(noTxn ? { noTxn: true } : {}), // none of its rows has a Transaction Id — its Order Id shows red
      children,
    };
  };
  // `path` = the level values (what the level columns show); `keyPath` =
  // what keys are built from (an entry also carries the split fields'
  // ids), so two same-valued nodes never share a key. ancestorKeys /
  // indexPathOf read keys back the same way.
  const comparePart = (a, b) => compareCellValues(a.label || BLANK_VALUE, b.label || BLANK_VALUE) || collator.compare(a.id, b.id);
  const build = (groupRows, depth, parentPath, parentKeyPath, parentFields = {}) => {
    const header = levels[depth];
    const leaf = depth + 1 >= levels.length;
    const splitters = splitsAt[depth] || [];
    const groups = new Map(); // group id → { value, parts, rows }
    for (const r of groupRows) {
      const value = levelValue(readValue(header, r));
      const parts = splitters.map((s) => s.of(r));
      const id = [value, ...parts.map((p) => p.id)].join(ITEM_SEP);
      if (!groups.has(id)) groups.set(id, { value, parts, rows: [] });
      groups.get(id).rows.push(r);
    }
    return [...groups.values()]
      .sort((a, b) => compareValues(a.value, b.value) || a.parts.reduce((c, p, i) => c || comparePart(p, b.parts[i]), 0))
      .flatMap(({ value, parts, rows: nodeRows }) => {
        const path = [...parentPath, value];
        const keyPath = [...parentKeyPath, [value, ...parts.map((p) => p.id)].join(ITEM_SEP)];
        const named = parts.filter((p, i) => splitters[i].show && p.label).map((p) => p.label);
        const shown = named.length ? `${value} · ${named.join(' · ')}` : value;
        const fields = { ...parentFields };
        parts.forEach((p, i) => { if (splitters[i].field) fields[splitters[i].field] = p.label; });
        if (!leaf) {
          return [nodeOf({ header, depth, path, key: pathKey(keyPath), value: shown, nodeRows, fields, children: build(nodeRows, depth + 1, path, keyPath, fields) })];
        }
        const items = splitRows ? splitRows(nodeRows, path) : null;
        // Several unique items under one last-level value: each is its own
        // plain row at this level (no subtotal dropdown) — the level's value
        // plus what tells it apart (e.g. "SKU1 · M").
        if (items && items.length > 1) {
          const lastKey = keyPath[keyPath.length - 1];
          return items.map((it) => nodeOf({
            header, depth, path, nodeRows: it.rows, fields, item: true,
            value: it.label && it.label !== value ? `${shown} · ${it.label}` : shown,
            key: pathKey([...parentKeyPath, `${lastKey}${ITEM_SEP}${it.id}`]),
          }));
        }
        return [nodeOf({ header, depth, path, key: pathKey(keyPath), value: shown, nodeRows, fields })];
      });
  };
  return build(rows, 0, [], []);
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
// `keys` = every column in table order (the hierarchy first): ties on the
// sorted column fall to the next one, and so on (hierarchyComparator).
export function sortTree(nodes, sort, keys = []) {
  if (!sort?.key) return nodes;
  const valueOf = (n, key) => (key === TREE_COL ? n.value : n.cells[key]?.raw);
  const cmp = hierarchyComparator(sort, keys.length ? keys : [sort.key], valueOf);
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
