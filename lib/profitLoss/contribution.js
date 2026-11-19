// "Contribution" headers — any header whose name contains "Contribution",
// outside the General category (General headers keep their own values)
// (Revenue Contribution, Profit Contribution %, Contribution of Orders…)
// always shows each row's share of the table's Total:
//
//     (current_value * 100) / Total row value
//
// worked out where the Total row is — on the dashboard tables (DetailsTable /
// OverviewTreeTable), over the table's rows. `current_value` is:
//   - a Formula header with a formula of its own → its formula's result on
//     that row (so the column shows that result as a share of its Total);
//   - else the header its name points at, with "Contribution" taken out
//     ("Revenue Contribution %" → Revenue), when the template has one;
//   - else its own value.
// The Total row value is that header's Total as the tab works it out (its
// Total rule, else Auto — tableTotals.js). The Contribution column's own
// Total is the sum of the shares shown (100 with nothing filtered out).
// Pure — node-testable.

import { tableTotals } from './tableTotals';
import { fmtHeaderCell } from './fmt';
import { GENERAL_GROUP_ID } from './headerGroups';

const WORD = /contribution/i;
const nameKey = (s) => String(s ?? '').trim().toLowerCase();
const round2 = (n) => Math.round(n * 100) / 100;

// In General = no group, or the built-in General one (withHeaderGroups puts
// a deleted group's headers back there).
const inGeneral = (h) => !h.groupId || h.groupId === GENERAL_GROUP_ID;
const hasOwnFormula = (h) => h.type === 'formula' && String(h.formula || '').trim() !== '';
export const isContributionHeader = (h) => !!h && !inGeneral(h) && WORD.test(String(h.name || ''));

// The header a Contribution header's share is of (see above).
export function contributionBase(h, headers = []) {
  if (hasOwnFormula(h)) return h;
  const base = String(h.name || '')
    .replace(/contributions?/gi, ' ')
    .replace(/[%()[\]{}]/g, ' ')
    .replace(/\b(of|in|share|by)\b/gi, ' ')
    .replace(/[-_:/|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base) return h;
  return headers.find((x) => x.id !== h.id && nameKey(x.name) === nameKey(base)) || h;
}

const numberOf = (cell) => {
  const raw = cell?.raw;
  if (raw === '' || raw == null || typeof raw === 'boolean') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
};

const pctHeader = (h) => ({ ...h, type: 'number', format: 'pct' });

// The Contribution columns among `columns`, each with its base and the base's
// Total over `topRows` (the rows the Total row adds up). [] when there are
// none — the callers then leave the rows untouched.
export function contributionPlan(headers = [], columns = [], topRows = [], rules = null) {
  const all = headers.length ? headers : columns;
  const plan = [];
  for (const h of columns) {
    if (!isContributionHeader(h)) continue;
    const base = contributionBase(h, all);
    let total;
    if (base.id === h.id) {
      // Its own values — added up as they are (its own Total is the shares).
      total = topRows.reduce((s, r) => s + (numberOf(r.cells?.[h.id]) ?? 0), 0);
    } else {
      total = numberOf(tableTotals(all, topRows, [base.id], rules)[base.id]);
    }
    plan.push({ id: h.id, header: h, baseId: base.id, total: Number.isFinite(total) ? total : null });
  }
  return plan;
}

// One row's cells with every Contribution column worked out: a new row (and
// cells) only when something changed.
function applyRow(row, plan) {
  let cells = null;
  for (const { id, header, baseId, total } of plan) {
    const v = numberOf(row.cells?.[baseId]);
    const raw = v == null || !total ? '' : round2((v * 100) / total);
    const cell = { ...(row.cells?.[id] || {}), raw, display: raw === '' ? '' : fmtHeaderCell(pctHeader(header), raw) };
    if (!cells) cells = { ...(row.cells || {}) };
    cells[id] = cell;
  }
  return cells ? { ...row, cells } : row;
}

// DetailsTable: every row's Contribution cells, as shares of the Total over
// all of `rows`.
export function withContributions(headers, columns, rows, rules = null) {
  const plan = contributionPlan(headers, columns, rows, rules);
  if (!plan.length) return rows;
  return rows.map((r) => applyRow(r, plan));
}

// OverviewTreeTable: every node at every level, as shares of the Total over
// the top level (each node already adds up its children).
export function withContributionsTree(headers, columns, tree, rules = null) {
  const plan = contributionPlan(headers, columns, tree, rules);
  if (!plan.length) return tree;
  const walk = (list) => list.map((n) => {
    let next = applyRow(n, plan);
    // A merged node's unique rows, as shares of the same Total.
    if (n.unique?.length) next = { ...next, unique: n.unique.map((u) => applyRow(u, plan)) };
    return n.children?.length ? { ...next, children: walk(n.children) } : next;
  });
  return walk(tree);
}
