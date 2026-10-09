// Display formatting for the dashboard. Table cells show bare numbers (to
// match the reference); KPI cards prefix ₹.

import { fmtDate, fmtDays } from './dates';

export function fmtMoney(n, { symbol = false } = {}) {
  const v = Number(n) || 0;
  const rounded = Math.abs(v) < 1000 ? Math.round(v * 100) / 100 : Math.round(v);
  const body = Number.isInteger(rounded) ? String(rounded) : String(rounded);
  return symbol ? `₹${body}` : body;
}

export function fmtInt(n) {
  return String(Math.round(Number(n) || 0));
}

export function fmtPct(n) {
  const v = Number(n) || 0;
  return `${Number.isInteger(v) ? v : Math.round(v * 10) / 10}%`;
}

export function fmtCell(value, type) {
  switch (type) {
    case 'money': return fmtMoney(value);
    case 'int': return fmtInt(value);
    case 'pct': return fmtPct(value);
    default: return value == null ? '' : String(value);
  }
}

// A value that came out of a formula typed (lib/profitLoss/formula.js): a
// date (a timestamp) shows as its local date, a day count as "3 days";
// anything else by `format`.
export function fmtTyped(value, kind, format) {
  if (kind === 'date') return typeof value === 'number' ? fmtDate(value) : (value == null ? '' : String(value));
  if (kind === 'days') return value === '' || value == null ? '' : fmtDays(value);
  return fmtCell(value, format);
}

// One table cell of `header`. `kind` = what its value turned out to be, when
// that is a date or a day count (a Date header, a formula over dates).
export function fmtHeaderCell(header, raw, kind) {
  if (kind === 'date' || kind === 'days') return fmtTyped(raw, kind);
  if (header.type === 'date') return typeof raw === 'number' ? fmtDate(raw) : (raw == null ? '' : String(raw));
  if (header.type === 'text' || header.type === 'alphanumeric') return raw == null ? '' : String(raw);
  return fmtCell(raw, header.format);
}
