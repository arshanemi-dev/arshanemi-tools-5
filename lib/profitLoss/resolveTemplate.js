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
import { refsIn, RESERVED_HEADER_IDS } from '@/data/templateSchema';
import { AGGREGATE_BUILTINS } from '@/data/defaultHeaders';

const BUILTIN_NAMES = Object.keys(AGGREGATE_BUILTINS);

// ── helpers ───────────────────────────────────────────────────────────────
// ── helpers ───────────────────────────────────────────────────────────────
import { normHeader } from '@/data/platforms/canonical';

// Enhanced header value reader: checks header.id, mappedFrom, header.name,
// primitive properties, normalized key matches across row.meta, and fallback aliases.
export function readHeaderFromRow(header, row) {
  if (!header || !row) return undefined;
  const meta = row.meta || {};

  // 1. Direct match by header id in meta
  if (header.id in meta && meta[header.id] != null && String(meta[header.id]).trim() !== '') {
    return meta[header.id];
  }
  // 2. Direct match by mapped sheet header
  if (header.mappedFrom?.sheetHeader && header.mappedFrom.sheetHeader in meta && meta[header.mappedFrom.sheetHeader] != null && String(meta[header.mappedFrom.sheetHeader]).trim() !== '') {
    return meta[header.mappedFrom.sheetHeader];
  }
  // 3. Direct match by header name in meta
  if (header.name in meta && meta[header.name] != null && String(meta[header.name]).trim() !== '') {
    return meta[header.name];
  }
  // 4. Primitive on canonical row
  if (header.primitive && header.primitive in row && row[header.primitive] != null && String(row[header.primitive]).trim() !== '' && row[header.primitive] !== '—') {
    return row[header.primitive];
  }

  // 5. Normalized header key match in meta
  const normName = normHeader(header.name);
  const normId = normHeader(header.id);
  for (const [k, v] of Object.entries(meta)) {
    if (v == null || String(v).trim() === '') continue;
    const nk = normHeader(k);
    if (nk === normName || nk === normId) return v;
  }

  // 6. Common alias fallback for key fields
  if (header.id === RESERVED_HEADER_IDS.orderId || normName.includes('orderid') || normName === 'orderid') {
    if (row.orderId) return row.orderId;
    for (const [k, v] of Object.entries(meta)) {
      const nk = normHeader(k);
      if (['orderid', 'suborderid', 'merchantrefno', 'amazonorderid', 'myntraorderid', 'orderitemid'].includes(nk)) return v;
    }
  }

  if (header.id === RESERVED_HEADER_IDS.transactionId || normName.includes('transactionid') || normName === 'transactionid') {
    if (row.settlementId) return row.settlementId;
    for (const [k, v] of Object.entries(meta)) {
      const nk = normHeader(k);
      if (['transactionid', 'jiotransactionid', 'releaseid', 'settlementid', 'orderitemid'].includes(nk)) return v;
    }
  }

  if (header.primitive === 'sku' || normName === 'skuname' || normName === 'sku') {
    if (row.sku && row.sku !== '—') return row.sku;
    for (const [k, v] of Object.entries(meta)) {
      const nk = normHeader(k);
      if (['sku', 'vendorsku', 'skucode'].includes(nk)) return v;
    }
  }

  // 7. Primitive fallbacks if primitive was mapped differently
  if (header.primitive && row[header.primitive] != null) {
    return row[header.primitive];
  }

  return undefined;
}

// Strips a trailing "_1"/"_2" line-item suffix some marketplaces' Payment
// exports carry per Order Id that their Order export doesn't — the shared
// definition of "same underlying order" DashboardWorkspace's cross-file
// merge and the Sheet Debugger's uniqueness preview both use, so the two
// never quietly disagree with each other.
export function normalizeOrderId(v) {
  return String(v ?? '').trim().replace(/_\d+$/, '');
}

// One raw row's key in the Transactions view (resolveTransactionRows) —
// exported so DashboardWorkspace's row-delete can reconstruct the SAME key
// from a single raw row (to know which underlying rows a selected
// Transactions row actually corresponds to) without needing the whole
// group. Order Id + Transaction Id together when both exist; Order Id +
// this row's own stable `rowId` otherwise — never merged with any other
// row lacking a Transaction Id, same rule the upload de-dupe/merge uses.
export function transactionKeyFor(row, orderIdHeader, transactionIdHeader) {
  let orderVal = orderIdHeader ? readHeaderFromRow(orderIdHeader, row) : null;
  if (!orderVal) orderVal = row.orderId || row.meta?.Order_ID || row.meta?.Sub_Order_ID || row.meta?.Merchant_Ref_No;
  const orderKey = orderVal != null && String(orderVal).trim() !== '' ? String(orderVal).trim() : null;
  if (!orderKey) return null;

  let txnVal = transactionIdHeader ? readHeaderFromRow(transactionIdHeader, row) : null;
  if (!txnVal) txnVal = row.settlementId || row.meta?.Transaction_ID || row.meta?.Jio_Transaction_ID || row.meta?.Release_ID || row.meta?.Settlement_ID;
  const txnKey = txnVal != null && String(txnVal).trim() !== '' ? String(txnVal).trim() : null;

  return txnKey ? `${orderKey}::${txnKey}` : `${orderKey}::${row.rowId || Math.random().toString(36).slice(2)}`;
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

// A SKU bucket (or an Overview group) can span more than one tagged company
// (e.g. the same SKU sold under two brands) — show the single name when
// there's exactly one, otherwise a plain "Multiple" rather than pick one.
function companyLabel(companies) {
  if (!companies || !companies.length) return '';
  return companies.length === 1 ? companies[0] : 'Multiple';
}

// A header that's neither bound to an engine metric (`primitive`) nor a
// formula is a raw sheet column mapped per-marketplace (Market Place >
// Unmap/Map) — its value lives on the individual raw row, not the engine's
// per-SKU aggregate, so it has to be read back off whichever raw rows fell
// into this group via the same mappedFrom readHeaderFromRow already knows
// how to follow. A "number" header sums across the group, consistent with
// every other numeric header's aggregate Σ; text/alphanumeric shows the
// single value when the group agrees. A per-transaction identifier like
// Order Id / Transaction Id is exactly-one-per-row, not per-SKU — a busy
// SKU can legitimately span many distinct orders, so rather than dump every
// one of them comma-joined into a single cell (unreadable, and easy to
// mistake for "these orders are somehow the same"), a group with more than
// one distinct value shows the first plus how many others there are.
function aggregateHeaderValue(header, groupRows) {
  if (header.type === 'number') {
    let sum = 0;
    let any = false;
    for (const r of groupRows) {
      const n = Number(readHeaderFromRow(header, r));
      if (Number.isFinite(n)) { sum += n; any = true; }
    }
    return any ? Math.round(sum * 100) / 100 : '';
  }
  const values = [...new Set(
    groupRows.map((r) => readHeaderFromRow(header, r)).filter((v) => v != null && String(v).trim() !== ''),
  )];
  if (values.length <= 1) return values[0] ?? '';
  return `${values[0]} +${values.length - 1} more`;
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

  // Raw rows behind each SKU bucket — the same grouping computeProfitLoss
  // itself used — so a mapped (non-primitive, non-formula) header can pull
  // its actual sheet value per group below.
  const rowsBySku = new Map();
  for (const r of engineRows) {
    if (!rowsBySku.has(r.sku)) rowsBySku.set(r.sku, []);
    rowsBySku.get(r.sku).push(r);
  }

  // Per-row scopes + table cells.
  const tableRows = skuRows.map((sr) => {
    const scope = { ...builtins };
    const groupRows = rowsBySku.get(sr.sku) || [];
    for (const h of headers) {
      if (h.primitive && h.primitive in sr) { scope[h.name] = sr[h.primitive]; continue; }
      if (h.type === 'formula') continue; // evalFormulaHeaders fills these in below
      scope[h.name] = aggregateHeaderValue(h, groupRows);
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
    return { key: sr.sku, company: companyLabel(sr.companies), cells };
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
            // Text/alphanumeric mapped headers aren't summable — read them
            // straight off this group's raw rows (same helper the main
            // table uses) instead of the numeric-only aggregate Σ, which
            // would otherwise collapse them to 0.
            const raw = h.type === 'text' || h.type === 'alphanumeric'
              ? aggregateHeaderValue(h, groupRows)
              : groupScope.aggregate[h.name];
            const display = h.type === 'text' || h.type === 'alphanumeric' ? (raw == null ? '' : String(raw)) : fmtCell(raw, h.format);
            cells[h.id] = { raw, display };
          }
          const companies = [...new Set(groupRows.map((r) => r.company).filter(Boolean))];
          return { key, company: companyLabel(companies), cells };
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

// A single primitive-bound header's value for one transaction group's own
// (usually one, occasionally several) computeProfitLoss skuRows — summed
// across them for a numeric metric (still correct when there's only one),
// distinct-value-joined for `sku` itself the same way aggregateHeaderValue
// already does for any other text field.
function primitiveFromSkuRows(skuRows, key) {
  if (!skuRows.length) return undefined;
  if (key === 'sku') {
    const uniq = [...new Set(skuRows.map((s) => s.sku).filter(Boolean))];
    if (uniq.length <= 1) return uniq[0];
    return `${uniq[0]} +${uniq.length - 1} more`;
  }
  const nums = skuRows.map((s) => s[key]).filter((v) => typeof v === 'number');
  if (nums.length) return Math.round(nums.reduce((a, b) => a + b, 0) * 100) / 100;
  return skuRows[0]?.[key];
}

// The RAW, per-transaction counterpart to resolveTemplate's tableRows (which
// is grouped by SKU, for the Total Order/Profit-Loss/COGS math). Here, one
// row is exactly one Order Id (+ Transaction Id when mapped) — the same
// identity DashboardWorkspace's own upload de-dupe/merge already treats as
// "one distinct thing" (an Order Id with no Transaction Id to confirm it is
// never merged with another row, so it always gets its own line here too).
// Every header still means the same thing it does on the main table —
// primitive-bound ones are recomputed via computeProfitLoss scoped to just
// this transaction's own rows (usually one SKU), not summed across the
// whole SKU history — reusing the exact same engine, just grouped
// differently. Requires the Order Id header to be mapped; returns no rows
// otherwise (nothing to key transactions by).
export function resolveTransactionRows(config, opts = {}) {
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
  const orderIdHeader = headers.find((h) => h.id === RESERVED_HEADER_IDS.orderId) || null;
  const transactionIdHeader = headers.find((h) => h.id === RESERVED_HEADER_IDS.transactionId) || null;
  if (!orderIdHeader) return { headers, rows: [], rowCount: 0 };

  const inRange = (iso) => {
    if (!iso) return true;
    if (dateFrom && iso < dateFrom) return false;
    if (dateTo && iso > dateTo) return false;
    return true;
  };
  const filtered = canonicalRows.filter((r) => {
    if (platform !== 'all' && r.platform !== platform) return false;
    if (!inRange(r.orderDate)) return false;
    if (company !== 'all' && (r.company ?? '') !== company) return false;
    return true;
  });

  const groups = new Map(); // key -> { rows: [] }
  for (const r of filtered) {
    const key = transactionKeyFor(r, orderIdHeader, transactionIdHeader);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const refNames = [...headers.map((h) => h.name), ...BUILTIN_NAMES];
  const rows = [...groups.entries()].map(([key, groupRows]) => {
    const { summary, skuRows } = computeProfitLoss(groupRows, { skuCostMap: skuCostMap || {}, ads: ads || { mode: 'percent', value: 0 } });
    const builtins = {
      'Ads %': summary.ads.pct,
      'SKU Count': skuRows.length,
      'Settled SKU Count': summary.profitLoss.count,
      'Row Count': groupRows.length,
    };
    const scope = { ...builtins };
    for (const h of headers) {
      if (h.primitive) { scope[h.name] = primitiveFromSkuRows(skuRows, h.primitive); continue; }
      if (h.type === 'formula') continue;
      scope[h.name] = aggregateHeaderValue(h, groupRows);
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
    const companies = [...new Set(groupRows.map((r) => r.company).filter(Boolean))];
    return { key, company: companyLabel(companies), cells };
  });

  return { headers, rows, rowCount: filtered.length };
}
