// Evaluator for template formulas (Header / Title Card / Graph Data "Formula"
// type). Ported from tools-4 components/listing/formula.js — same
// recursive-descent parser (+ - * / ^, parens, the word "power" as ^),
// NEVER eval()/Function(). Adapted so `scope` is a flat { [name]: value } map
// instead of a row + headers pair: a reference [Total Order] resolves to
// scope['Total Order'] directly.
//
// Two auto-detected modes per call:
//  - Arithmetic, when every [ref] resolves to a number — "[MRP] * 1.5".
//  - Text join, when at least one [ref] resolves to non-numeric text —
//    "[Brand]-[Sku Name]" concatenates; operators/numbers become literal text.
//
// Returns a number (2dp, arithmetic), a string (text-join), or '' when
// unresolvable (missing / blank ref, or malformed syntax) — never throws.

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Longest-label-first alternation so "[Ads %]" wins over a stray "Ads".
function buildTokenRegex(refNames) {
  const labels = [...new Set((refNames || []).map((n) => String(n).trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex);
  const group = labels.length ? labels.join('|') : '[^\\s\\S]';
  return new RegExp(`\\[(${group})\\]|(${group})|(\\d+(?:\\.\\d+)?)|(power)|([+\\-*/^()])`, 'gi');
}

function tokenize(formula, refNames) {
  const re = buildTokenRegex(refNames);
  const tokens = [];
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(formula))) {
    if (m[1] !== undefined) tokens.push({ type: 'ref', name: m[1].trim(), raw: m[0] });
    else if (m[2] !== undefined) tokens.push({ type: 'ref', name: m[2].trim(), raw: m[0] });
    else if (m[3] !== undefined) tokens.push({ type: 'num', value: parseFloat(m[3]), raw: m[3] });
    else if (m[4] !== undefined) tokens.push({ type: 'op', value: '^', raw: m[4] });
    else if (m[5] === '(') tokens.push({ type: 'lparen', raw: '(' });
    else if (m[5] === ')') tokens.push({ type: 'rparen', raw: ')' });
    else if (m[5] !== undefined) tokens.push({ type: 'op', value: m[5], raw: m[5] });
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
    return parseFactor();
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

function toNumber(raw) {
  if (raw == null || raw === '') return NaN;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
  const cleaned = String(raw).replace(/[₹$,\s]/g, '').replace(/%$/, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

// Resolve one bracket's inner content: a direct scope hit, else an arithmetic
// sub-expression over scope refs.
function resolveInner(inner, scope, refNames) {
  if (Object.prototype.hasOwnProperty.call(scope, inner.trim())) {
    const raw = scope[inner.trim()];
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

export function evaluateFormula(formula, scope = {}, refNames = []) {
  if (formula == null || !String(formula).trim()) return '';
  const trimmed = String(formula).trim();

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
export function evaluateValueBlock(block, scope, refNames) {
  if (!block || typeof block !== 'object') return '';
  if (block.type === 'number') {
    const n = toNumber(block.formula);
    return Number.isNaN(n) ? 0 : n;
  }
  if (block.type === 'text') return block.formula ?? '';
  return evaluateFormula(block.formula, scope, refNames);
}
