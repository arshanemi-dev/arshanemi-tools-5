// Evaluator for template formulas (Header / Title Card / Graph Data "Formula"
// type). Ported from tools-4 components/listing/formula.js — same
// recursive-descent parser (+ - * / ^, parens, the word "power" as ^, a
// trailing % as per cent),
// NEVER eval()/Function(). Adapted so `scope` is a flat { [name]: value } map
// instead of a row + headers pair: a reference [Total Order] resolves to
// scope['Total Order'] directly.
//
// Two auto-detected modes per call:
//  - Arithmetic, when every [ref] resolves to a number — "[MRP] * 1.5".
//  - Text join, when at least one [ref] resolves to non-numeric text —
//    "[Brand]-[Sku Name]" concatenates; operators/numbers become literal text.
//
// Plus two aggregate operators, SUM([Header]) / COUNT([Header]), resolved
// against an optional `rows` context (the rows of the current group) before
// the rest of the formula is parsed — see applyAggregateFns. COUNT also
// takes a value filter: COUNT([Status], "Delivered").
//
// Returns a number (2dp, arithmetic), a string (text-join), or '' when
// unresolvable (missing / blank ref, or malformed syntax) — never throws.

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const refLabels = (refNames) => [...new Set((refNames || []).map((n) => String(n).trim()).filter(Boolean))];

// A number literal: "1,000" / "1,00,000" (thousands or lakh grouping — the
// last group is always three digits, so "12,50" is NOT read as 1250), "1299",
// "12.5" or ".5". The leading-dot form used to lose its dot (".5" became 5).
const NUMBER = '\\d{1,3}(?:,\\d{2,3})*,\\d{3}(?:\\.\\d+)?|\\d+(?:\\.\\d+)?|\\.\\d+';

// What a typed operator means: a phone / Word keyboard turns "-" into "–" or
// "−" and offers "×" / "÷", which the tokenizer used to drop without a word.
const OPERATOR = { '×': '*', '÷': '/', '−': '-', '–': '-' };

// Longest-label-first alternation so "[Ads %]" wins over a stray "Ads".
function buildTokenRegex(labels) {
  const escaped = [...labels].sort((a, b) => b.length - a.length).map(escapeRegex);
  const group = escaped.length ? escaped.join('|') : '[^\\s\\S]';
  return new RegExp(`\\[(${group})\\]|(${group})|(${NUMBER})|(power)|([+\\-*/^()%×÷−–])`, 'gi');
}

// Labels match case-insensitively (the regex is /i), so "[mrp]" has to
// resolve to the header as it's actually named — scope keys are exact.
function canonicalRef(name, labels) {
  if (labels.includes(name)) return name;
  const lower = name.toLowerCase();
  return labels.find((l) => l.toLowerCase() === lower) ?? name;
}

function tokenize(formula, refNames) {
  const labels = refLabels(refNames);
  const re = buildTokenRegex(labels);
  const tokens = [];
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(formula))) {
    if (m[1] !== undefined) tokens.push({ type: 'ref', name: canonicalRef(m[1].trim(), labels), raw: m[0] });
    else if (m[2] !== undefined) tokens.push({ type: 'ref', name: canonicalRef(m[2].trim(), labels), raw: m[0] });
    else if (m[3] !== undefined) tokens.push({ type: 'num', value: parseFloat(m[3].replace(/,/g, '')), raw: m[3] });
    else if (m[4] !== undefined) tokens.push({ type: 'op', value: '^', raw: m[4] });
    else if (m[5] === '(') tokens.push({ type: 'lparen', raw: '(' });
    else if (m[5] === ')') tokens.push({ type: 'rparen', raw: ')' });
    else if (m[5] !== undefined) tokens.push({ type: 'op', value: OPERATOR[m[5]] || m[5], raw: m[5] });
  }
  return tokens;
}

// Precedence climbing over already-resolved (num/op/paren only) tokens.
function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseExpr() {
    let left = parseTerm();
    while (peek()?.type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = next().value;
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }
  function parseTerm() {
    let left = parsePower();
    while (peek()?.type === 'op' && (peek().value === '*' || peek().value === '/')) {
      const op = next().value;
      const right = parsePower();
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }
  function parsePower() {
    const base = parseUnary();
    if (peek()?.type === 'op' && peek().value === '^') {
      next();
      return Math.pow(base, parsePower());
    }
    return base;
  }
  function parseUnary() {
    if (peek()?.type === 'op' && peek().value === '-') {
      next();
      return -parseUnary();
    }
    return parsePercent();
  }
  // A trailing "%" is a percentage, as in a spreadsheet: "[MRP] * 18%" is
  // 18 per cent of MRP. (It used to be dropped, giving MRP × 18.)
  function parsePercent() {
    let val = parseFactor();
    while (peek()?.type === 'op' && peek().value === '%') {
      next();
      val /= 100;
    }
    return val;
  }
  function parseFactor() {
    const t = next();
    if (!t) throw new Error('unexpected end');
    if (t.type === 'num') return t.value;
    if (t.type === 'lparen') {
      const val = parseExpr();
      if (peek()?.type !== 'rparen') throw new Error('missing )');
      next();
      return val;
    }
    throw new Error('unexpected token');
  }

  if (!tokens.length) throw new Error('empty');
  const result = parseExpr();
  if (pos !== tokens.length) throw new Error('trailing tokens');
  return result;
}

// "1,299.00" / "₹ 1,234" / "Rs. 50" / "24%" / "(150.00)" (accounting
// negative) / "−45" (unicode minus) → a number; anything else → NaN.
function toNumber(raw) {
  if (raw == null || raw === '') return NaN;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
  let s = String(raw).trim();
  const negative = /^\(.*\)$/.test(s);
  if (negative) s = s.slice(1, -1);
  const cleaned = s.replace(/^(rs\.?|inr)\s*/i, '').replace(/[₹$,\s]/g, '').replace(/%$/, '').replace(/[−–]/g, '-');
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return NaN;
  return negative ? -n : n;
}

// SUM([Header]) / COUNT([Header]) — the two aggregate operators: they reduce
// one column across every row of the current group instead of reading a
// single value. SUM adds the column's numeric values; COUNT counts its
// non-blank values, or — given a filter — only the rows whose value is one
// of the listed ones: COUNT([Status], "Delivered") /
// COUNT([Status], "Delivered", "Shipped"). That's what turns one Status
// column into a Delivered / RTO / Cancelled count each (see filterMatcher
// for how a value compares).
//
// `rows` is where the column comes from:
//  - an array of flat { [name]: value } scopes, one per row; or
//  - a `(name) => values[] | null` reader (sheetColumns.js rawColumnReader:
//    the raw sheet rows behind the group) — null = "not a column I hold";
//  - neither / null from the reader → this scope's own single value.
// Resolved as a string-substitution pass BEFORE tokenizing, so the result
// folds into the surrounding arithmetic like any other number —
// "SUM([MRP]) * 1.1" and "COUNT([Status], "RTO") / COUNT([Status]) * 100"
// both work.
const QUOTED = '"[^"]*"|\'[^\']*\'|“[^”]*”|‘[^’]*’'; // typed, or pasted from Word / a phone
const BARE = '[^,()"\'“”‘’]+';
const AGG_FN_RE = new RegExp(`\\b(SUM|COUNT)\\s*\\(\\s*\\[([^[\\]]+)\\]\\s*((?:,\\s*(?:${QUOTED}|${BARE})\\s*)*)\\)`, 'gi');
const FILTER_ARG_RE = new RegExp(`,\\s*(${QUOTED}|${BARE})`, 'g');
const HAS_AGG_FN = /\b(?:SUM|COUNT)\s*\(/i;

// `, "Delivered", "Shipped"` → ['Delivered', 'Shipped'] (blank ones dropped).
function filterValues(argText) {
  const out = [];
  for (const m of String(argText || '').matchAll(FILTER_ARG_RE)) {
    const raw = m[1].trim();
    const value = (/^["'“‘]/.test(raw) ? raw.slice(1, -1) : raw).trim();
    if (value) out.push(value);
  }
  return out;
}

// How a COUNT filter compares a cell to what was typed: capital letters,
// extra spaces and a _ or - between words don't matter ("ready to ship" is
// "READY_TO_SHIP"), numbers compare as numbers ("1" is "1.0"), and * stands
// for any text ("*return*" = contains "return"). Otherwise it's the whole
// value — "Return" does not count "Customer Return".
const filterKey = (v) => String(v ?? '').toLowerCase().replace(/([a-z0-9])[\s_-]+(?=[a-z0-9])/g, '$1 ').replace(/\s+/g, ' ').trim();
const plainNumber = (key) => (/^-?\d+(?:\.\d+)?$/.test(key) ? Number(key) : null);

function filterMatcher(values) {
  const exact = new Set();
  const numbers = new Set();
  const patterns = [];
  for (const v of values) {
    const key = filterKey(v);
    if (!key) continue;
    if (key.includes('*')) { patterns.push(new RegExp(`^${key.split('*').map(escapeRegex).join('.*')}$`)); continue; }
    exact.add(key);
    if (plainNumber(key) != null) numbers.add(plainNumber(key));
  }
  return (cell) => {
    const key = filterKey(cell);
    if (!key) return false;
    return exact.has(key) || (numbers.size > 0 && numbers.has(plainNumber(key))) || patterns.some((re) => re.test(key));
  };
}

// A formula's filter is re-read for every row group it's evaluated against —
// keep the handful of matchers a template actually uses.
const matcherCache = new Map();
function matcherFor(argText) {
  if (!matcherCache.has(argText)) {
    if (matcherCache.size > 200) matcherCache.clear();
    const values = filterValues(argText);
    matcherCache.set(argText, values.length ? filterMatcher(values) : null);
  }
  return matcherCache.get(argText);
}

const notBlank = (v) => v != null && String(v).trim() !== '';

function columnValues(name, scope, rows) {
  const fromRows = typeof rows === 'function' ? rows(name) : Array.isArray(rows) ? rows.map((r) => r[name]) : null;
  return Array.isArray(fromRows) ? fromRows : [scope[name]];
}

function applyAggregateFns(formula, scope, rows, refNames) {
  if (!formula || !HAS_AGG_FN.test(formula)) return formula;
  const labels = refLabels(refNames);
  return formula.replace(AGG_FN_RE, (match, fn, refName, argText) => {
    const isCount = fn.toUpperCase() === 'COUNT';
    if (!isCount && argText.trim()) return match; // only COUNT takes a filter
    const values = columnValues(canonicalRef(refName.trim(), labels), scope, rows);
    if (isCount) return String(values.filter(matcherFor(argText) || notBlank).length);
    const n = values.reduce((acc, v) => {
      const num = toNumber(v);
      return acc + (Number.isNaN(num) ? 0 : num);
    }, 0);
    return String(Math.round(n * 100) / 100);
  });
}

// Every SUM / COUNT call in a formula → [{ fn, name, values }] (`values` = a
// COUNT's filter; [] when it counts everything). For the builder: describing
// a formula in words, and giving the live preview's demo rows those values.
export function aggregateCalls(formula) {
  const out = [];
  for (const m of String(formula || '').matchAll(AGG_FN_RE)) out.push({ fn: m[1].toUpperCase(), name: m[2].trim(), values: filterValues(m[3]) });
  return out;
}

// The text of a COUNT call — the one place that knows how a filter is
// written. Quotes and brackets can't be part of a value (they delimit it,
// and a [bracket] would read as a header reference), so they're dropped.
export function countCall(name, values = []) {
  const clean = values.map((v) => String(v).replace(/["“”[\]]/g, '').trim()).filter(Boolean);
  return `COUNT([${name}]${clean.map((v) => `, "${v}"`).join('')})`;
}

// Resolve one bracket's inner content: a direct scope hit, else an arithmetic
// sub-expression over scope refs.
function resolveInner(inner, scope, refNames) {
  const key = canonicalRef(inner.trim(), refLabels(refNames));
  if (Object.prototype.hasOwnProperty.call(scope, key)) {
    const raw = scope[key];
    if (raw == null || String(raw).trim() === '') return null;
    return raw;
  }
  try {
    const tokens = tokenize(inner, refNames);
    const resolved = [];
    for (const t of tokens) {
      if (t.type !== 'ref') { resolved.push(t); continue; }
      if (!Object.prototype.hasOwnProperty.call(scope, t.name)) return null;
      const n = toNumber(scope[t.name]);
      if (Number.isNaN(n)) return null;
      resolved.push({ type: 'num', value: n });
    }
    const out = parse(resolved);
    return Number.isFinite(out) ? Math.round(out * 100) / 100 : null;
  } catch {
    return null;
  }
}

export function evaluateFormula(formula, scope = {}, refNames = [], rows = null) {
  if (formula == null || !String(formula).trim()) return '';
  const trimmed = applyAggregateFns(String(formula).trim(), scope, rows, refNames);

  // Whole formula is a single bracket, e.g. "[Cost + 250]" → arithmetic.
  const single = trimmed.startsWith('[') && trimmed.endsWith(']') && trimmed.indexOf(']', 1) === trimmed.length - 1;
  if (single) {
    const res = resolveInner(trimmed.slice(1, -1).trim(), scope, refNames);
    return res == null ? '' : res;
  }

  const tokens = tokenize(trimmed, refNames);
  if (!tokens.length) return '';

  // Mode: arithmetic if every ref resolves to a number, else text-join.
  let allNumeric = true;
  for (const t of tokens) {
    if (t.type !== 'ref') continue;
    if (!Object.prototype.hasOwnProperty.call(scope, t.name)) return '';
    const val = scope[t.name];
    if (val == null || String(val).trim() === '') return '';
    if (Number.isNaN(toNumber(val))) allNumeric = false;
  }

  if (allNumeric) {
    try {
      const resolved = tokens.map((t) =>
        t.type === 'ref' ? { type: 'num', value: toNumber(scope[t.name]) } : t,
      );
      const out = parse(resolved);
      return Number.isFinite(out) ? Math.round(out * 100) / 100 : '';
    } catch {
      return '';
    }
  }

  // Text-join.
  let str = '';
  for (const t of tokens) {
    if (t.type === 'ref') {
      const val = resolveInner(t.name, scope, refNames);
      if (val == null) return '';
      str += val;
    } else {
      str += t.raw ?? t.value ?? '';
    }
  }
  return str;
}

// Convenience: evaluate a { type, formula } value block. `type` 'number' takes
// the formula as a literal constant; 'text' returns it verbatim.
export function evaluateValueBlock(block, scope, refNames, rows = null) {
  if (!block || typeof block !== 'object') return '';
  if (block.type === 'number') {
    const n = toNumber(block.formula);
    return Number.isNaN(n) ? 0 : n;
  }
  if (block.type === 'text') return block.formula ?? '';
  return evaluateFormula(block.formula, scope, refNames, rows);
}
