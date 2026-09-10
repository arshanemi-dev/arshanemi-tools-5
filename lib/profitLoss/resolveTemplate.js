// The template renderer's core: a marketplace `config` (data/templateSchema.js)
// + canonical rows + the active filters → everything the dashboard draws for
// one tab. Pure; unit-testable against data/defaultTemplate.js + the sample
// CSVs. lib/profitLoss/engine.js still does the P&L maths — this only layers
// the config's headers / title cards / graphs on top of the base metrics it
// returns.
//
//   resolveTemplate(config, { canonicalRows, skuCostMap, ads, dateFrom,
//     dateTo, platform, company, brand }) => {
//     headers,           resolved header defs (id, name, format, signed, showInTable)
//     tableRows,         [{ key, cells: { [headerId]: { raw, display } } }]
//     titleCardValues,   { [cardId]: { main:{raw,display}, sub:{raw,display} } }
//     graphSeries,       { [graphId]: { name, chartType, series } }
//     aggregate,         the aggregate scope map (Σ per header + builtins)
//     companyOptions, brandOptions, rowCount, platforms,
//   }

import { computeProfitLoss } from './engine';
import { fmtCell } from './fmt';
import { evaluateFormula, evaluateValueBlock } from './formula';
import { refsIn } from '@/data/templateSchema';
import { AGGREGATE_BUILTINS } from '@/data/defaultHeaders';

const BUILTIN_NAMES = Object.keys(AGGREGATE_BUILTINS);

// ── helpers ───────────────────────────────────────────────────────────────
function readHeaderFromRow(header, row) {
  if (!header || !row) return undefined;
  // A mapped, non-canonical column the platform mapper parked in meta keyed
  // by header id (mapper convention), or by the raw sheet header name.
  if (row.meta && header.id in row.meta) return row.meta[header.id];
  if (header.mappedFrom?.sheetHeader && row.meta && header.mappedFrom.sheetHeader in row.meta) {
    return row.meta[header.mappedFrom.sheetHeader];
  }
  // A canonical primitive that also lives on the raw row (rare — sku/platform).
  if (header.primitive && header.primitive in row) return row[header.primitive];
  return undefined;
}

function distinctValues(rows, header) {
  if (!header) return [];
  const set = new Set();
  for (const r of rows) {
    const v = readHeaderFromRow(header, r);
    if (v != null && String(v).trim() !== '') set.add(String(v).trim());
  }
  return [...set].sort();
}

function truncDate(iso, unit) {
  if (!iso) return null;
  if (unit === 'month') return `${iso.slice(0, 7)}-01`;
  if (unit === 'week') {
    const d = new Date(`${iso}T00:00:00Z`);
    const day = (d.getUTCDay() + 6) % 7; // Mon = 0
    d.setUTCDate(d.getUTCDate() - day);
    return d.toISOString().slice(0, 10);
  }
  return iso.slice(0, 10);
}

// Topologically evaluate every formula header into `scope` (keyed by name).
// Non-formula headers are expected to already be in `scope`. A header caught
// in a reference cycle resolves to '#CYCLE'.
function evalFormulaHeaders(headers, scope, refNames) {
  const formulaHeaders = headers.filter((h) => h.type === 'formula' && h.formula);
  const byName = new Map(formulaHeaders.map((h) => [h.name.trim().toLowerCase(), h]));
  const state = new Map(); // name -> 'visiting' | 'done'

  const visit = (h) => {
    const key = h.name.trim().toLowerCase();
    if (state.get(key) === 'done') return;
    if (state.get(key) === 'visiting') { scope[h.name] = '#CYCLE'; state.set(key, 'done'); return; }
    state.set(key, 'visiting');
    for (const ref of refsIn(h.formula)) {
      const dep = byName.get(ref.trim().toLowerCase());
      if (dep && state.get(ref.trim().toLowerCase()) !== 'done') visit(dep);
    }
    const val = evaluateFormula(h.formula, scope, refNames);
    scope[h.name] = val === '' ? '' : val;
    state.set(key, 'done');
  };

  for (const h of formulaHeaders) visit(h);
  return scope;
}

// rows (already filtered) → { skuRows, summary, aggregate scope, refNames }.
function computeScope(config, rows, { skuCostMap, ads }) {
  const { headers } = config;
  const groupBy = headers.find((h) => h.id === config.marketplace?.groupByHeaderId);
  const groupBySku = !groupBy || groupBy.primitive === 'sku';

  const engineRows = groupBySku
    ? rows
    : rows.map((r) => ({ ...r, sku: String(readHeaderFromRow(groupBy, r) ?? '—') }));

  const { summary, skuRows, rowCount, platforms } = computeProfitLoss(engineRows, {
    skuCostMap: skuCostMap || {},
    ads: ads || { mode: 'percent', value: 0 },
    // date + platform already applied upstream; pass through anyway harmlessly
  });

  const builtins = {
    'Ads %': summary.ads.pct,
    'SKU Count': skuRows.length,
    'Settled SKU Count': summary.profitLoss.count,
    'Row Count': rowCount,
  };

  const refNames = [...headers.map((h) => h.name), ...BUILTIN_NAMES];

  // Per-row scopes + table cells.
  const tableRows = skuRows.map((sr) => {
    const scope = { ...builtins };
    for (const h of headers) {
      if (h.primitive && h.primitive in sr) scope[h.name] = sr[h.primitive];
    }
    evalFormulaHeaders(headers, scope, refNames);
    const cells = {};
    for (const h of headers) {
      const raw = scope[h.name];
      const display = h.type === 'text' || h.type === 'alphanumeric'
        ? (raw == null ? '' : String(raw))
        : fmtCell(raw, h.format);
      cells[h.id] = { raw, display };
    }
    return { key: sr.sku, cells };
  });

  // Aggregate scope: Σ of each header's numeric raw, plus the builtins.
  const aggregate = { ...builtins };
  for (const h of headers) {
    let sum = 0;
    let seen = false;
    for (const r of tableRows) {
      const raw = r.cells[h.id]?.raw;
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isFinite(n)) { sum += n; seen = true; }
    }
    aggregate[h.name] = seen ? Math.round(sum * 100) / 100 : 0;
  }

  return { summary, skuRows, tableRows, aggregate, refNames, rowCount, platforms };
}

// ── main ──────────────────────────────────────────────────────────────────
export function resolveTemplate(config, opts = {}) {
  const {
    canonicalRows = [],
    skuCostMap = {},
    ads = { mode: 'percent', value: 0 },
    dateFrom = null,
    dateTo = null,
    platform = 'all',
    company = 'all',
    brand = 'all',
  } = opts;

  const headers = Array.isArray(config?.headers) ? config.headers : [];
  const companyHeader = headers.find((h) => h.id === config?.marketplace?.companyHeaderId);
  const brandHeader = headers.find((h) => h.id === config?.marketplace?.brandHeaderId);

  const inRange = (iso) => {
    if (!iso) return true;
    if (dateFrom && iso < dateFrom) return false;
    if (dateTo && iso > dateTo) return false;
    return true;
  };
  const filtered = canonicalRows.filter((r) => {
    if (platform !== 'all' && r.platform !== platform) return false;
    if (!inRange(r.orderDate)) return false;
    if (company !== 'all' && companyHeader && String(readHeaderFromRow(companyHeader, r) ?? '') !== company) return false;
    if (brand !== 'all' && brandHeader && String(readHeaderFromRow(brandHeader, r) ?? '') !== brand) return false;
    return true;
  });

  const base = computeScope(config, filtered, { skuCostMap, ads });

  // Title cards (aggregate context).
  const titleCardValues = {};
  for (const card of config?.titleCards || []) {
    const mainRaw = evaluateValueBlock(card.mainValue, base.aggregate, base.refNames);
    const subRaw = evaluateValueBlock(card.subValue, base.aggregate, base.refNames);
    titleCardValues[card.id] = {
      main: { raw: mainRaw, display: fmtCell(mainRaw, card.mainValue?.format) },
      sub: { raw: subRaw, display: fmtCell(subRaw, card.subValue?.format) },
    };
  }

  // Graphs.
  const designType = new Map((config?.graphDesigns || []).map((d) => [d.id, d.chartType]));
  const graphSeries = {};
  for (const gd of config?.graphData || []) {
    const chartType = designType.get(gd.graphDesignId) || 'line';
    if (chartType === 'pie') {
      graphSeries[gd.id] = {
        name: gd.name,
        chartType,
        series: (gd.series || []).map((s) => ({
          title: s.title || '',
          value: Number(evaluateFormula(s.value?.formula, base.aggregate, base.refNames)) || 0,
        })),
      };
    } else {
      const s0 = (gd.series || [])[0] || {};
      const unit = s0.category?.unit || 'day';
      const buckets = new Map();
      for (const r of filtered) {
        const t = truncDate(r.orderDate, unit);
        if (!t) continue;
        if (!buckets.has(t)) buckets.set(t, []);
        buckets.get(t).push(r);
      }
      const points = [...buckets.keys()].sort().map((t) => {
        const bScope = computeScope(config, buckets.get(t), { skuCostMap, ads }).aggregate;
        return { t, value: Number(evaluateFormula(s0.value?.formula, bScope, base.refNames)) || 0 };
      });
      graphSeries[gd.id] = {
        name: gd.name,
        chartType,
        series: [{ title: s0.title || gd.name, points }],
      };
    }
  }

  return {
    headers,
    tableRows: base.tableRows,
    titleCardValues,
    graphSeries,
    aggregate: base.aggregate,
    rowCount: base.rowCount,
    platforms: base.platforms,
    companyOptions: distinctValues(canonicalRows, companyHeader),
    brandOptions: distinctValues(canonicalRows, brandHeader),
  };
}
