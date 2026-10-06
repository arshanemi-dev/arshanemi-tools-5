// Date-filter presets for the "Date ▾" popover. '7d' is the dashboard's
// default (see DEFAULT_RANGE in DashboardWorkspace.jsx) — keeps the live
// view's recompute cheap; Download PDF/Excel always ignores it and exports
// every row regardless of preset.
export const DATE_PRESETS = [
  { id: '7d', label: '7 Days', days: 7 },
  { id: '1m', label: '1 Month', months: 1 },
  { id: '6m', label: '6 Months', months: 6 },
  { id: '1y', label: '1 Year', months: 12 },
  { id: 'custom', label: 'Custom', months: null },
];

const pad = (n) => String(n).padStart(2, '0');

// The viewer's own calendar day — NOT toISOString(), which is the UTC day:
// from midnight to 5:30 AM in India that's still yesterday, so "today"
// couldn't be picked and every preset stopped a day short.
function iso(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO() {
  return iso(new Date());
}

// `n` calendar months before `d`, same day of the month — clamped to that
// month's last day. (setMonth alone overflows: 31 March minus one month is
// "31 February", which JavaScript rolls forward to 3 March.)
function monthsBefore(d, n) {
  const first = new Date(d.getFullYear(), d.getMonth() - n, 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  first.setDate(Math.min(d.getDate(), lastDay));
  return first;
}

// preset id → { from, to } (ISO date strings). 'custom' returns nulls — the
// caller supplies from/to itself.
export function rangeForPreset(id) {
  if (id === 'custom') return { from: null, to: null };
  const preset = DATE_PRESETS.find((p) => p.id === id) ?? DATE_PRESETS[0];
  const to = new Date();
  let from = new Date();
  if (preset.days) from.setDate(from.getDate() - preset.days);
  else from = monthsBefore(to, preset.months || 0);
  return { from: iso(from), to: iso(to) };
}

// Validate a custom range. Returns { ok, error }.
export function validateCustomRange(from, to) {
  if (!from || !to) return { ok: false, error: 'Pick both a From and a To date' };
  if (from > to) return { ok: false, error: 'From date must be on or before To date' };
  if (to > todayISO()) return { ok: false, error: 'To date can’t be in the future' };
  return { ok: true, error: null };
}

export function labelForRange(preset, from, to) {
  if (preset && preset !== 'custom') {
    return DATE_PRESETS.find((p) => p.id === preset)?.label ?? 'Date';
  }
  if (from && to) return `${from} → ${to}`;
  return 'Date';
}
