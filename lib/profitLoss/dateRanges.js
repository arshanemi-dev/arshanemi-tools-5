// Date-filter presets for the "Date ▾" popover.
export const DATE_PRESETS = [
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
  from.setMonth(from.getMonth() - preset.months);
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
