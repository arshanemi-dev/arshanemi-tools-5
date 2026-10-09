import { SKU_COST_FIELDS, normName } from '@/data/fixedHeaders';
import { parseNumberish } from '@/data/platforms/canonical';

// Per-SKU costs — what the four fixed cost headers (data/fixedHeaders.js
// SKU_COST_FIELDS: COGS (Product Cost), Cost GST in, Final Product Cost,
// Other Expense (per order)) show on the dashboard. One record per SKU:
//   { [sku]: { cogs, costGst, finalCost, otherExpense } }   (numbers; a
//   field with no value is simply absent)
// Filled from the SKU Cost sheet (lib/sheet/skuCostTemplate.js writes it,
// parseSkuCostSheet in lib/sheet/parseWorkbook.js reads it back) or, for
// `cogs` alone, the table's inline Cost input. Kept per user in
// preferences.skuCosts (lib/profitLoss/useDashboardSettings.js). All pure.

const FIELD_KEYS = SKU_COST_FIELDS.map((f) => f.key);

// A canonical row with no SKU of its own carries this placeholder.
export const isRealSku = (sku) => !!String(sku ?? '').trim() && String(sku).trim() !== '—';

// Which cost field an uploaded sheet's column is, by its header text — the
// field's own name, a known other spelling, or an older sheet's "Cost".
const FIELD_BY_COLUMN = new Map(SKU_COST_FIELDS.flatMap(
  (f) => [f.name, ...(f.aliases || []), ...(f.sheetAliases || [])].map((name) => [normName(name), f.key]),
));
export const skuCostFieldFor = (column) => FIELD_BY_COLUMN.get(normName(column)) || null;

// Whatever was saved → the record shape above. preferences.skuCosts used to
// be { [sku]: unit cost } — that number is the SKU's COGS.
export function normalizeSkuCosts(saved) {
  const out = {};
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return out;
  for (const [sku, value] of Object.entries(saved)) {
    const rec = {};
    if (value && typeof value === 'object') {
      for (const k of FIELD_KEYS) {
        const n = parseNumberish(value[k]);
        if (Number.isFinite(n)) rec[k] = n;
      }
    } else {
      const n = parseNumberish(value);
      if (Number.isFinite(n)) rec.cogs = n;
    }
    if (Object.keys(rec).length) out[sku] = rec;
  }
  return out;
}

// An uploaded sheet's rows laid over what's saved. `incoming` =
// { [sku]: { [field]: number | null } } — only the fields the sheet has a
// column for: a number sets the field, null (an emptied cell) clears it. A
// SKU the sheet doesn't list, and a field it has no column for, keep what
// they had.
export function mergeSkuCosts(saved, incoming) {
  const next = { ...saved };
  for (const [sku, fields] of Object.entries(incoming || {})) {
    const rec = { ...(next[sku] || {}) };
    for (const [k, v] of Object.entries(fields)) {
      if (v == null) delete rec[k]; else rec[k] = v;
    }
    if (Object.keys(rec).length) next[sku] = rec; else delete next[sku];
  }
  return next;
}

// One field of one SKU set from typed text ('' clears it; text that isn't a
// number changes nothing) — the table's inline Cost input, for `cogs`.
export function withSkuCostField(costs, sku, field, rawValue) {
  const text = String(rawValue ?? '').trim();
  const n = Number(text);
  if (text !== '' && !Number.isFinite(n)) return costs;
  return mergeSkuCosts(costs, { [sku]: { [field]: text === '' ? null : n } });
}

// { [sku]: cogs } — the unit cost the P&L engine (lib/profitLoss/engine.js
// skuCostMap) and the inline Cost input work with.
export function unitCostMap(costs) {
  const out = {};
  for (const [sku, rec] of Object.entries(costs || {})) {
    if (Number.isFinite(rec?.cogs)) out[sku] = rec.cogs;
  }
  return out;
}

// Canonical rows with each one's SKU record attached as `row.skuCost` — where
// readHeaderFromRow reads the fixed cost headers from, so every order row
// carries its SKU's costs the way it would if the sheet had those columns.
// Rows are only copied when there is something to attach; these copies are
// for resolving the dashboard, never what gets saved.
export function withSkuCosts(rows, costs) {
  if (!costs || !Object.keys(costs).length) return rows;
  return rows.map((r) => (Object.hasOwn(costs, r.sku) ? { ...r, skuCost: costs[r.sku] } : r));
}
