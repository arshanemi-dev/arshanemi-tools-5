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
// against an optional `rows` array (one flat scope per row in the current
// group) before the rest of the formula is parsed — see applyAggregateFns.
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

// SUM([Header]) / COUNT([Header]) — the two aggregate operators. `rows` is an
// array of flat { [name]: value } scopes, one per row in the current group
// (resolveTemplate builds this from the resolved table). SUM adds the
// column's numeric values; COUNT counts its non-blank values. Resolved as a
// string-substitution pass BEFORE tokenizing, so the result folds into the
// surrounding arithmetic like any other number — "SUM([MRP]) * 1.1" works.
// With no `rows` context (a single-row scope, e.g. inside a per-row Header
// formula with no group to sum over) SUM/COUNT fall back to that row alone.
const AGG_FN_RE = /\b(SUM|COUNT)\s*\(\s*\[([^[\]]+)\]\s*\)/gi;

function applyAggregateFns(formula, scope, rows, refNames) {
  if (!formula || !AGG_FN_RE.test(formula)) return formula;
  AGG_FN_RE.lastIndex = 0;
  const labels = refLabels(refNames);
  return formula.replace(AGG_FN_RE, (match, fn, refName) => {
    const name = canonicalRef(refName.trim(), labels);
    const values = Array.isArray(rows) ? rows.map((r) => r[name]) : [scope[name]];
    if (fn.toUpperCase() === 'COUNT') {
      const n = values.filter((v) => v != null && String(v).trim() !== '').length;
      return String(n);
    }
    const n = values.reduce((acc, v) => {
      const num = toNumber(v);
      return acc + (Number.isNaN(num) ? 0 : num);
    }, 0);
    return String(Math.round(n * 100) / 100);
  });
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
