// The shapes of the two config objects Template Settings now edits, plus the
// factory + validation helpers the builder uses. The hub has a parallel
// structural gate in lib/templateConfig.js — keep the two in sync.
//
// Split in two (previously one per-marketplace `config` held everything):
//   - the GLOBAL config — Headers, Title Cards, Graphs, Tabs, Overview Tabs —
//     one shared definition every marketplace's dashboard renders identically.
//   - a MARKETPLACE config — just its file-upload slots + the mapping from
//     that marketplace's raw sheet columns to the global headers.
// Switching marketplace on the dashboard therefore only changes where the
// data comes from, never what's shown. lib/profitLoss/engine.js still
// supplies base metrics; the dashboard is a pure renderer of {global config +
// active marketplace's fileSlots}.

import { nanoid } from 'nanoid';

export const CONFIG_SCHEMA_VERSION = 1;

export const HEADER_TYPES = ['formula', 'number', 'text', 'alphanumeric'];
export const VALUE_TYPES = ['formula', 'number', 'text']; // title-card / series measure
export const CHART_TYPES = ['line', 'bar', 'area', 'pie'];
export const CHART_LABELS = { line: 'Line chart', bar: 'Bar chart', area: 'Area chart', pie: 'Pie chart' };
export const FORMATS = ['money', 'int', 'pct', 'text'];
export const TIME_UNITS = ['day', 'week', 'month'];

// Scalar tokens the resolver injects into every formula scope (row + aggregate)
// on top of the template's own headers — see data/defaultHeaders.js
// AGGREGATE_BUILTINS. Kept here too so validateGlobalConfig accepts them as refs.
export const AGGREGATE_BUILTIN_NAMES = ['Ads %', 'SKU Count', 'Settled SKU Count', 'Row Count'];

export const FILE_SLOT_KINDS = ['payment', 'order', 'aux'];

// ── reserved global headers ─────────────────────────────────────────────────
// Every marketplace must map both to a sheet column before it can be
// published live (see validateMarketplaceConfig) — they're the canonical
// join/identity keys the P&L tool relies on regardless of marketplace. Fixed
// (not generated) ids so the check always has something stable to look for;
// the builder disables Delete (and locks name/type) for these two.
export const RESERVED_HEADER_IDS = {
  orderId: 'hdr_order_id',
  transactionId: 'hdr_transaction_id',
};
export const RESERVED_HEADER_ID_LIST = Object.values(RESERVED_HEADER_IDS);

function makeReservedHeader(id, name) {
  return {
    id,
    name,
    type: 'text',
    formula: '',
    source: 'default',
    primitive: null,
    mappedFrom: null,
    note: '',
    format: 'text',
    signed: false,
    showInTable: true,
    reserved: true,
  };
}

export function isReservedHeaderId(id) {
  return RESERVED_HEADER_ID_LIST.includes(id);
}

// ── id helper ──────────────────────────────────────────────────────────────
export function newId(prefix = 'x') {
  return `${prefix}_${nanoid(8)}`;
}

// ── factories ──────────────────────────────────────────────────────────────

// The one shared config — Headers, Title Cards, Graphs, Tabs, Overview Tabs.
export function makeEmptyGlobalConfig() {
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    headers: [
      makeReservedHeader(RESERVED_HEADER_IDS.orderId, 'Order Id'),
      makeReservedHeader(RESERVED_HEADER_IDS.transactionId, 'Transaction Id'),
    ],
    titleCards: [],
    graphs: [],
    tabs: [],
    overviewTabs: [],
  };
}

// One marketplace's config — just its files + column mapping. `headerId` in
// fileSlots[].mappings always points at a header from the global config.
export function makeEmptyMarketplaceConfig(marketplaceName = '') {
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    marketplace: {
      name: marketplaceName,
      companyHeaderId: null,
      brandHeaderId: null,
      groupByHeaderId: null,
    },
    fileSlots: [],
  };
}

export function makeFileSlot(label = 'File', kind = 'aux') {
  return {
    id: newId('slot'),
    label,
    kind,
    required: kind === 'payment',
    accept: '.csv,.xlsx,.xls,.pdf',
    multiple: kind !== 'order',
    headerRowIndex: 1,
    valueRowIndex: 2,
    sheetNameHint: '',
    extractedHeaders: [],
    sampleValues: {},
    mappings: [], // [{ sheetHeader, headerId }]
  };
}

export function makeHeader({ name = 'Header', type = 'number', source = 'manual' } = {}) {
  return {
    id: newId('hdr'),
    name,
    type,
    formula: '',
    source, // default | extracted | manual
    primitive: null, // default headers bind to an engine base metric
    mappedFrom: null, // { slot, sheetHeader } — set per marketplace at resolve time, not stored on the global header itself
    note: '',
    format: type === 'text' || type === 'alphanumeric' ? 'text' : 'money',
    signed: false,
    showInTable: true,
  };
}

export function makeValue(type = 'formula') {
  return { type, formula: '', format: 'money' };
}

export function makeTitleCard(name = 'Title Card') {
  return {
    id: newId('tc'),
    name,
    mainValue: makeValue('formula'),
    subValue: { ...makeValue('formula'), format: 'int' },
  };
}

// A Graph Design (its chart type) and its Graph Data (the headers it plots)
// are one entity — a chart type + the "Graph Header" list to draw. Pie charts
// need >= 2 headers (one slice each); line/bar/area take >= 1 header (one
// series each, plotted over a time bucket) and auto-split into one line/bar
// per selected header, same idea as the Header section's column list.
export function makeGraph(name = 'Graph', chartType = 'line') {
  return { id: newId('g'), name, chartType, headerIds: [] };
}

export function makeTab(name = 'Tab', order = 0) {
  return {
    id: newId('tab'),
    name,
    order,
    icon: 'LayoutDashboard',
    titleCardIds: [],
    graphIds: [],
    headerIds: [],
    layout: { titleCards: { columns: 4 }, graphs: [], tableDefaultView: 'all' },
  };
}

// An Overview tab is a pivot: one Fixed Header (a unique key, e.g. Sku Name —
// one row per value it takes) plus the other headers that aggregate within
// each group. There can be several of these, each its own tab in the
// dashboard sidebar (after the regular Tabs) as soon as it's created — no
// separate visibility toggle. Same as a Tab, it can also carry its own Title
// Cards (KPI band) and Graphs — those read the same global titleCardValues /
// graphSeries every Tab reads from, just a different picked subset.
export function makeOverviewTab(name = 'Overview', order = 0) {
  return {
    id: newId('ov'),
    name,
    order,
    fixedHeaderId: null,
    headerIds: [],
    titleCardIds: [],
    graphIds: [],
    layout: { titleCards: { columns: 4 } },
  };
}

// ── formula reference extraction (shared with resolveTemplate + validate) ───
export function refsIn(formula) {
  if (!formula || typeof formula !== 'string') return [];
  const out = [];
  const re = /\[([^[\]]+)\]/g;
  let m;
  while ((m = re.exec(formula))) out.push(m[1].trim());
  return out;
}

// ── validation (client mirror of hub lib/templateConfig.js) ────────────────
function hasFormulaCycle(headers) {
  const byName = new Map();
  for (const h of headers) if (h?.name) byName.set(String(h.name).trim().toLowerCase(), h);
  const state = new Map();
  const visit = (name) => {
    const key = String(name).trim().toLowerCase();
    const node = byName.get(key);
    if (!node) return false;
    if (state.get(key) === 1) return true;
    if (state.get(key) === 2) return false;
    if (node.type !== 'formula' || !node.formula) { state.set(key, 2); return false; }
    state.set(key, 1);
    for (const ref of refsIn(node.formula)) if (visit(ref)) return true;
    state.set(key, 2);
    return false;
  };
  for (const key of byName.keys()) if (visit(key)) return true;
  return false;
}

// Every section except Header must use each name at most once (headers are
// referenced by name in [brackets] and already need that uniqueness for a
// different reason — see knownRef/hasFormulaCycle above; a Tab is free to
// pick two headers that happen to share a display name, that's fine).
// `field` lets file slots reuse this against `label` instead of `name`.
function checkUniqueNames(list, label, push, field = 'name') {
  const seen = new Set();
  for (const it of list) {
    const key = String(it?.[field] || '').trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) push(`duplicate ${label} ${field}: "${it[field]}"`);
    seen.add(key);
  }
}

// UI-side check for one item's name field, to redden its input live as the
// user types — same rule as checkUniqueNames, just against a single item
// instead of collecting every violation in the list.
export function isDuplicateName(list, id, name, field = 'name') {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return false;
  return (list || []).some((it) => it?.id !== id && String(it?.[field] || '').trim().toLowerCase() === key);
}

// Headers / Title Cards / Graphs / Tabs / Overview Tabs — the shared config.
export function validateGlobalConfig(config) {
  const errors = [];
  const push = (m) => errors.push(m);
  if (!config || typeof config !== 'object') return { ok: false, errors: ['config must be an object'] };

  const { headers = [], titleCards = [], graphs = [], tabs = [], overviewTabs = [] } = config;

  const headerIds = new Set();
  const headerNames = new Set();
  for (const h of headers) {
    if (!h?.id) { push('every header needs an id'); continue; }
    if (headerIds.has(h.id)) push(`duplicate header id: ${h.id}`);
    headerIds.add(h.id);
    if (h.name) headerNames.add(String(h.name).trim().toLowerCase());
    if (h.type && !HEADER_TYPES.includes(h.type)) push(`header "${h.name || h.id}": bad type ${h.type}`);
  }
  for (const id of RESERVED_HEADER_ID_LIST) {
    if (!headerIds.has(id)) push(`missing required reserved header: ${id}`);
  }
  const knownRef = (ref) =>
    headerNames.has(ref.toLowerCase()) ||
    AGGREGATE_BUILTIN_NAMES.some((b) => b.toLowerCase() === ref.toLowerCase());

  for (const h of headers) {
    if (h?.type !== 'formula' || !h.formula) continue;
    for (const ref of refsIn(h.formula)) {
      if (!knownRef(ref)) push(`header "${h.name || h.id}" references unknown [${ref}]`);
    }
  }
  if (hasFormulaCycle(headers)) push('headers contain a circular formula reference');

  checkUniqueNames(titleCards, 'title card', push);
  const cardIds = new Set();
  for (const c of titleCards) {
    if (!c?.id) { push('every title card needs an id'); continue; }
    cardIds.add(c.id);
    for (const slot of ['mainValue', 'subValue']) {
      for (const ref of refsIn(c[slot]?.formula)) {
        if (!knownRef(ref)) push(`title card "${c.name || c.id}" ${slot} references unknown [${ref}]`);
      }
    }
  }

  checkUniqueNames(graphs, 'graph', push);
  const graphIds = new Set();
  for (const g of graphs) {
    if (!g?.id) { push('every graph needs an id'); continue; }
    graphIds.add(g.id);
    if (!CHART_TYPES.includes(g.chartType)) push(`graph "${g.name || g.id}": bad chartType ${g.chartType}`);
    const headerIdsUsed = Array.isArray(g.headerIds) ? g.headerIds : [];
    if (g.chartType === 'pie' && headerIdsUsed.length < 2) push(`pie graph "${g.name || g.id}" needs at least 2 headers`);
    if (g.chartType && g.chartType !== 'pie' && headerIdsUsed.length < 1) push(`graph "${g.name || g.id}" (${g.chartType}) needs at least 1 header`);
    for (const id of headerIdsUsed) if (!headerIds.has(id)) push(`graph "${g.name || g.id}" references unknown header`);
  }

  checkUniqueNames(tabs, 'tab', push);
  for (const t of tabs) {
    if (!t?.id) { push('every tab needs an id'); continue; }
    for (const id of t.titleCardIds || []) if (!cardIds.has(id)) push(`tab "${t.name || t.id}" references unknown title card`);
    for (const id of t.graphIds || []) if (!graphIds.has(id)) push(`tab "${t.name || t.id}" references unknown graph`);
    for (const id of t.headerIds || []) if (!headerIds.has(id)) push(`tab "${t.name || t.id}" references unknown header`);
  }

  checkUniqueNames(overviewTabs, 'overview tab', push);
  for (const ov of overviewTabs) {
    if (!ov?.id) { push('every overview tab needs an id'); continue; }
    for (const id of ov.headerIds || []) if (!headerIds.has(id)) push(`overview tab "${ov.name || ov.id}" references unknown header`);
    if (ov.fixedHeaderId && !headerIds.has(ov.fixedHeaderId)) push(`overview tab "${ov.name || ov.id}" fixed header references unknown header`);
    for (const id of ov.titleCardIds || []) if (!cardIds.has(id)) push(`overview tab "${ov.name || ov.id}" references unknown title card`);
    for (const id of ov.graphIds || []) if (!graphIds.has(id)) push(`overview tab "${ov.name || ov.id}" references unknown graph`);
  }

  return { ok: errors.length === 0, errors };
}

// One marketplace's file slots + mapping. `globalHeaderIds` (a Set) is the
// live global config's header id set, so a mapping can be checked against it
// — `strict` additionally requires both reserved headers to be mapped
// (publish-time only; a draft can still be saved without them).
export function validateMarketplaceConfig(config, globalHeaderIds, { strict = false } = {}) {
  const errors = [];
  const push = (m) => errors.push(m);
  if (!config || typeof config !== 'object') return { ok: false, errors: ['config must be an object'] };

  const { marketplace = {}, fileSlots = [] } = config;
  checkUniqueNames(fileSlots, 'file', push, 'label');

  const knownHeaderIds = globalHeaderIds instanceof Set ? globalHeaderIds : new Set(globalHeaderIds || []);
  const mappedHeaderIds = new Set();
  for (const slot of fileSlots) {
    for (const m of slot?.mappings || []) {
      if (!knownHeaderIds.has(m.headerId)) push(`file "${slot.label || slot.id}" maps "${m.sheetHeader}" to an unknown header`);
      mappedHeaderIds.add(m.headerId);
    }
  }

  if (strict) {
    for (const id of RESERVED_HEADER_ID_LIST) {
      if (!mappedHeaderIds.has(id)) push(`"${id === RESERVED_HEADER_IDS.orderId ? 'Order Id' : 'Transaction Id'}" must be mapped to a sheet column before this marketplace can be published`);
    }
  }

  for (const key of ['companyHeaderId', 'brandHeaderId', 'groupByHeaderId']) {
    const id = marketplace?.[key];
    if (id && !knownHeaderIds.has(id)) push(`marketplace.${key} references unknown header`);
  }

  return { ok: errors.length === 0, errors };
}
