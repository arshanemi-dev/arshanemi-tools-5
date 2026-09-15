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

function iso(d) {
  return d.toISOString().slice(0, 10);
}

export function todayISO() {
  return iso(new Date());
}

// preset id → { from, to } (ISO date strings). 'custom' returns nulls — the
// caller supplies from/to itself.
export function rangeForPreset(id) {
  if (id === 'custom') return { from: null, to: null };
  const preset = DATE_PRESETS.find((p) => p.id === id) ?? DATE_PRESETS[0];
  const to = new Date();
  const from = new Date();
  if (preset.days) from.setDate(from.getDate() - preset.days);
  else from.setMonth(from.getMonth() - (preset.months || 0));
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
