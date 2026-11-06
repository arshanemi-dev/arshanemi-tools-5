// Evaluator for template formulas (Header / Title Card / Graph Data "Formula"
// type). Ported from tools-4 components/listing/formula.js — same
// recursive-descent parser (+ - * / ^, parens, the word "power" as ^, a
// trailing % as per cent — the parser itself lives in ./formulaParse.js),
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
// Dates: a [ref] to a Date header (the caller says which, via `kindOf`) and
// TODAY() are dates, and arithmetic on them is date arithmetic — see "typed
// operands" below: [Settlement Date] - [Order Date] is a number of days,
// TODAY() - [Order Date] is how many days ago, [Order Date] + 7 is a date.
//
// Returns a number (2dp, arithmetic), a string (text-join), or '' when
// unresolvable (missing / blank ref, or malformed syntax) — never throws.
// evaluateFormulaTyped also says what the value is ('number' | 'days' |
// 'date' — a timestamp — | 'text'), so a caller can show "3 days" or a date.

import { parseDateTime, startOfToday } from './dates';
import { parse } from './formulaParse';
import { parseNumberish } from '@/data/platforms/canonical';

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const refLabels = (refNames) => [...new Set((refNames || []).map((n) => String(n).trim()).filter(Boolean))];

// Everything worked out from one list of names: the labels, how each reads
// whatever its capitals, the tokenizer's regex, and the tokens of every
// formula already read against it. Kept per list — the array itself is the
// key — because resolveTemplate evaluates the same few formulas for every
// row group, always with the same list: escaping and joining every header
// name into that regex once per evaluation (as this used to) was a large
// part of what a dashboard update cost. Gone with the array; a list that was
// changed in place since is noticed by its length and read again.
const NO_NAMES = [];
const KNOWN = new WeakMap();
const MAX_TOKENIZED = 500; // formulas remembered per list — a SUM / COUNT folded in makes a new text per group
function namesOf(refNames) {
  const list = refNames || NO_NAMES;
  let known = KNOWN.get(list);
  if (!known || known.length !== list.length) {
    const labels = refLabels(list);
    const lower = new Map();
    for (const label of labels) {
      const key = label.toLowerCase();
      if (!lower.has(key)) lower.set(key, label);
    }
    known = { length: list.length, labels, exact: new Set(labels), lower, regex: null, tokens: new Map() };
    KNOWN.set(list, known);
  }
  return known;
}

// A number literal: "1,000" / "1,00,000" (thousands or lakh grouping — the
// last group is always three digits, so "12,50" is NOT read as 1250), "1299",
// "12.5" or ".5". The leading-dot form used to lose its dot (".5" became 5).
const NUMBER = '\\d{1,3}(?:,\\d{2,3})*,\\d{3}(?:\\.\\d+)?|\\d+(?:\\.\\d+)?|\\.\\d+';

// What a typed operator means: a phone / Word keyboard turns "-" into "–" or
// "−" and offers "×" / "÷", which the tokenizer used to drop without a word.
const OPERATOR = { '×': '*', '÷': '/', '−': '-', '–': '-' };

// Longest-label-first alternation so "[Ads %]" wins over a stray "Ads".
// Exported for code that has to find a formula's references exactly as the
// tokenizer does (headerUsage.js renames them).
export function labelPattern(names) {
  const escaped = refLabels(names).sort((a, b) => b.length - a.length).map(escapeRegex);
  return escaped.length ? escaped.join('|') : '[^\\s\\S]';
}

// TODAY() is tried before any label (it can only be the function); the bare
// word "today" only after them, so a header that starts with "Today" still
// reads as that header.
function buildTokenRegex(labels) {
  const group = labelPattern(labels);
  return new RegExp(`(\\btoday\\s*\\(\\s*\\))|\\[(${group})\\]|(${group})|(${NUMBER})|(power)|([+\\-*/^()%×÷−–])|(\\btoday\\b)`, 'gi');
}

// Labels match case-insensitively (the regex is /i), so "[mrp]" has to
// resolve to the header as it's actually named — scope keys are exact.
// `known` = namesOf(refNames).
function canonicalRef(name, known) {
  if (known.exact.has(name)) return name;
  return known.lower.get(name.toLowerCase()) ?? name;
}

// → the formula's tokens. Remembered per list of names and shared between
// calls, so they are read-only: nothing downstream changes a token.
function tokenize(formula, known) {
  const seen = known.tokens.get(formula);
  if (seen) return seen;
  known.regex ||= buildTokenRegex(known.labels);
  const re = known.regex;
  const tokens = [];
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(formula))) {
    if (m[1] !== undefined || m[7] !== undefined) tokens.push({ type: 'today', raw: m[0] });
    else if (m[2] !== undefined) tokens.push({ type: 'ref', name: canonicalRef(m[2].trim(), known), raw: m[0] });
    else if (m[3] !== undefined) tokens.push({ type: 'ref', name: canonicalRef(m[3].trim(), known), raw: m[0] });
    else if (m[4] !== undefined) tokens.push({ type: 'num', value: parseFloat(m[4].replace(/,/g, '')), raw: m[4] });
    else if (m[5] !== undefined) tokens.push({ type: 'op', value: '^', raw: m[5] });
    else if (m[6] === '(') tokens.push({ type: 'lparen', raw: '(' });
    else if (m[6] === ')') tokens.push({ type: 'rparen', raw: ')' });
    else if (m[6] !== undefined) tokens.push({ type: 'op', value: OPERATOR[m[6]] || m[6], raw: m[6] });
  }
  if (known.tokens.size >= MAX_TOKENIZED) known.tokens.clear();
  known.tokens.set(formula, tokens);
  return tokens;
}

// "1,299.00" / "₹ 1,234" / "Rs. 50" / "24%" / "(150.00)" (accounting
// negative) / "−45" (unicode minus) → a number; anything else → NaN.
// The WHOLE value has to be a number — parseFloat used to read just the
// leading digits, so a SKU like "1704002-02-Messi-NBLA%%" counted as the
// number 1704002 and a formula showing it cut the rest off.
function toNumber(raw) {
  return parseNumberish(raw);
}

// The aggregate operators — they reduce a column across every row of the
// current group instead of reading a single value:
//   SUM([X])  AVG([X])  MIN([X])  MAX([X])   X's numbers: total / average /
//                                            smallest / largest
//   COUNT([X])                               rows where X has a value
//   VALUE([X])                               X's value itself — text too;
//                                            several different ones read
//                                            "first +N more"
// Each can take a condition — only the rows where another header has one of
// the listed values:
//   SUM([Settlement], [Status], "Delivered")         ← SUMIF
//   COUNT([Order-Id], [Status], "RTO", "Return")
//   VALUE([Return Reason], [Status], "Return")
// and COUNT's short form filters X itself: COUNT([Status], "Delivered") —
// that's what turns one Status column into a Delivered / RTO / Cancelled
// count each (see filterMatcher for how a value compares).
//
// `rows` is where the columns come from:
//  - an array of flat { [name]: value } scopes, one per row; or
//  - a `(name) => values[] | null` reader (sheetColumns.js rawColumnReader:
//    the raw sheet rows behind the group) — null = "not a column I hold";
//  - neither / null from the reader → this scope's own single value.
// Resolved as a string-substitution pass BEFORE tokenizing, so the result
// folds into the surrounding arithmetic like any other number —
// "SUM([MRP]) * 1.1" and "COUNT([Status], "RTO") / COUNT([Status]) * 100"
// both work. A VALUE that is text only works as the whole formula.
const QUOTED = '"[^"]*"|\'[^\']*\'|“[^”]*”|‘[^’]*’'; // typed, or pasted from Word / a phone
const BARE = '[^,()"\'“”‘’]+';
export const AGG_FNS = ['SUM', 'COUNT', 'AVG', 'MIN', 'MAX', 'VALUE'];
export const AGG_FN_RE = new RegExp(`\\b(${AGG_FNS.join('|')})\\s*\\(\\s*\\[([^[\\]]+)\\]\\s*((?:,\\s*(?:${QUOTED}|${BARE})\\s*)*)\\)`, 'gi');
const FILTER_ARG_RE = new RegExp(`,\\s*(${QUOTED}|${BARE})`, 'g');
const HAS_AGG_FN = new RegExp(`\\b(?:${AGG_FNS.join('|')})\\s*\\(`, 'i');
const BRACKETED = /^\[([^[\]]+)\]$/;

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

// A call's arguments after its first [X] → { where, values }: `where` = the
// condition header (a [bracketed] first argument), else null — COUNT's
// short form, which filters X itself.
function callArgs(argText) {
  const args = filterValues(argText);
  const m = args.length ? BRACKETED.exec(args[0]) : null;
  return m ? { where: m[1].trim(), values: args.slice(1) } : { where: null, values: args };
}

// How a filter compares a cell to what was typed: capital letters,
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
function matcherFor(values) {
  const key = JSON.stringify(values);
  if (!matcherCache.has(key)) {
    if (matcherCache.size > 200) matcherCache.clear();
    matcherCache.set(key, values.length ? filterMatcher(values) : null);
  }
  return matcherCache.get(key);
}

const notBlank = (v) => v != null && String(v).trim() !== '';

function columnValues(name, scope, rows) {
  const fromRows = typeof rows === 'function' ? rows(name) : Array.isArray(rows) ? rows.map((r) => r[name]) : null;
  return Array.isArray(fromRows) ? fromRows : [scope[name]];
}

// X's values on the rows the condition keeps. The two columns line up row
// by row; one that is a single value (a computed header, not a sheet
// column) stands for every row. Columns of two different lengths can't be
// lined up — nothing is kept.
function keptValues(values, condition, matches) {
  if (!condition) return values;
  const n = Math.max(values.length, condition.length);
  if (values.length !== n && values.length !== 1) return [];
  if (condition.length !== n && condition.length !== 1) return [];
  const out = [];
  for (let i = 0; i < n; i += 1) {
    if (matches(condition.length === 1 ? condition[0] : condition[i])) out.push(values.length === 1 ? values[0] : values[i]);
  }
  return out;
}

const round2 = (n) => Math.round(n * 100) / 100;

// One call → its result: a number, or (VALUE) the value itself; '' = none.
function aggregateValue(fn, values) {
  if (fn === 'COUNT') return values.filter(notBlank).length;
  if (fn === 'VALUE') {
    const distinct = [...new Set(values.filter(notBlank).map((v) => (typeof v === 'number' ? v : String(v).trim())))];
    if (!distinct.length) return '';
    return distinct.length === 1 ? distinct[0] : `${distinct[0]} +${distinct.length - 1} more`;
  }
  const nums = values.map(toNumber).filter((n) => !Number.isNaN(n));
  if (fn === 'SUM') return round2(nums.reduce((a, b) => a + b, 0));
  if (!nums.length) return '';
  if (fn === 'AVG') return round2(nums.reduce((a, b) => a + b, 0) / nums.length);
  return round2(fn === 'MIN' ? Math.min(...nums) : Math.max(...nums));
}

function runCall(fn, refName, argText, scope, rows, known) {
  const upper = fn.toUpperCase();
  const { where, values: filter } = callArgs(argText);
  const values = columnValues(canonicalRef(refName.trim(), known), scope, rows);
  if (!where) {
    // Only COUNT filters its own column; another call with a filter but no
    // [condition header] is left as typed (it shows nothing).
    if (filter.length && upper !== 'COUNT') return undefined;
    return aggregateValue(upper, filter.length ? values.filter(matcherFor(filter)) : values);
  }
  const condition = columnValues(canonicalRef(where, known), scope, rows);
  const matches = filter.length ? matcherFor(filter) : notBlank; // no values → wherever the condition header has one
  return aggregateValue(upper, keptValues(values, condition, matches));
}

function applyAggregateFns(formula, scope, rows, known) {
  if (!formula || !HAS_AGG_FN.test(formula)) return formula;
  return formula.replace(AGG_FN_RE, (match, fn, refName, argText) => {
    const out = runCall(fn, refName, argText, scope, rows, known);
    if (out === undefined) return match;
    return out === '' ? '' : String(out);
  });
}

// The formula is nothing but one call — VALUE([X], …) above all, whose text
// can't go through the arithmetic — → that call's own result, else null.
function wholeCall(formula, scope, rows, known) {
  const text = String(formula).trim();
  for (const m of text.matchAll(AGG_FN_RE)) {
    if (m.index !== 0 || m[0].length !== text.length) return null;
    const out = runCall(m[1], m[2], m[3], scope, rows, known);
    return out === undefined ? null : out;
  }
  return null;
}

// Every aggregate call in a formula → [{ fn, name, where, values }] (`where`
// = its condition header or null; `values` = the filter, [] when it takes
// every row). For the builder: describing a formula in words, and giving the
// live preview's demo rows those values.
export function aggregateCalls(formula) {
  const out = [];
  for (const m of String(formula || '').matchAll(AGG_FN_RE)) {
    out.push({ fn: m[1].toUpperCase(), name: m[2].trim(), ...callArgs(m[3]) });
  }
  return out;
}

// One call in plain words — what the formula builder shows under the
// formula. “A”, “B” or “C” for the values.
const quoted = (values) => {
  const q = values.map((v) => `“${v}”`);
  return q.length > 1 ? `${q.slice(0, -1).join(', ')} or ${q[q.length - 1]}` : q[0] || '';
};
export function describeCall({ fn, name, where, values }) {
  const cond = where
    ? (values.length ? ` — only rows where ${where} is ${quoted(values)}` : ` — only rows where ${where} has a value`)
    : ' across the group';
  switch (fn) {
    case 'SUM': return `Adds up ${name}${cond}.`;
    case 'AVG': return `Average of ${name}${cond}.`;
    case 'MIN': return `Smallest ${name}${cond}.`;
    case 'MAX': return `Largest ${name}${cond}.`;
    case 'VALUE': return `Takes the ${name} value${cond} (one value, or “first +N more” when they differ).`;
    case 'COUNT':
      if (where) return `Counts rows that have ${name}${cond}.`;
      return values.length ? `Counts rows where ${name} is ${quoted(values)}.` : `Counts rows that have ${name} across the group.`;
    default: return '';
  }
}

// Every name a formula may read from its scope when it is evaluated: its
// [refs] and bare-word refs, and what its aggregate calls name (the column
// and the condition header). Read with the same tokenizer the evaluator
// uses, so nothing it would look up is missed (it may list a name the
// evaluator ends up not needing — never the other way round). For
// resolveTemplate, which works out only the headers a graph or an Overview
// tab shows plus whatever those depend on.
export function formulaRefs(formula, refNames = []) {
  const text = formula == null ? '' : String(formula).trim();
  if (!text) return [];
  const known = namesOf(refNames);
  const names = new Set();
  const rest = text.replace(AGG_FN_RE, (match, fn, refName, argText) => {
    names.add(canonicalRef(refName.trim(), known));
    const { where } = callArgs(argText);
    if (where) names.add(canonicalRef(where, known));
    return ' 0 ';
  });
  for (const t of tokenize(rest, known)) if (t.type === 'ref') names.add(t.name);
  return [...names];
}

// The text of an aggregate call — the one place that knows how one is
// written. Quotes and brackets can't be part of a value (they delimit it,
// and a [bracket] would read as a header reference), so they're dropped.
// `where` = the condition header (null → COUNT's short form, filtering
// `name` itself).
export function aggregateCall(fn, name, where = null, values = []) {
  const clean = values.map((v) => String(v).replace(/["“”[\]]/g, '').trim()).filter(Boolean);
  const cond = where ? `, [${where}]` : '';
  return `${fn}([${name}]${cond}${clean.map((v) => `, "${v}"`).join('')})`;
}
export const countCall = (name, values = []) => aggregateCall('COUNT', name, null, values);

// Resolve one bracket's inner content: a direct scope hit, else an arithmetic
// sub-expression over scope refs.
function resolveInner(inner, scope, known) {
  const key = canonicalRef(inner.trim(), known);
  if (Object.prototype.hasOwnProperty.call(scope, key)) {
    const raw = scope[key];
    if (raw == null || String(raw).trim() === '') return null;
    return raw;
  }
  try {
    const tokens = tokenize(inner, known);
    const resolved = [];
    for (const t of tokens) {
      if (t.type !== 'ref') { resolved.push(t); continue; }
      if (!Object.prototype.hasOwnProperty.call(scope, t.name)) return null;
      const n = toNumber(scope[t.name]);
      if (Number.isNaN(n)) return null;
      resolved.push({ type: 'num', value: n });
    }
    const out = parse(resolved).v;
    return Number.isFinite(out) ? Math.round(out * 100) / 100 : null;
  } catch {
    return null;
  }
}

const NOTHING = { value: '', kind: '' };
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

// The evaluator. `kindOf(name)` (optional) says what a [ref] holds when it
// isn't a plain value: 'date' (a Date header, or a formula that came out as
// one — its scope value is a timestamp) or 'days'. `now` is "today" for
// TODAY() (tests pin it). → { value, kind }, kind = 'number' | 'days' |
// 'date' | 'text' | '' (no answer).
export function evaluateFormulaTyped(formula, scope = {}, refNames = [], rows = null, { kindOf = null, now } = {}) {
  if (formula == null || !String(formula).trim()) return NOTHING;
  const known = namesOf(refNames);
  // A spreadsheet-style leading "=" ("=[Sku Name]") is just how people type a
  // formula — it isn't part of it.
  const typed = String(formula).trim().replace(/^=\s*/, '');
  // Just one call — SUM / COUNT / … / VALUE([X], [Cond], "v") — is its own
  // result: VALUE's text stays text instead of going through the arithmetic.
  const whole = wholeCall(typed, scope, rows, known);
  if (whole !== null) return whole === '' ? NOTHING : { value: whole, kind: typeof whole === 'number' ? 'number' : 'text' };
  const trimmed = applyAggregateFns(typed, scope, rows, known);
  if (!trimmed) return NOTHING;
  const refKind = (name) => (kindOf ? kindOf(name) : null) || null;
  const dateOf = (raw) => (typeof raw === 'number' ? raw : parseDateTime(raw));

  // Whole formula is a single bracket: "[Sku Name]" → that header's value
  // exactly as it is (like a plain mapping — "00123" stays "00123", a SKU
  // stays the whole SKU); "[Cost + 250]" → arithmetic.
  const single = trimmed.startsWith('[') && trimmed.endsWith(']') && trimmed.indexOf(']', 1) === trimmed.length - 1;
  const passThrough = (inner) => {
    const res = resolveInner(inner, scope, known);
    if (res == null) return NOTHING;
    const kind = refKind(canonicalRef(inner, known));
    if (kind === 'date') {
      const ts = dateOf(res);
      return ts == null ? { value: res, kind: 'text' } : { value: ts, kind: 'date' };
    }
    return { value: res, kind: kind === 'days' ? 'days' : typeof res === 'number' ? 'number' : 'text' };
  };
  if (single) return passThrough(trimmed.slice(1, -1).trim());

  const tokens = tokenize(trimmed, known);
  if (!tokens.length) return NOTHING;
  // Nothing but one header named without brackets ("Sku Name") — the same
  // exact copy of its value, not a number read out of it.
  if (tokens.length === 1 && tokens[0].type === 'ref') return passThrough(tokens[0].name);

  // Mode: date maths when a TODAY() or a date ref is involved; else
  // arithmetic if every ref resolves to a number; else text-join.
  let allNumeric = true;
  let dated = tokens.some((t) => t.type === 'today');
  for (const t of tokens) {
    if (t.type !== 'ref') continue;
    if (!hasOwn(scope, t.name)) return NOTHING;
    const val = scope[t.name];
    if (val == null || String(val).trim() === '') return NOTHING;
    if (refKind(t.name) === 'date') dated = true;
    else if (Number.isNaN(toNumber(val))) allNumeric = false;
  }

  if (dated || allNumeric) {
    try {
      const resolved = [];
      for (const t of tokens) {
        if (t.type === 'today') resolved.push({ type: 'num', kind: 'date', value: startOfToday(now) });
        else if (t.type !== 'ref') resolved.push(t);
        else if (refKind(t.name) === 'date') {
          const ts = dateOf(scope[t.name]);
          if (ts == null) return NOTHING; // text that isn't a date
          resolved.push({ type: 'num', kind: 'date', value: ts });
        } else {
          const n = toNumber(scope[t.name]);
          if (Number.isNaN(n)) return NOTHING; // text has no place in date maths
          resolved.push({ type: 'num', kind: refKind(t.name) === 'days' ? 'days' : 'num', value: n });
        }
      }
      const out = parse(resolved);
      if (!Number.isFinite(out.v)) return NOTHING;
      if (out.k === 'date') return { value: out.v, kind: 'date' };
      return { value: Math.round(out.v * 100) / 100, kind: out.k === 'days' ? 'days' : 'number' };
    } catch {
      return NOTHING;
    }
  }

  // Text-join.
  let str = '';
  for (const t of tokens) {
    if (t.type === 'ref') {
      const val = resolveInner(t.name, scope, known);
      if (val == null) return NOTHING;
      str += val;
    } else {
      str += t.raw ?? t.value ?? '';
    }
  }
  return { value: str, kind: 'text' };
}

export function evaluateFormula(formula, scope = {}, refNames = [], rows = null, opts = {}) {
  return evaluateFormulaTyped(formula, scope, refNames, rows, opts).value;
}

// Convenience: evaluate a { type, formula } value block. `type` 'number' takes
// the formula as a literal constant; 'text' returns it verbatim.
export function evaluateValueBlockTyped(block, scope, refNames, rows = null, opts = {}) {
  if (!block || typeof block !== 'object') return NOTHING;
  if (block.type === 'number') {
    const n = toNumber(block.formula);
    return { value: Number.isNaN(n) ? 0 : n, kind: 'number' };
  }
  if (block.type === 'text') return { value: block.formula ?? '', kind: 'text' };
  return evaluateFormulaTyped(block.formula, scope, refNames, rows, opts);
}

export function evaluateValueBlock(block, scope, refNames, rows = null, opts = {}) {
  return evaluateValueBlockTyped(block, scope, refNames, rows, opts).value;
}
