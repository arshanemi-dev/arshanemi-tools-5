// The headers every Global Settings config has built in on top of the two
// required ones (Order Id / Transaction Id — data/templateSchema.js). Locked
// the same way — name and type can't be changed, no Delete — but never
// required to be mapped, because the dashboard fills them itself:
//   - Account Name: the "MarketPlace_Brand" picked in the dashboard toolbar
//     before an upload (row.company).
//   - the four cost headers: per SKU, from the SKU Cost sheet — Download SKU
//     Cost, fill it in, Upload SKU Cost (lib/profitLoss/skuCosts.js).
// lib/profitLoss/resolveTemplate.js readHeaderFromRow is where both are read.
//
// A fixed header is found by `fixedKey`, not by id: a config saved before
// these were built in already has headers with these names under their own
// generated ids, and Tabs / Overview Tabs / mappings / My Details ticks all
// point at those ids — withFixedHeaders adopts them in place rather than
// adding a second header beside each. Client-side only: the hub's
// lib/templateConfig.js stores a header as it is given and doesn't need to
// know about these.

export const ACCOUNT_NAME_KEY = 'accountName';

// `aliases` = other spellings of an existing header that is adopted as this
// one; `sheetAliases` = further column names an uploaded SKU Cost sheet may
// use for it (an older sheet's "Cost"). Both compared through normName.
export const FIXED_HEADERS = [
  {
    key: ACCOUNT_NAME_KEY,
    id: 'hdr_account_name',
    name: 'Account Name',
    type: 'text',
    hint: 'Filled with the Market Place_Brand picked on the dashboard before an upload.',
  },
  {
    key: 'cogs',
    id: 'hdr_cogs_product_cost',
    name: 'COGS (Product Cost)',
    type: 'number',
    skuCost: true,
    sheetAliases: ['COGS', 'Cost', 'Unit Cost', 'Product Cost', 'Cost Price', 'Purchase Price', 'Buy Price'],
  },
  { key: 'costGst', id: 'hdr_cost_gst_in', name: 'Cost GST in', type: 'number', skuCost: true, sheetAliases: ['Cost GST'] },
  { key: 'finalCost', id: 'hdr_final_product_cost', name: 'Final Product Cost', type: 'number', skuCost: true, sheetAliases: ['Final Cost'] },
  {
    key: 'otherExpense',
    id: 'hdr_other_expense_per_order',
    name: 'Other Expense (per order)',
    type: 'number',
    skuCost: true,
    aliases: ['Other Expanse (per order)'],
    sheetAliases: ['Other Expense', 'Other Expanse'],
  },
];

// The fixed headers the SKU Cost sheet carries, in its column order.
export const SKU_COST_FIELDS = FIXED_HEADERS.filter((f) => f.skuCost);
const SKU_COST_HINT = 'Filled per SKU from the SKU Cost sheet — Download SKU Cost, fill it in, Upload SKU Cost.';

const BY_KEY = new Map(FIXED_HEADERS.map((f) => [f.key, f]));

// "Other Expanse (per order )" and "other expanse (per order)" are one name.
export const normName = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export const isFixedHeader = (h) => !!h?.fixedKey && BY_KEY.has(h.fixedKey);

// Why this header is locked, for the Edit popup. '' for any other header.
export function fixedHeaderHint(h) {
  const def = BY_KEY.get(h?.fixedKey);
  return def ? def.hint || SKU_COST_HINT : '';
}

const formatFor = (def, current) => (def.type === 'text' ? 'text' : ['money', 'int', 'pct'].includes(current) ? current : 'money');

function makeFixedHeader(def) {
  return {
    id: def.id,
    name: def.name,
    type: def.type,
    formula: '',
    source: 'default',
    primitive: null,
    mappedFrom: null,
    note: '',
    format: formatFor(def),
    signed: false,
    showInTable: true,
    reserved: true,
    fixedKey: def.key,
  };
}

export function makeFixedHeaders() {
  return FIXED_HEADERS.map(makeFixedHeader);
}

// The header already standing in for `def`: stamped with its key, else under
// its built-in id, else an unlocked header with its name (the exact name
// before any alias).
function existingFor(def, headers) {
  const named = (name) => headers.find((h) => h && !h.fixedKey && !h.reserved && normName(h.name) === normName(name));
  return headers.find((h) => h?.fixedKey === def.key)
    || headers.find((h) => h?.id === def.id && !h.fixedKey)
    || [def.name, ...(def.aliases || [])].map(named).find(Boolean)
    || null;
}

// `[Old Name]` → `[New Name]` in one formula, for a header renamed below.
function renameRefs(formula, renames) {
  if (!formula || typeof formula !== 'string') return formula;
  return formula.replace(/\[([^[\]]+)\]/g, (whole, ref) => {
    const to = renames.get(ref.trim().toLowerCase());
    return to ? `[${to}]` : whole;
  });
}

const sameHeader = (a, b) => Object.keys(b).every((k) => a[k] === b[k]);

// `config` with every fixed header present and locked: an existing header
// that already is one (see existingFor) keeps its id, position, format and
// Show-in-table and just gets the fixed name / type / lock; any that is
// missing is added at the end. One that was built as a Formula keeps its
// formula — only its name is locked — instead of losing it to the fixed
// type. A header renamed on the way ("Other Expanse (per order )" → "Other
// Expense (per order)") is renamed in every formula that names it. A config
// with no headers at all — nothing published yet — stays as it is. Returns
// `config` itself when nothing changed. Pure.
export function withFixedHeaders(config) {
  const current = Array.isArray(config?.headers) ? config.headers : [];
  if (!current.length) return config;

  let headers = current;
  const renames = new Map(); // lower-cased old name → new name
  for (const def of FIXED_HEADERS) {
    const existing = existingFor(def, headers);
    if (!existing) { headers = [...headers, makeFixedHeader(def)]; continue; }
    const computed = existing.type === 'formula' && !!existing.formula;
    const fixed = {
      ...existing,
      name: def.name,
      type: computed ? 'formula' : def.type,
      formula: computed ? existing.formula : '',
      primitive: null,
      source: 'default',
      format: computed ? existing.format : formatFor(def, existing.format),
      reserved: true,
      fixedKey: def.key,
    };
    if (sameHeader(existing, fixed)) continue;
    const oldName = String(existing.name ?? '').trim();
    if (oldName && oldName !== def.name) renames.set(oldName.toLowerCase(), def.name);
    headers = headers.map((h) => (h === existing ? fixed : h));
  }
  if (headers === current) return config;

  const next = { ...config, headers };
  if (!renames.size) return next;
  next.headers = headers.map((h) => (h.type === 'formula' && h.formula ? { ...h, formula: renameRefs(h.formula, renames) } : h));
  if (Array.isArray(config.titleCards)) {
    const fix = (v) => (v?.formula ? { ...v, formula: renameRefs(v.formula, renames) } : v);
    next.titleCards = config.titleCards.map((c) => ({ ...c, mainValue: fix(c.mainValue), subValue: fix(c.subValue) }));
  }
  return next;
}
