// Display formatting for the dashboard. Table cells show bare numbers (to
// match the reference); KPI cards prefix ₹.

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
