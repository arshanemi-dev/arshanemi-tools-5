// The template renderer's core: a marketplace `config` (data/templateSchema.js)
// + canonical rows + the active filters → everything the dashboard draws for
// one tab. Pure; unit-testable against the sample CSVs. lib/profitLoss/engine.js
// still does the P&L maths — this only layers the config's headers / title
// cards / graphs on top of the base metrics it returns.
//
//   resolveTemplate(config, { canonicalRows, skuCostMap, ads, dateFrom,
//     dateTo, platform, company }) => {
//     headers,           resolved header defs (id, name, format, signed, showInTable)
//     tableRows,         [{ key, cells: { [headerId]: { raw, display } } }]
//     titleCardValues,   { [cardId]: { main:{raw,display}, sub:{raw,display} } }
//     graphSeries,       { [graphId]: { name, chartType, series } } — pie:
//                        series=[{title,value}]; line/bar/area: series=[{title,points}]
//                        (one per Graph Header, auto-split)
//     overviews,         { [overviewTabId]: { name, fixedHeader, headers, rows } }
//                        — one or more pivots, each on its own fixed/unique
//                        header (config.overviewTabs[].fixedHeaderId); rows =
//                        [{ key, cells }] same shape as tableRows
//     aggregate,         the aggregate scope map (Σ per header + builtins)
//     companyOptions,    distinct "MarketPlace_Brand" combos tagged onto rows
//     rowCount, platforms,
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

  // One flat { [headerName]: value } scope per table row (post per-row formula
  // evaluation) — the `rows` context SUM([Header]) / COUNT([Header]) reduce
  // over, for title-card / graph / overview formulas.
  const rowScopes = tableRows.map((r) => Object.fromEntries(headers.map((h) => [h.name, r.cells[h.id]?.raw])));

  return { summary, skuRows, tableRows, aggregate, rowScopes, refNames, rowCount, platforms };
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
  } = opts;

  const headers = Array.isArray(config?.headers) ? config.headers : [];

  const inRange = (iso) => {
    if (!iso) return true;
    if (dateFrom && iso < dateFrom) return false;
    if (dateTo && iso > dateTo) return false;
    return true;
  };
  // Company is the "MarketPlace_Brand" combo tagged onto every row at upload
  // time (the brand picked in the toolbar) — not extracted from the sheet, so
  // no header lookup here.
  const filtered = canonicalRows.filter((r) => {
    if (platform !== 'all' && r.platform !== platform) return false;
    if (!inRange(r.orderDate)) return false;
    if (company !== 'all' && (r.company ?? '') !== company) return false;
    return true;
  });

  const base = computeScope(config, filtered, { skuCostMap, ads });

  // Title cards (aggregate context) — SUM([Header]) / COUNT([Header]) reduce
  // over base.rowScopes (every row currently in the filtered/grouped table).
  const titleCardValues = {};
  for (const card of config?.titleCards || []) {
    const mainRaw = evaluateValueBlock(card.mainValue, base.aggregate, base.refNames, base.rowScopes);
    const subRaw = evaluateValueBlock(card.subValue, base.aggregate, base.refNames, base.rowScopes);
    titleCardValues[card.id] = {
      main: { raw: mainRaw, display: fmtCell(mainRaw, card.mainValue?.format) },
      sub: { raw: subRaw, display: fmtCell(subRaw, card.subValue?.format) },
    };
  }

  // Graphs — a chart type + the "Graph Header" list it plots (Graph Design and
  // Graph Data are one entity now). Pie: one slice per header, its aggregate
  // Σ. Line/bar/area: one series per header, auto-split over a time bucket —
  // the same idea as picking columns in the Header section.
  const graphSeries = {};
  for (const g of config?.graphs || []) {
    const chartType = g.chartType || 'line';
    const gHeaders = (g.headerIds || []).map((id) => headers.find((h) => h.id === id)).filter(Boolean);
    if (chartType === 'pie') {
      graphSeries[g.id] = {
        name: g.name,
        chartType,
        series: gHeaders.map((h) => ({ title: h.name, value: Number(base.aggregate[h.name]) || 0 })),
      };
    } else {
      const unit = g.timeUnit || 'day';
      const buckets = new Map();
      for (const r of filtered) {
        const t = truncDate(r.orderDate, unit);
        if (!t) continue;
        if (!buckets.has(t)) buckets.set(t, []);
        buckets.get(t).push(r);
      }
      const bucketKeys = [...buckets.keys()].sort();
      const bucketScopes = bucketKeys.map((t) => computeScope(config, buckets.get(t), { skuCostMap, ads }));
      graphSeries[g.id] = {
        name: g.name,
        chartType,
        series: gHeaders.map((h) => ({
          title: h.name,
          points: bucketKeys.map((t, i) => ({ t, value: Number(bucketScopes[i].aggregate[h.name]) || 0 })),
        })),
      };
    }
  }

  // Overview tabs — each a pivot on its own fixed/unique header; every other
  // selected header aggregates (Σ, via the same computeScope each group runs)
  // within that group. SUM([Header]) / COUNT([Header]) inside an overview
  // header's own formula reduce over that group's rows.
  const overviews = {};
  for (const ov of config?.overviewTabs || []) {
    const fixedHeader = headers.find((h) => h.id === ov.fixedHeaderId) || null;
    const entry = { name: ov.name, fixedHeader, headers: [], rows: [] };
    if (fixedHeader) {
      entry.headers = (ov.headerIds || []).map((id) => headers.find((h) => h.id === id)).filter(Boolean);
      const groups = new Map();
      for (const r of filtered) {
        const key = String(readHeaderFromRow(fixedHeader, r) ?? '').trim();
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
      }
      entry.rows = [...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, groupRows]) => {
          const groupScope = computeScope(config, groupRows, { skuCostMap, ads });
          const cells = { [fixedHeader.id]: { raw: key, display: key } };
          for (const h of entry.headers) {
            const raw = groupScope.aggregate[h.name];
            cells[h.id] = { raw, display: fmtCell(raw, h.format) };
          }
          return { key, cells };
        });
    }
    overviews[ov.id] = entry;
  }

  return {
    headers,
    tableRows: base.tableRows,
    titleCardValues,
    graphSeries,
    overviews,
    aggregate: base.aggregate,
    rowCount: base.rowCount,
    platforms: base.platforms,
    companyOptions: [...new Set(canonicalRows.map((r) => r.company).filter(Boolean))].sort(),
  };
}
