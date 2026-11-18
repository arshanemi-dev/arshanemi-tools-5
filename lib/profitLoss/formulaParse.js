// The arithmetic half of lib/profitLoss/formula.js: typed operands and the
// recursive-descent parser over already-resolved tokens. NEVER eval().

import { addDays, daysBetween } from './dates';

// What everything here throws when a formula has no answer (a date where a
// number has to be, a bracket left open, …). One error made once and thrown
// each time: the caller only ever catches it to mean "no answer", and a
// formula that can't be worked out fails the same way for every row group —
// making a fresh Error (and its stack trace) each time was a large share of
// what such a formula cost a dashboard update.
const NO_ANSWER = new Error('formula has no answer');

// ── typed operands ─────────────────────────────────────────────────────────
// Arithmetic runs on { k, v }: a plain number ('num'), a date ('date', v = a
// timestamp) or a count of days ('days'). That is what makes
// [Settlement Date] - [Order Date] come out as days instead of a meaningless
// difference of two timestamps:
//   date − date → days (whole calendar days)   date ± n → date (n days on / back)
//   days ± days, days ± n → days               × ÷ ^ % → a plain number
// A date can't be multiplied, divided, negated, or added to another date —
// such a formula has no answer ('').
function addOperands(a, b, sign) {
  if (a.k === 'date' && b.k === 'date') {
    if (sign > 0) throw NO_ANSWER; // date + date
    return { k: 'days', v: daysBetween(a.v, b.v) };
  }
  if (a.k === 'date') return { k: 'date', v: addDays(a.v, sign * b.v) };
  if (b.k === 'date') {
    if (sign < 0) throw NO_ANSWER; // number − date
    return { k: 'date', v: addDays(b.v, a.v) };
  }
  return { k: a.k === 'days' || b.k === 'days' ? 'days' : 'num', v: a.v + sign * b.v };
}
const plain = (x) => {
  if (x.k === 'date') throw NO_ANSWER; // a date where a plain number has to be
  return x.v;
};
const num = (v) => ({ k: 'num', v });

// Precedence climbing over already-resolved (num/op/paren only) tokens — a
// num token may carry `kind` 'date' / 'days'. Returns a typed operand.
// The calculation functions a formula can call (formula.js tokenizes them):
//   IF(condition, then, else)   condition ≠ 0 → then, else → else (0 when left out)
//   ROUND(x, places)            places 0 when left out
//   ABS(x)  CEIL(x)  FLOOR(x)  SQRT(x)
// A condition is any comparison — [Profit] > 0, [Status Count] = 3,
// [A] <> [B], <=, >= — which is 1 when true and 0 when not.
const COMPARE_OPS = new Set(['<', '>', '<=', '>=', '=', '<>']);
function compare(op, a, b) {
  switch (op) {
    case '<': return a < b;
    case '>': return a > b;
    case '<=': return a <= b;
    case '>=': return a >= b;
    case '=': return Math.abs(a - b) < 1e-9;
    default: return Math.abs(a - b) >= 1e-9; // <>
  }
}
function callFn(name, args) {
  const one = () => {
    if (args.length !== 1) throw NO_ANSWER;
    return plain(args[0]);
  };
  switch (name) {
    case 'IF': {
      if (args.length < 2 || args.length > 3) throw NO_ANSWER;
      return args[0].v !== 0 ? args[1] : (args[2] ?? num(0));
    }
    case 'ROUND': {
      if (!args.length || args.length > 2) throw NO_ANSWER;
      const places = args[1] ? Math.trunc(plain(args[1])) : 0;
      const f = 10 ** places;
      const x = plain(args[0]);
      return { k: args[0].k, v: Math.sign(x) * Math.round(Math.abs(x) * f) / f };
    }
    case 'ABS': return num(Math.abs(one()));
    case 'CEIL': return num(Math.ceil(one()));
    case 'FLOOR': return num(Math.floor(one()));
    case 'SQRT': {
      const x = one();
      if (x < 0) throw NO_ANSWER;
      return num(Math.sqrt(x));
    }
    default: throw NO_ANSWER;
  }
}

export function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  // Lowest: a comparison of two sums — 1 when it holds, else 0.
  function parseCompare() {
    let left = parseExpr();
    while (peek()?.type === 'op' && COMPARE_OPS.has(peek().value)) {
      const op = next().value;
      const right = parseExpr();
      // Dates compare as dates, days as days; a date against a number has no answer.
      if ((left.k === 'date') !== (right.k === 'date')) throw NO_ANSWER;
      left = num(compare(op, left.v, right.v) ? 1 : 0);
    }
    return left;
  }
  function parseExpr() {
    let left = parseTerm();
    while (peek()?.type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = next().value;
      const right = parseTerm();
      left = addOperands(left, right, op === '+' ? 1 : -1);
    }
    return left;
  }
  function parseTerm() {
    let left = parsePower();
    while (peek()?.type === 'op' && (peek().value === '*' || peek().value === '/')) {
      const op = next().value;
      const right = parsePower();
      left = num(op === '*' ? plain(left) * plain(right) : plain(left) / plain(right));
    }
    return left;
  }
  function parsePower() {
    const base = parseUnary();
    if (peek()?.type === 'op' && peek().value === '^') {
      next();
      return num(Math.pow(plain(base), plain(parsePower())));
    }
    return base;
  }
  function parseUnary() {
    if (peek()?.type === 'op' && peek().value === '-') {
      next();
      const x = parseUnary();
      return { k: x.k, v: -plain(x) };
    }
    return parsePercent();
  }
  // A trailing "%" is a percentage, as in a spreadsheet: "[MRP] * 18%" is
  // 18 per cent of MRP. (It used to be dropped, giving MRP × 18.)
  function parsePercent() {
    let val = parseFactor();
    while (peek()?.type === 'op' && peek().value === '%') {
      next();
      val = num(plain(val) / 100);
    }
    return val;
  }
  function parseFactor() {
    const t = next();
    if (!t) throw NO_ANSWER; // ended where a value should be
    if (t.type === 'num') return { k: t.kind || 'num', v: t.value };
    if (t.type === 'lparen') {
      const val = parseCompare();
      if (peek()?.type !== 'rparen') throw NO_ANSWER; // missing )
      next();
      return val;
    }
    // NAME( — its "(" is part of the token: arguments split by commas, then ")".
    if (t.type === 'func') {
      const args = [];
      if (peek()?.type !== 'rparen') {
        args.push(parseCompare());
        while (peek()?.type === 'comma') { next(); args.push(parseCompare()); }
      }
      if (peek()?.type !== 'rparen') throw NO_ANSWER; // missing )
      next();
      return callFn(t.name, args);
    }
    throw NO_ANSWER; // an operator where a value should be
  }

  if (!tokens.length) throw NO_ANSWER; // nothing to work out
  const result = parseCompare();
  if (pos !== tokens.length) throw NO_ANSWER; // something left over
  return result;
}
