// The Total row of a dashboard table (DetailsTable / OverviewTreeTable): one
// value per shown header over the rows given — the table's rows as filtered,
// every page, not just the one on screen. Per column:
//  - a number: the sum;
//  - a ratio formula (one that divides — Margin % = [Profit] / [Revenue] *
//    100, Avg Price = [Revenue] / [Units]): the formula again, over the
//    totals of the headers it reads — not the sum of every row's ratio;
//  - any other percentage: the average of the rows;
//  - text, ids, dates, day counts: nothing — a sum of those means nothing.
// A ratio whose inputs can't be totalled here (a header the rows don't
// carry, a built-in, a SUM / COUNT over the raw sheet rows) falls back to
// the sum / average. Pure — node-testable.
//
// A Tab / Overview Tab can set its own rule per header (`rules` — the tab's
// `totals`: { [headerId]: { mode, formula } }, Template Settings › Tab ›
// Total row): 'auto' (the above), 'sum', 'avg', 'min', 'max', 'count' (non-
// blank cells), 'none', or 'formula' — e.g. [Profit/Loss] / [Total Order]
// over the other headers' totals, or SUM([X]) / COUNT([Status], "RTO") over
// the table's rows.

import { refsIn, RESERVED_HEADER_ID_LIST } from '@/data/templateSchema';
import { aggregateCalls, evaluateFormulaTyped, formulaRefs } from './formula';
import { fmtHeaderCell, fmtTyped, NO_DATA } from './fmt';
import { datedHeaderNames } from './resolveTemplate';

const NOT_TOTALLED = new Set(['text', 'alphanumeric', 'date']);
const nameKey = (s) => String(s ?? '').trim().toLowerCase();
const round2 = (n) => Math.round(n * 100) / 100;

// formula.js keeps its tokenizer per refNames array — hand it the same one
// for the same headers.
const NAMES = new WeakMap();
function refNamesFor(headers) {
  if (!NAMES.has(headers)) NAMES.set(headers, headers.map((h) => h.name));
  return NAMES.get(headers);
}

function numbersIn(rows, id) {
  const out = [];
  for (const r of rows) {
    const raw = r.cells?.[id]?.raw;
    if (raw === '' || raw == null || typeof raw === 'boolean') continue;
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

const isRatio = (h) => h.type === 'formula' && String(h.formula || '').includes('/') && !aggregateCalls(h.formula).length;

// `headers` = every header def of the template (what a ratio formula may
// read); `rows` = [{ cells: { [headerId]: { raw } } }]; `ids` = the header
// ids to total. → { [headerId]: { raw, display } } — raw '' = no total.
export const TOTAL_MODES = [
  { id: 'auto', label: 'Auto' },
  { id: 'sum', label: 'Sum' },
  { id: 'avg', label: 'Average' },
  { id: 'min', label: 'Min' },
  { id: 'max', label: 'Max' },
  { id: 'count', label: 'Count' },
  { id: 'none', label: 'None' },
  { id: 'formula', label: 'Formula' },
];

export function tableTotals(headers = [], rows = [], ids = [], rules = null) {
  const byId = new Map(headers.map((h) => [h.id, h]));
  const byName = new Map(headers.map((h) => [nameKey(h.name), h]));
  const dated = datedHeaderNames(headers);
  const memo = new Map();
  const visiting = new Set();

  const plain = (h) => {
    const nums = numbersIn(rows, h.id);
    if (!nums.length) return '';
    const sum = nums.reduce((a, b) => a + b, 0);
    return round2(h.format === 'pct' ? sum / nums.length : sum);
  };

  const ratio = (h) => {
    const scope = {};
    for (const ref of refsIn(h.formula)) {
      const dep = byName.get(nameKey(ref));
      const v = dep ? valueOf(dep) : '';
      if (v === '' || typeof v !== 'number') return undefined; // can't total an input → caller falls back
      scope[dep.name] = v;
    }
    const { value } = evaluateFormulaTyped(h.formula, scope, refNamesFor(headers));
    return typeof value === 'number' && Number.isFinite(value) ? round2(value) : '';
  };

  // A tab's own rule for this header, if it set one (not 'auto').
  const ruleOf = (h) => {
    const r = rules?.[h.id];
    return r && r.mode && r.mode !== 'auto' ? r : null;
  };
  // SUM([X]) / COUNT([X], …) in a Total formula: X's cells down the table.
  const columnOf = (name) => {
    const h = byName.get(nameKey(name));
    return h ? rows.map((r) => r.cells?.[h.id]?.raw) : null;
  };
  const kinds = new Map(); // header id → 'date' | 'days' a Total formula came out as
  const byRule = (h, rule) => {
    if (rule.mode === 'none') return '';
    if (rule.mode === 'count') return rows.filter((r) => { const v = r.cells?.[h.id]?.raw; return v != null && String(v).trim() !== ''; }).length;
    if (rule.mode === 'formula') {
      const formula = String(rule.formula || '').trim();
      if (!formula) return '';
      const scope = {};
      for (const ref of formulaRefs(formula, refNamesFor(headers))) {
        const dep = byName.get(nameKey(ref));
        if (!dep || dep.id === h.id) continue;
        const v = visiting.has(dep.id) ? '' : valueOf(dep);
        if (v !== '') scope[dep.name] = v;
      }
      const { value, kind } = evaluateFormulaTyped(formula, scope, refNamesFor(headers), columnOf);
      if (kind === 'date' || kind === 'days') kinds.set(h.id, kind);
      return value === '' || value == null ? '' : typeof value === 'number' ? round2(value) : value;
    }
    const nums = numbersIn(rows, h.id);
    if (!nums.length) return '';
    if (rule.mode === 'min') return round2(Math.min(...nums));
    if (rule.mode === 'max') return round2(Math.max(...nums));
    const sum = nums.reduce((a, b) => a + b, 0);
    return round2(rule.mode === 'avg' ? sum / nums.length : sum);
  };

  function valueOf(h) {
    if (memo.has(h.id)) return memo.get(h.id);
    const rule = ruleOf(h);
    if (rule) {
      visiting.add(h.id);
      const raw = byRule(h, rule);
      visiting.delete(h.id);
      memo.set(h.id, raw);
      return raw;
    }
    let raw = '';
    const skip = NOT_TOTALLED.has(h.type) || h.primitive === 'sku' || RESERVED_HEADER_ID_LIST.includes(h.id) || dated.has(nameKey(h.name));
    if (!skip) {
      if (isRatio(h) && !visiting.has(h.id)) {
        visiting.add(h.id);
        raw = ratio(h);
        visiting.delete(h.id);
      } else raw = undefined;
      if (raw === undefined) raw = plain(h);
    }
    memo.set(h.id, raw);
    return raw;
  }

  const out = {};
  for (const id of ids) {
    const h = byId.get(id);
    if (!h) continue;
    const raw = valueOf(h);
    const rule = ruleOf(h);
    const totalled = rule ? rule.mode !== 'none' : !(NOT_TOTALLED.has(h.type) || h.primitive === 'sku' || RESERVED_HEADER_ID_LIST.includes(h.id) || dated.has(nameKey(h.name)));
    let display;
    if (raw === '') display = totalled ? NO_DATA : ''; // a column with a total but no data: "-", not 0
    else if (kinds.has(id)) display = fmtTyped(raw, kinds.get(id));
    else if (rule?.mode === 'count') display = String(raw);
    else display = fmtHeaderCell(rule?.mode === 'formula' && typeof raw === 'number' && NOT_TOTALLED.has(h.type) ? { ...h, type: 'number' } : h, raw);
    out[id] = { raw, display };
  }
  return out;
}
