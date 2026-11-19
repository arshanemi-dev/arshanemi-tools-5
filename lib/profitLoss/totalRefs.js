// TOTAL([Header]) in a Formula header (formula.js TOTAL_RE) — that header's
// value on the table's TOTAL row:
//
//     [Profit] / TOTAL([Profit]) * 100      each row's share of total Profit
//     [Revenue] - TOTAL([Revenue]) / [Rows]  …and so on
//
// The rows come from resolveTemplate, which can't know a table's Total row
// (it depends on the tab's Total rules and the rows the table holds), so
// there TOTAL([X]) stands in as the row's own X. Here — on the dashboard
// tables (DetailsTable / OverviewTreeTable), before the Contribution columns
// are worked out — every Formula header that uses TOTAL() is worked out
// again on each row with the real Total row values, and so is any Formula
// header that reads one of those (in header order, so a chain follows).
//
// The Total row value is the one the table's Total row shows for that
// header (tableTotals.js — its Total rule, else Auto), over all of the
// table's rows — the same rows a Contribution column's share is of.
//
// Worked out from the row's own cells, so a SUM / COUNT / … inside such a
// formula reads the row's own value of that column, not the raw sheet rows
// behind it: put the SUM / COUNT in a header of its own and TOTAL() that.
// A formula that reads one of these but has its own SUM / COUNT keeps the
// value resolveTemplate gave it, for the same reason.
// Pure — node-testable.

import { AGG_FN_RE, evaluateFormulaTyped, formulaRefs, hasTotalRef, totalRefNames } from './formula';
import { tableTotals } from './tableTotals';
import { fmtHeaderCell } from './fmt';

const nameKey = (s) => String(s ?? '').trim().toLowerCase();
const isFormula = (h) => h?.type === 'formula' && String(h.formula || '').trim() !== '';
const hasAggregate = (formula) => new RegExp(AGG_FN_RE.source, 'i').test(String(formula || ''));

// formula.js keeps its tokenizer per refNames array — the same one for the
// same headers.
const NAMES = new WeakMap();
function refNamesFor(headers) {
  if (!NAMES.has(headers)) NAMES.set(headers, headers.map((h) => h.name));
  return NAMES.get(headers);
}

// Which headers to work out again, in header order, and the ids of the
// headers whose Total row value they need. null when no formula uses TOTAL().
export function totalRefPlan(headers = []) {
  const byName = new Map(headers.map((h) => [nameKey(h.name), h]));
  const refNames = refNamesFor(headers);
  const redo = new Set();
  const needed = new Set();
  for (const h of headers) {
    if (!isFormula(h) || !hasTotalRef(h.formula)) continue;
    redo.add(h.id);
    for (const name of totalRefNames(h.formula)) {
      const dep = byName.get(nameKey(name));
      if (dep) needed.add(dep.id);
    }
  }
  if (!redo.size) return null;
  // Formulas reading one of those — and the ones reading those, and so on.
  let grew = true;
  while (grew) {
    grew = false;
    for (const h of headers) {
      if (redo.has(h.id) || !isFormula(h) || hasAggregate(h.formula)) continue;
      const reads = formulaRefs(h.formula, refNames).some((n) => {
        const dep = byName.get(nameKey(n));
        return dep && redo.has(dep.id);
      });
      if (reads) { redo.add(h.id); grew = true; }
    }
  }
  return { redo: headers.filter((h) => redo.has(h.id)), needed: [...needed] };
}

// One row's cells with the plan's headers worked out again — a new row only
// when it has any of them.
function applyRow(row, plan, headers, totals) {
  const cells = row.cells || {};
  if (!plan.redo.some((h) => cells[h.id])) return row;
  const next = { ...cells };
  const scope = {};
  for (const h of headers) {
    const raw = next[h.id]?.raw;
    if (raw !== undefined) scope[h.name] = raw;
  }
  const refNames = refNamesFor(headers);
  for (const h of plan.redo) {
    if (!next[h.id]) continue;
    const { value } = evaluateFormulaTyped(h.formula, scope, refNames, null, { totals });
    const raw = value == null ? '' : value;
    scope[h.name] = raw;
    next[h.id] = { ...next[h.id], raw, display: raw === '' ? '' : fmtHeaderCell(h, raw) };
  }
  return { ...row, cells: next };
}

// The Total row values TOTAL() needs, by header name.
function totalsFor(headers, plan, topRows, rules) {
  const byId = new Map(headers.map((h) => [h.id, h]));
  const totals = {};
  const raw = tableTotals(headers, topRows, plan.needed, rules);
  for (const id of plan.needed) {
    const h = byId.get(id);
    if (h) totals[h.name] = raw[id]?.raw ?? '';
  }
  return totals;
}

// DetailsTable: every row, with the Total row over all of `rows`.
export function withTotalRefs(headers, columns, rows, rules = null) {
  const all = headers?.length ? headers : columns;
  const plan = totalRefPlan(all);
  if (!plan || !rows.length) return rows;
  const totals = totalsFor(all, plan, rows, rules);
  return rows.map((r) => applyRow(r, plan, all, totals));
}

// OverviewTreeTable: every node at every level, with the Total row over the
// top level (each node already adds up its children).
export function withTotalRefsTree(headers, columns, tree, rules = null) {
  const all = headers?.length ? headers : columns;
  const plan = totalRefPlan(all);
  if (!plan || !tree.length) return tree;
  const totals = totalsFor(all, plan, tree, rules);
  const walk = (list) => list.map((n) => {
    let next = applyRow(n, plan, all, totals);
    // A merged node's unique rows, with the same Total row values.
    if (n.unique?.length) next = { ...next, unique: n.unique.map((u) => applyRow(u, plan, all, totals)) };
    return n.children?.length ? { ...next, children: walk(n.children) } : next;
  });
  return walk(tree);
}
