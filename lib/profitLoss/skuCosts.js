import { SKU_COST_FIELDS, normName } from '@/data/fixedHeaders';
import { parseNumberish } from '@/data/platforms/canonical';

// Per-SKU costs — what the four fixed cost headers (data/fixedHeaders.js
// SKU_COST_FIELDS: Product Cost, Product GST In, Final Product Cost,
// Office Expense (Per Order)) show on the dashboard.
//
// Two things, kept apart:
//  - A SKU's DEFAULT costs, one record per SKU:
//      { [sku]: { cogs, costGst, finalCost, otherExpense } }   (numbers; a
//      field with no value is simply absent)
//    Filled from the SKU Cost sheet (lib/sheet/skuCostTemplate.js writes it,
//    parseSkuCostSheet in lib/sheet/parseWorkbook.js reads it back) or typed
//    straight into the table — each cost header's own column is an input on
//    a SKU's row (components/dashboard/CostCell.jsx). Kept per user in the
//    hub's profit_loss_sku_costs table (lib/profitLoss/useSkuCosts.js).
//  - An ORDER's own costs, `row.skuCost` — the same record shape, on the
//    canonical row and saved with it. Its SKU's default is written onto an
//    order when the order is uploaded (stampSkuCosts) and stays: changing a
//    default afterwards prices what is uploaded next, never what already
//    carries a price. An order uploaded before its SKU had a default carries
//    none and shows the SKU's default as it stands (withSkuCosts) until the
//    next upload of that SKU writes it on.
// All pure.

const FIELD_KEYS = SKU_COST_FIELDS.map((f) => f.key);
// The fields that hold text (the Master SKU), not a cost.
const TEXT_KEYS = new Set(SKU_COST_FIELDS.filter((f) => f.type === 'text').map((f) => f.key));
export const isTextCostField = (field) => TEXT_KEYS.has(field);
const MAX_TEXT = 255; // the hub's master_sku column
// Does `v` count as a value for this field — a number for a cost, non-blank
// text for a text field?
const hasValue = (field, v) => (TEXT_KEYS.has(field) ? typeof v === 'string' && v.trim() !== '' : Number.isFinite(v));

// Does this header's value equal the row's SKU — so a table / Overview level
// keyed on it has SKUs for rows and gets the SKU input boxes (Master SKU,
// the costs)? The built-in Sku Name header (primitive 'sku'), or a Formula
// that is nothing but a copy of one: "[Sku Name]", "=[Sku Name]", "Sku Name"
// (formula.js passes such a formula's value through exactly — "SKU ID").
const SKU_COPY_RE = /^=?\s*\[?\s*([^[\]]+?)\s*\]?\s*$/;
export function isSkuHeader(header, headers = [], seen = new Set()) {
  if (!header) return false;
  if (header.primitive === 'sku') return true;
  if (header.type !== 'formula' || !header.formula || seen.has(header.id)) return false;
  const m = SKU_COPY_RE.exec(String(header.formula));
  if (!m) return false;
  const name = m[1].toLowerCase();
  const target = headers.find((h) => String(h.name ?? '').trim().toLowerCase() === name);
  return !!target && isSkuHeader(target, headers, new Set(seen).add(header.id));
}

// A canonical row with no SKU of its own carries this placeholder.
export const isRealSku = (sku) => !!String(sku ?? '').trim() && String(sku).trim() !== '—';

// The cost field a header's column types into — 'cogs', 'costGst', … — or
// null: any other header, and a cost header that was built as a formula (its
// value is worked out, not typed).
export const costFieldOf = (header) => (header?.type !== 'formula' && FIELD_KEYS.includes(header?.fixedKey) ? header.fixedKey : null);

// One cost of one SKU as a single key — which cells are typed-but-not-saved
// is kept as a Set of these (lib/profitLoss/useSkuCosts.js).
const CELL_SEP = '\u0000';
export const costCellKey = (sku, field) => `${sku}${CELL_SEP}${field}`;
export function costCellOf(key) {
  const at = key.lastIndexOf(CELL_SEP);
  return [key.slice(0, at), key.slice(at + 1)];
}

// The hub's list ([{ sku, cogs?, costGst?, finalCost?, otherExpense? }] —
// GET /api/profit-loss/sku-costs) → the per-SKU map above.
export function skuCostsFromList(list) {
  return normalizeSkuCosts(Object.fromEntries((Array.isArray(list) ? list : []).filter((item) => item?.sku != null).map((item) => [item.sku, item])));
}

// What differs between two per-SKU maps, as items to save ([{ sku, <cost>:
// number | null }] — PUT /api/profit-loss/sku-costs): each cost that isn't
// what it was, null for one that is gone. A SKU with nothing changed isn't
// listed, so an uploaded sheet only sends what it actually altered.
export function changedCostItems(before, after) {
  const items = [];
  for (const sku of new Set([...Object.keys(before || {}), ...Object.keys(after || {})])) {
    const item = { sku };
    for (const k of FIELD_KEYS) {
      const was = hasValue(k, before?.[sku]?.[k]) ? before[sku][k] : null;
      const now = hasValue(k, after?.[sku]?.[k]) ? after[sku][k] : null;
      if (was !== now) item[k] = now;
    }
    if (Object.keys(item).length > 1) items.push(item);
  }
  return items;
}

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
        if (TEXT_KEYS.has(k)) {
          const t = typeof value[k] === 'string' ? value[k].trim() : '';
          if (t) rec[k] = t;
          continue;
        }
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

// One field of one SKU set from typed text ('' clears it; for a cost, text
// that isn't a number changes nothing — `costs` itself comes back; the
// Master SKU keeps the text) — a table input box.
export function withSkuCostField(costs, sku, field, rawValue) {
  const text = String(rawValue ?? '').trim();
  // A text field (Master SKU) takes the text as typed.
  if (TEXT_KEYS.has(field)) return mergeSkuCosts(costs, { [sku]: { [field]: text === '' ? null : text.slice(0, MAX_TEXT) } });
  const n = Number(text);
  if (text !== '' && !Number.isFinite(n)) return costs;
  return mergeSkuCosts(costs, { [sku]: { [field]: text === '' ? null : n } });
}

// { [sku]: cogs } — each SKU's default unit cost, what the P&L engine
// (lib/profitLoss/engine.js skuCostMap) prices an order with when the order
// carries no COGS of its own.
export function unitCostMap(costs) {
  const out = {};
  for (const [sku, rec] of Object.entries(costs || {})) {
    if (Number.isFinite(rec?.cogs)) out[sku] = rec.cogs;
  }
  return out;
}

// One row with its SKU's default laid UNDER the costs it already carries:
// its own costs stay, a cost it has none of takes the default. → the row
// itself when the default adds nothing.
function underlaid(row, record) {
  if (!record) return row;
  let costs = null;
  for (const k of FIELD_KEYS) {
    if (!hasValue(k, record[k]) || hasValue(k, row.skuCost?.[k])) continue;
    costs = costs || { ...(row.skuCost || {}) };
    costs[k] = record[k];
  }
  return costs ? { ...row, skuCost: costs } : row;
}

// Every row through underlaid (`skus`: only the rows of those SKUs) → the
// same array when nothing changed, so a caller holding it in state can tell.
function underlay(rows, costs, skus = null) {
  if (!costs || !Object.keys(costs).length) return rows;
  let changed = false;
  const out = rows.map((r) => {
    if ((skus && !skus.has(r.sku)) || !Object.hasOwn(costs, r.sku)) return r;
    const next = underlaid(r, costs[r.sku]);
    if (next !== r) changed = true;
    return next;
  });
  return changed ? out : rows;
}

// Canonical rows as the dashboard is resolved from them: each carries the
// costs written onto it at upload, and — for any cost it has none of — its
// SKU's default as it stands (`costs`). `row.skuCost` is where
// readHeaderFromRow reads the fixed cost headers from, and the engine an
// order's unit cost. These copies are for resolving only, never what gets
// saved — an order with no price of its own must stay that way in storage,
// or it would stop following its SKU's default.
export function withSkuCosts(rows, costs) {
  return underlay(rows, costs);
}

// Writes the defaults onto rows for good — what an upload does, to the rows
// it brings in and (`skus` = the SKUs in that upload) to the older rows of
// the same SKUs that still had no price. The result is kept and saved: from
// here on those orders have their own price and a later default doesn't
// reach them. Same array back when there was nothing to write.
export function stampSkuCosts(rows, costs, skus = null) {
  return underlay(rows, costs, skus);
}
