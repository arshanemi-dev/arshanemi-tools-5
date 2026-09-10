// The shape of a marketplace-template `config` (feature-plan.md §3) plus the
// factory + validation helpers the builder uses. The hub has a parallel
// structural gate in lib/templateConfig.js — keep the two in sync.
//
// A `config` fully describes one marketplace's dashboard: its upload slots +
// column mappings, its header list + formulas, its Title Cards, its Graph
// Designs + Graph Data, its Tabs, and its Overview tab. The dashboard is a
// pure renderer of this; lib/profitLoss/engine.js only supplies base metrics.

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
// AGGREGATE_BUILTINS. Kept here too so validateConfig accepts them as refs.
export const AGGREGATE_BUILTIN_NAMES = ['Ads %', 'SKU Count', 'Settled SKU Count', 'Row Count'];

export const FILE_SLOT_KINDS = ['payment', 'order', 'aux'];

// ── id helper ──────────────────────────────────────────────────────────────
export function newId(prefix = 'x') {
  return `${prefix}_${nanoid(8)}`;
}

// ── factories ──────────────────────────────────────────────────────────────
export function makeEmptyConfig(marketplaceName = '') {
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    marketplace: {
      name: marketplaceName,
      companyHeaderId: null,
      brandHeaderId: null,
      groupByHeaderId: null,
    },
    fileSlots: [],
    headers: [],
    titleCards: [],
    graphDesigns: [],
    graphData: [],
    tabs: [],
    overviewTab: { enabled: false, name: 'Overview', headerIds: [] },
    visibility: { marketplaceInSidebar: true, tabs: {} },
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
    mappedFrom: null, // { slot, sheetHeader }
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

export function makeGraphDesign(name = 'Graph Design', chartType = 'line') {
  return { id: newId('gd'), name, chartType };
}

export function makeSeries(pie = false) {
  const s = { title: '', value: makeValue('formula') };
  if (!pie) s.category = { type: 'times', unit: 'day' };
  return s;
}

export function makeGraphData(name = 'Graph', chartType = 'line') {
  const pie = chartType === 'pie';
  return {
    id: newId('g'),
    name,
    type: 'formula', // formula | number | text | graphDesign
    graphDesignId: null,
    series: pie ? [makeSeries(true), makeSeries(true)] : [makeSeries(false)],
  };
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

export function validateConfig(config) {
  const errors = [];
  const push = (m) => errors.push(m);
  if (!config || typeof config !== 'object') return { ok: false, errors: ['config must be an object'] };

  const {
    marketplace = {}, headers = [], titleCards = [], graphDesigns = [],
    graphData = [], tabs = [], overviewTab = {}, visibility = {},
  } = config;

  const headerIds = new Set();
  const headerNames = new Set();
  for (const h of headers) {
    if (!h?.id) { push('every header needs an id'); continue; }
    if (headerIds.has(h.id)) push(`duplicate header id: ${h.id}`);
    headerIds.add(h.id);
    if (h.name) headerNames.add(String(h.name).trim().toLowerCase());
    if (h.type && !HEADER_TYPES.includes(h.type)) push(`header "${h.name || h.id}": bad type ${h.type}`);
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

  const designIds = new Set();
  const designType = new Map();
  for (const g of graphDesigns) {
    if (!g?.id) { push('every graph design needs an id'); continue; }
    designIds.add(g.id);
    if (!CHART_TYPES.includes(g.chartType)) push(`graph design "${g.name || g.id}": bad chartType ${g.chartType}`);
    designType.set(g.id, g.chartType);
  }

  const graphIds = new Set();
  for (const gd of graphData) {
    if (!gd?.id) { push('every graph data needs an id'); continue; }
    graphIds.add(gd.id);
    if (gd.graphDesignId && !designIds.has(gd.graphDesignId)) push(`graph "${gd.name || gd.id}" references unknown graph design`);
    const chart = designType.get(gd.graphDesignId);
    const series = Array.isArray(gd.series) ? gd.series : [];
    if (chart === 'pie' && series.length < 2) push(`pie graph "${gd.name || gd.id}" needs at least 2 title/value pairs`);
    if (chart && chart !== 'pie' && series.length !== 1) push(`graph "${gd.name || gd.id}" (${chart}) needs exactly 1 series`);
    for (const s of series) {
      for (const ref of refsIn(s?.value?.formula)) {
        if (!knownRef(ref)) push(`graph "${gd.name || gd.id}" references unknown [${ref}]`);
      }
    }
  }

  const tabIds = new Set();
  for (const t of tabs) {
    if (!t?.id) { push('every tab needs an id'); continue; }
    tabIds.add(t.id);
    for (const id of t.titleCardIds || []) if (!cardIds.has(id)) push(`tab "${t.name || t.id}" references unknown title card`);
    for (const id of t.graphIds || []) if (!graphIds.has(id)) push(`tab "${t.name || t.id}" references unknown graph`);
    for (const id of t.headerIds || []) if (!headerIds.has(id)) push(`tab "${t.name || t.id}" references unknown header`);
  }

  for (const id of overviewTab?.headerIds || []) if (!headerIds.has(id)) push('overview tab references unknown header');
  for (const key of ['companyHeaderId', 'brandHeaderId', 'groupByHeaderId']) {
    const id = marketplace?.[key];
    if (id && !headerIds.has(id)) push(`marketplace.${key} references unknown header`);
  }
  for (const id of Object.keys(visibility?.tabs || {})) if (!tabIds.has(id)) push('visibility.tabs references unknown tab');

  return { ok: errors.length === 0, errors };
}
