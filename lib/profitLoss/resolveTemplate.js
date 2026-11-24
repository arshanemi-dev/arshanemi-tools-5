// The template renderer's core: a marketplace `config` (data/templateSchema.js)
// + canonical rows + the active filters → everything the dashboard draws for
// one tab. Pure; unit-testable against the sample CSVs. lib/profitLoss/engine.js
// still does the P&L maths — this only layers the config's headers / title
// cards / graphs on top of the base metrics it returns.
//
//   resolveTemplate(config, { canonicalRows, skuCostMap, ads, dateFrom,
//     dateTo, platform, company, overviewHeaderIds, now }) => {
//     headers,           resolved header defs (id, name, format, signed, showInTable)
//     tableRows,         [{ key, cells: { [headerId]: { raw, display } } }]
//     titleCardValues,   { [cardId]: { main:{raw,display}, sub:{raw,display} } }
//     graphSeries,       { [graphId]: { name, chartType, series } } — pie:
//                        series=[{title,value}]; line/bar/area: series=[{title,points}]
//                        (one per Graph Header, auto-split)
//     overviews,         { [overviewTabId]: { name, levels, fixedHeader,
//                        headers, tree, rows, flatRows } } — one pivot per
//                        overview tab on its unique-value hierarchy
//                        (config.overviewTabs[].hierarchyHeaderIds; see
//                        lib/profitLoss/overviewTree.js). tree = nested
//                        nodes; rows = the Level-1 nodes; flatRows = the
//                        whole tree depth-first (export order);
//                        fixedHeader = levels[0] (back-compat)
//     aggregate,         the aggregate scope map (Σ per header + builtins)
//     companyOptions,    distinct "MarketPlace_Brand" combos tagged onto rows
//     rowCount, platforms,
//   }

import { computeProfitLoss } from './engine';
import { fmtHeaderCell, fmtTyped } from './fmt';
import { evaluateFormulaTyped, evaluateValueBlockTyped, formulaRefs } from './formula';
import { dateGroupValue } from './dates';
import { refsIn, RESERVED_HEADER_IDS } from '@/data/templateSchema';
import { AGGREGATE_BUILTINS } from '@/data/defaultHeaders';
import { ACCOUNT_NAME_KEY, REVIEW_KEY, REVIEW_REASON_KEY, isReviewField } from '@/data/fixedHeaders';
import { buildOverviewTree, compareCellValues, flattenTree, overviewLevelIds } from './overviewTree';
import { rawColumnReader, rawColumnsByName } from './sheetColumns';
import { SIZE_KEY, autoSize, joinDistinct, rowIdentity, sizeReader } from './rowIdentity';

const BUILTIN_NAMES = Object.keys(AGGREGATE_BUILTINS);

// ── helpers ───────────────────────────────────────────────────────────────
import { normHeader, parseNumberish } from '@/data/platforms/canonical';
import { hasSources, sourceValue } from './rowSources';

// The sheet columns (normalised — normHeader) the three key headers fall back
// to when nothing else names their value: readHeaderFromRow step 6.
const ORDER_ID_COLUMNS = new Set(['orderid', 'suborderid', 'merchantrefno', 'amazonorderid', 'myntraorderid', 'orderitemid']);
const TRANSACTION_ID_COLUMNS = new Set(['transactionid', 'jiotransactionid', 'releaseid', 'settlementid', 'orderitemid']);
const SKU_COLUMNS = new Set(['sku', 'vendorsku', 'skucode']);

// Enhanced header value reader: checks header.id, mappedFrom, header.name,
// primitive properties, normalized key matches across row.meta, and fallback aliases.
export function readHeaderFromRow(header, row) {
  if (!header || !row) return undefined;
  const meta = row.meta || {};

  // 0. The fixed headers the dashboard fills itself (data/fixedHeaders.js):
  // Account Name is the upload's "MarketPlace_Brand" tag, a cost header is
  // this row's SKU in the SKU Cost sheet (`row.skuCost` — withSkuCosts in
  // ./skuCosts.js). One with no value of its own falls through to a mapped
  // sheet column, like any other header.
  // Review is Yes / No, never blank (No until confirmed); its Reason only
  // counts while it is Yes.
  // (Not once switched to a formula — that is worked out like any other.)
  if (header.fixedKey === REVIEW_KEY && isReviewField(header)) return row.review === 'yes' ? 'Yes' : 'No';
  if (header.fixedKey === REVIEW_REASON_KEY && isReviewField(header)) return row.review === 'yes' ? String(row.reviewReason ?? '').trim() : '';
  if (header.fixedKey) {
    const own = header.fixedKey === ACCOUNT_NAME_KEY ? row.company : row.skuCost?.[header.fixedKey];
    if (own != null && String(own).trim() !== '') return own;
  }

  // A header mapped to named sheets' columns (Template Settings › Header:
  // File › Sheet › Header — effectiveConfig.js `sources`) is read from each
  // of those sheets in turn (rowSources.js). When every mapping of it names a
  // sheet (`exact`) and the row knows where it came from, the name guesses
  // below (steps 1, 3, 5) are skipped too: they could pick up a same-named
  // column of ANOTHER sheet. A row saved before sources existed, or a header
  // with an older "any sheet" mapping, reads by name exactly as before.
  const sources = header.mappedFrom?.sources;
  const traced = !!sources && hasSources(row);
  const strict = traced && header.mappedFrom.exact === true;

  // 1. Direct match by header id in meta
  if (!strict && header.id in meta && meta[header.id] != null && String(meta[header.id]).trim() !== '') {
    return meta[header.id];
  }
  // 2. Direct match by mapped sheet header — a header can merge several of a
  // marketplace's columns (`sheetHeaders`, e.g. one per file), and each row
  // only carries its own file's columns, so the first one present wins.
  if (traced) {
    for (const s of sources) {
      const v = s.src ? sourceValue(row, s.src, s.column) : meta[s.column];
      if (v != null && String(v).trim() !== '') return v;
    }
  } else {
    const mappedCols = header.mappedFrom?.sheetHeaders || (header.mappedFrom?.sheetHeader ? [header.mappedFrom.sheetHeader] : []);
    for (const col of mappedCols) {
      if (col in meta && meta[col] != null && String(meta[col]).trim() !== '') return meta[col];
    }
  }
  // 3. Direct match by header name in meta
  if (!strict && header.name in meta && meta[header.name] != null && String(meta[header.name]).trim() !== '') {
    return meta[header.name];
  }
  // 4. Primitive on canonical row
  if (header.primitive && header.primitive in row && row[header.primitive] != null && String(row[header.primitive]).trim() !== '' && row[header.primitive] !== '—') {
    return row[header.primitive];
  }

  // 5. Normalized header key match in meta. (These loops run for every
  // header a row has no direct column for, on every row: `for…in` over the
  // row's own columns — `meta` is a plain object — instead of building an
  // entries array each time, and normHeader remembers what it has seen.)
  const normName = normHeader(header.name);
  const normId = normHeader(header.id);
  if (!strict) {
    for (const k in meta) {
      const nk = normHeader(k);
      if (nk !== normName && nk !== normId) continue;
      const v = meta[k];
      if (v != null && String(v).trim() !== '') return v;
    }
  }

  // 6. Common alias fallback for key fields
  if (header.id === RESERVED_HEADER_IDS.orderId || normName.includes('orderid') || normName === 'orderid') {
    if (row.orderId) return row.orderId;
    for (const k in meta) if (ORDER_ID_COLUMNS.has(normHeader(k))) return meta[k];
  }

  if (header.id === RESERVED_HEADER_IDS.transactionId || normName.includes('transactionid') || normName === 'transactionid') {
    if (row.settlementId) return row.settlementId;
    for (const k in meta) if (TRANSACTION_ID_COLUMNS.has(normHeader(k))) return meta[k];
  }

  if (header.primitive === 'sku' || normName === 'skuname' || normName === 'sku') {
    if (row.sku && row.sku !== '—') return row.sku;
    for (const k in meta) if (SKU_COLUMNS.has(normHeader(k))) return meta[k];
  }

  // 7. Primitive fallbacks if primitive was mapped differently
  if (header.primitive && row[header.primitive] != null) {
    return row[header.primitive];
  }

  // 8. Upload tag — a "Company" / "Brand" header that no sheet column fills
  // falls back to the tag every row gets at upload (the toolbar's brand
  // picker: row.company = "MarketPlace_Brand", row.brand = the brand), so
  // e.g. an Overview hierarchy of Company → Sku → Order Id works without
  // the sheet itself carrying a company column.
  if (['company', 'companyname'].includes(normName) && row.company) return row.company;
  if (['brand', 'brandname'].includes(normName) && row.brand) return row.brand;

  // 9. The fixed Size header with no mapped column: the sheet's own Size /
  // Variant / Variation column (rowIdentity.js).
  if (header.fixedKey === SIZE_KEY) return autoSize(row) || undefined;

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

// The Company filter: 'all', one company, or a list of them (the header
// bar's checklist — components/dashboard/ValueFilter.jsx).
function companyMatches(company, row) {
  if (company === 'all' || company == null) return true;
  const own = row.company ?? '';
  return Array.isArray(company) ? company.includes(own) : own === company;
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
function aggregateHeaderValue(header, groupRows, read = readHeaderFromRow) {
  // A SKU's Review across its orders: Yes / No when they agree, else how
  // many of them are confirmed ("3/10 Yes").
  if (header.fixedKey === REVIEW_KEY && isReviewField(header)) {
    const yes = groupRows.filter((r) => r.review === 'yes').length;
    if (!groupRows.length) return '';
    return yes === groupRows.length ? 'Yes' : yes ? `${yes}/${groupRows.length} Yes` : 'No';
  }
  if (header.type === 'number') {
    let sum = 0;
    let any = false;
    for (const r of groupRows) {
      // "1,299.00" / "₹1,234" / "(150)" read as numbers — Number() saw NaN.
      const n = parseNumberish(read(header, r));
      if (Number.isFinite(n)) { sum += n; any = true; }
    }
    return any ? Math.round(sum * 100) / 100 : '';
  }
  // Text: the one value, or every distinct value — never "first +N more".
  return joinDistinct(groupRows.map((r) => read(header, r)));
}

// A Date header in one group of sheet rows: its value into `scope` (a
// timestamp — the earliest, see dateGroupValue), what the cell shows into
// `shown` (a date, or a range), and — when it really is a date and not
// leftover text — its kind into `kinds` for the formulas that use it.
function seedDate(header, groupRows, scope, kinds, shown, read = readHeaderFromRow) {
  const { raw, display } = dateGroupValue(groupRows.map((r) => read(header, r)));
  scope[header.name] = raw;
  shown[header.name] = display;
  if (typeof raw === 'number') kinds[header.name] = 'date';
}

// Names of the headers that are about dates: every Date header, and every
// formula that uses TODAY() or one of them (directly or through another
// formula). A row where such a formula has no answer — its date is blank —
// shows an empty cell, not the "0" a blank number would.
const DATED = new WeakMap();
export function datedHeaderNames(headers) {
  if (DATED.has(headers)) return DATED.get(headers);
  const dated = new Set(headers.filter((h) => h.type === 'date').map((h) => h.name.trim().toLowerCase()));
  const formulas = headers.filter((h) => h.type === 'formula' && h.formula);
  for (let grew = true; grew;) {
    grew = false;
    for (const h of formulas) {
      const key = h.name.trim().toLowerCase();
      if (dated.has(key)) continue;
      if (/\btoday\b/i.test(h.formula) || refsIn(h.formula).some((r) => dated.has(r.trim().toLowerCase()))) { dated.add(key); grew = true; }
    }
  }
  DATED.set(headers, dated);
  return dated;
}

// What one cell shows. `shown` = text already decided for it (a date range).
function cellDisplay(header, raw, kinds, shown, dated) {
  if (shown[header.name] !== undefined) return shown[header.name];
  if ((raw === '' || raw == null) && dated.has(header.name.trim().toLowerCase())) return '';
  return fmtHeaderCell(header, raw, kinds[header.name]);
}

// Topologically evaluate every formula header into `scope` (keyed by name).
// Non-formula headers are expected to already be in `scope`. A header caught
// in a reference cycle resolves to '#CYCLE'. `rows` (a rawColumnReader over
// the group's sheet rows — lib/profitLoss/sheetColumns.js) is what SUM /
// COUNT in those formulas reduce over. `kinds` (name → 'date' | 'days')
// tells a formula which of its refs are dates, and collects what each
// formula itself came out as, for the formulas after it and for display.
function evalFormulaHeaders(headers, scope, refNames, rows = null, kinds = {}, now = undefined) {
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
    const { value, kind } = evaluateFormulaTyped(h.formula, scope, refNames, rows, { kindOf: (name) => kinds[name], now });
    scope[h.name] = value;
    if (kind === 'date' || kind === 'days') kinds[h.name] = kind;
    state.set(key, 'done');
  };

  for (const h of formulaHeaders) visit(h);
  return scope;
}

// What a template's formulas can name — every header plus the built-ins —
// and which of those are raw sheet columns, worked out once per template
// (its `headers` array is the key, like DATED above). Handing formula.js the
// SAME list every time is the point: it keeps its tokenizer per list, and an
// Overview tab resolves a scope for every node of its tree.
const NAMES = new WeakMap();
function namesFor(headers) {
  let known = NAMES.get(headers);
  if (!known) {
    known = { refNames: [...headers.map((h) => h.name), ...BUILTIN_NAMES], rawColumns: rawColumnsByName(headers) };
    NAMES.set(headers, known);
  }
  return known;
}

// How headers are told apart wherever one names another: by name, capitals
// and outer spaces aside (evalFormulaHeaders' own rule).
const nameKey = (name) => String(name ?? '').trim().toLowerCase();

// Which headers have to be worked out for a few wanted ones to come out
// right: themselves, plus everything their formulas read, and those
// formulas' own, and so on. A graph plots two or three headers and an
// Overview tab shows a handful — but each used to work out EVERY header of
// the template for every time bucket / every node of its tree, which was
// most of what a dashboard update cost. → a Set of nameKeys, or null for
// "all of them": when two formulas read each other, which one ends up
// '#CYCLE' depends on the order the whole list is visited in, so only the
// full pass can say.
const DEPENDENCIES = new WeakMap(); // headers → { cyclic, reads: Map<nameKey, nameKey[]> }
function dependenciesOf(headers) {
  let known = DEPENDENCIES.get(headers);
  if (known) return known;
  const { refNames } = namesFor(headers);
  const reads = new Map();
  for (const h of headers) {
    if (h.type !== 'formula' || !h.formula) continue;
    const key = nameKey(h.name);
    const names = [...formulaRefs(h.formula, refNames), ...refsIn(h.formula)].map(nameKey);
    reads.set(key, [...(reads.get(key) || []), ...names]);
  }
  const state = new Map(); // nameKey → 1 while being walked, 2 once clear
  const loops = (key) => {
    if (state.get(key) === 2) return false;
    if (state.get(key) === 1) return true;
    state.set(key, 1);
    for (const next of reads.get(key) || []) if (loops(next)) return true;
    state.set(key, 2);
    return false;
  };
  known = { reads, cyclic: [...reads.keys()].some(loops) };
  DEPENDENCIES.set(headers, known);
  return known;
}
function neededFor(headers, wanted) {
  const { cyclic, reads } = dependenciesOf(headers);
  if (cyclic) return null;
  const needed = new Set();
  const queue = wanted.map((h) => nameKey(h.name));
  while (queue.length) {
    const key = queue.pop();
    if (needed.has(key)) continue;
    needed.add(key);
    for (const next of reads.get(key) || []) queue.push(next);
  }
  return needed;
}

// A header's value on ONE sheet row — readHeaderFromRow, plus a Formula
// header worked out from that same row's values. readHeaderFromRow only
// reads sheet columns, so a formula header ("SKU ID" = [Sku Name]) used as
// an Overview level or the table's group-by came back empty on every row and
// everything fell into one blank group. Engine metrics (Profit/Loss…) aren't
// on a single sheet row, so a formula over those still has no per-row value.
// → `(header, row) => value`, one per template (`headers` is the key).
const ROW_READERS = new WeakMap();
export function rowValueReader(headers = []) {
  let reader = ROW_READERS.get(headers);
  if (reader) return reader;
  const { refNames, rawColumns } = namesFor(headers);
  const byName = new Map(headers.map((h) => [nameKey(h.name), h]));
  const byId = new Map(headers.map((h) => [h.id, h]));
  const read = (header, row, seen) => {
    // Mapped from other Our Headers (Template Settings › Header, the Our
    // Headers column): the first of them with a value on this row, else its
    // own sheet mapping.
    if (header?.type !== 'formula' && header?.fromHeaders?.length && !seen.has(header.id)) {
      const inner = new Set(seen).add(header.id);
      for (const id of header.fromHeaders) {
        const src = byId.get(id);
        const v = src ? read(src, row, inner) : undefined;
        if (v != null && String(v).trim() !== '') return v;
      }
    }
    if (header?.type !== 'formula' || !header.formula) return readHeaderFromRow(header, row);
    if (seen.has(header.id)) return undefined; // formulas reading each other
    const inner = new Set(seen).add(header.id);
    const scope = {};
    const kinds = {};
    for (const name of formulaRefs(header.formula, refNames)) {
      const dep = byName.get(nameKey(name));
      if (!dep) continue; // a builtin (Ads %, SKU Count…) — not a per-row value
      const v = read(dep, row, inner);
      if (v != null && String(v).trim() !== '') scope[name] = v;
      if (dep.type === 'date') kinds[name] = 'date';
    }
    const { value } = evaluateFormulaTyped(header.formula, scope, refNames, rawColumnReader(rawColumns, [row], readHeaderFromRow), { kindOf: (n) => kinds[n] });
    return value === '' || value == null ? undefined : value;
  };
  reader = (header, row) => read(header, row, new Set());
  ROW_READERS.set(headers, reader);
  return reader;
}

// Which table row (tableRows' `key`) a sheet row falls in: its SKU, or the
// template's group-by header's value — exactly how computeScope groups them.
// → a `(row) => key` for that config. The dashboard opens a row's own
// transactions with it (a "+N more" cell — calculationTasks 'children').
export function tableGroupKeyOf(config) {
  const headers = config?.headers || [];
  const groupBy = headers.find((h) => h.id === config?.marketplace?.groupByHeaderId);
  if (!groupBy || groupBy.primitive === 'sku') return (r) => r.sku;
  const readValue = rowValueReader(headers);
  return (r) => String(readValue(groupBy, r) ?? '—');
}

// rows (already filtered) → { skuRows, summary, aggregate scope, refNames }.
// `only` (neededFor — a Set of nameKeys, or null for every header) limits
// the work to those headers: the table cells, the aggregate and rowScopes
// then hold just them.
function computeScope(config, rows, { skuCostMap, ads, now }, only = null) {
  const headers = only ? config.headers.filter((h) => only.has(nameKey(h.name))) : config.headers;
  const dated = datedHeaderNames(config.headers);
  const readRow = rowValueReader(config.headers); // sheet columns, formulas, other Our Headers
  // header name → 'date' | 'days', for the headers whose value is one.
  const headerKinds = {};
  const groupBy = config.headers.find((h) => h.id === config.marketplace?.groupByHeaderId);
  const groupBySku = !groupBy || groupBy.primitive === 'sku';
  const groupKey = tableGroupKeyOf(config);

  const engineRows = groupBySku
    ? rows
    : rows.map((r) => ({ ...r, sku: groupKey(r) }));

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

  const { refNames, rawColumns } = namesFor(config.headers); // every name, whatever `only` says: a formula is read against the whole list

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
    const kinds = {};
    const shown = {};
    const groupRows = rowsBySku.get(sr.sku) || [];
    for (const h of headers) {
      if (h.primitive && h.primitive in sr) { scope[h.name] = sr[h.primitive]; continue; }
      if (h.type === 'formula') continue; // evalFormulaHeaders fills these in below
      if (h.type === 'date') { seedDate(h, groupRows, scope, kinds, shown, readRow); continue; }
      scope[h.name] = aggregateHeaderValue(h, groupRows, readRow);
    }
    evalFormulaHeaders(headers, scope, refNames, rawColumnReader(rawColumns, groupRows, readRow), kinds, now);
    const cells = {};
    for (const h of headers) {
      const raw = scope[h.name];
      cells[h.id] = { raw, display: cellDisplay(h, raw, kinds, shown, dated) };
      if (kinds[h.name] && !headerKinds[h.name]) headerKinds[h.name] = kinds[h.name];
    }
    return { key: sr.sku, company: companyLabel(sr.companies), cells };
  });

  // Aggregate scope: Σ of each header's numeric raw, plus the builtins. A
  // date can't be added up, and neither can a wait in days — across the
  // rows a date is the earliest and a day count the longest.
  const aggregate = { ...builtins };
  const noData = new Set(); // header names no row had a value for
  for (const h of headers) {
    const kind = headerKinds[h.name];
    if (kind) {
      let best = null;
      for (const r of tableRows) {
        const raw = r.cells[h.id]?.raw;
        if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
        if (best == null || (kind === 'date' ? raw < best : raw > best)) best = raw;
      }
      aggregate[h.name] = best ?? '';
      continue;
    }
    let sum = 0;
    let seen = false;
    let real = false; // an actual value, not a blank counted as 0
    const texts = new Set(); // values that aren't numbers — a SKU a formula passed through
    for (const r of tableRows) {
      const raw = r.cells[h.id]?.raw;
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isFinite(n)) { sum += n; seen = true; if (raw !== '' && raw != null) real = true; }
      else if (typeof raw === 'string' && raw.trim() !== '' && raw !== '#CYCLE') texts.add(raw);
    }
    // A column of text (no real number anywhere) shows its text, the way a
    // text header's group does — not a Σ of 0.
    if (!real && texts.size) {
      aggregate[h.name] = joinDistinct([...texts]);
      continue;
    }
    // A date formula no row could answer (every date blank) has no total either.
    aggregate[h.name] = !real && dated.has(h.name.trim().toLowerCase()) ? '' : seen ? Math.round(sum * 100) / 100 : 0;
    // No row had a value at all: 0 for the formulas / cards that add it up,
    // but a table shows "-" for it, not a 0 that was never there.
    if (!real) noData.add(h.name);
  }

  // One flat { [headerName]: value } scope per table row (post per-row formula
  // evaluation) — what a title card's SUM([Header]) / COUNT([Header]) reduce
  // over for a computed header (an engine metric, a formula); a raw sheet
  // column is read off the sheet rows themselves (see resolveTemplate).
  const rowScopes = tableRows.map((r) => Object.fromEntries(headers.map((h) => [h.name, r.cells[h.id]?.raw])));

  return { summary, skuRows, tableRows, aggregate, noData, rowScopes, refNames, rowCount, platforms, headerKinds };
}

// One Overview node's cells for its aggregated (non-level) headers. Text /
// alphanumeric / date mapped headers aren't summable — read straight off
// the node's raw rows (same helpers the main table uses) instead of the
// numeric-only aggregate Σ, which would otherwise collapse them to 0. The
// engine pass is skipped entirely when there's nothing numeric to show —
// and when it runs, it works out only what those headers need (`only` —
// neededFor of the ones that aren't read off the rows).
const isText = (h) => h.type === 'text' || h.type === 'alphanumeric';
const readOffRows = (h) => isText(h) || h.type === 'date';
function overviewCells(config, headers, groupRows, opts, only = null) {
  const scope = headers.some((h) => !readOffRows(h)) ? computeScope(config, groupRows, opts, only) : null;
  const dated = datedHeaderNames(config.headers);
  const readRow = rowValueReader(config.headers); // sheet columns, formulas, other Our Headers
  const cells = {};
  for (const h of headers) {
    if (h.type === 'date') { cells[h.id] = dateGroupValue(groupRows.map((r) => readRow(h, r))); continue; }
    const raw = isText(h) ? aggregateHeaderValue(h, groupRows, readRow) : scope.noData.has(h.name) ? '' : scope.aggregate[h.name];
    cells[h.id] = { raw, display: cellDisplay(h, raw, scope?.headerKinds || {}, {}, dated) };
  }
  const companies = [...new Set(groupRows.map((r) => r.company).filter(Boolean))];
  return { cells, company: companyLabel(companies) };
}

// An Overview's last level: the unique items a group of sheet rows holds —
// the normal tabs' row identity (rowIdentity.js): Account Name + SKU + Size,
// plus the Transaction-Id (else Order-Id) only when the overview SHOWS that
// column (as a level or a column) — `keyIds` 'txn' / 'order', exactly like a
// normal tab's rowKeyIds. A tab showing neither has one row per Account +
// SKU + Size, its orders added up. → [{ id, label, rows }] for
// buildOverviewTree `splitRows`. One item → [it] (the row stays as it is).
function uniqueItemsOf(headers, groupRows, path = [], keyIds = []) {
  const orderIdHeader = headers.find((h) => h.id === RESERVED_HEADER_IDS.orderId) || null;
  const txnHeader = headers.find((h) => h.id === RESERVED_HEADER_IDS.transactionId) || null;
  const readRow = rowValueReader(headers);
  const sizeOf = sizeReader(headers.find((h) => h.fixedKey === SIZE_KEY) || null, readRow);
  const idOf = (h, r, fallback) => {
    const v = h ? readHeaderFromRow(h, r) : null;
    return v != null && String(v).trim() !== '' ? v : fallback;
  };
  const groups = new Map(); // identity key → { id, rows }
  const useTxn = keyIds.includes('txn');
  const useOrder = keyIds.includes('order');
  groupRows.forEach((r) => {
    const id = rowIdentity(r, {
      orderId: useOrder ? idOf(orderIdHeader, r, r.orderId || r.meta?.Order_ID || r.meta?.Sub_Order_ID) : null,
      transactionId: useTxn ? idOf(txnHeader, r, r.settlementId || r.meta?.Transaction_ID || r.meta?.Settlement_ID) : null,
      size: sizeOf(r),
      own: '', // no id shown → it joins its Account + SKU + Size
    });
    if (!groups.has(id.key)) groups.set(id.key, { id, rows: [] });
    groups.get(id.key).rows.push(r);
  });
  // Each item's label: only the parts that differ between these items
  // (SKU, Size, Transaction / Order id) — one that is the same for all of
  // them, or already shown by the hierarchy above, is left out. The Account
  // Name is never put in a label: it only shows when it is one of the
  // overview's own levels. Nothing left → the level's own value.
  const shown = new Set(path.map((v) => String(v).trim().toLowerCase()));
  const norm = (v) => String(v ?? '').trim();
  const list = [...groups.values()].map(({ id, rows }) => ({ id, rows, parts: [id.sku, id.size, id.ref.startsWith('r:') ? '' : id.ref.slice(2)].map(norm) }));
  const varies = [0, 1, 2].map((i) => new Set(list.map((x) => x.parts[i].toLowerCase())).size > 1);
  const own = String(path[path.length - 1] ?? '').trim();
  return list
    .map(({ id, rows, parts }) => {
      const label = parts.filter((v, i) => v && varies[i] && !shown.has(v.toLowerCase())).join(' · ');
      return { id: id.key, label: label || own || `Row ${id.ref.slice(2)}`, rows };
    })
    .sort((a, b) => compareCellValues(a.label, b.label));
}

// The distinct orders in a group of sheet rows → [{ orderId, txnId }] (txnId
// '' where none is mapped / present) — what a Review picked on an Overview
// node is set on (DashboardWorkspace onReviewManyChange). [] without an
// Order-Id header.
function transactionsOf(headers, groupRows) {
  const orderIdHeader = headers.find((h) => h.id === RESERVED_HEADER_IDS.orderId);
  if (!orderIdHeader) return [];
  const transactionIdHeader = headers.find((h) => h.id === RESERVED_HEADER_IDS.transactionId) || null;
  const text = (v) => (v == null ? '' : String(v).trim());
  const seen = new Map();
  for (const r of groupRows) {
    const orderId = text(readHeaderFromRow(orderIdHeader, r));
    if (!orderId) continue;
    const txnId = transactionIdHeader ? text(readHeaderFromRow(transactionIdHeader, r)) : '';
    seen.set(`${orderId}\u0000${txnId}`, { orderId, txnId });
  }
  return [...seen.values()];
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
    overviewHeaderIds = null,
    now = Date.now(), // "today" for TODAY() in formulas
    // false = graphs and Overview tabs work out every header instead of only
    // what they show (neededFor). Same result either way — there for the
    // tests that prove exactly that.
    narrow = true,
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
    if (!companyMatches(company, r)) return false;
    return true;
  });

  const base = computeScope(config, filtered, { skuCostMap, ads, now });

  // Title cards (aggregate context) — SUM([Header]) / COUNT([Header]) reduce
  // a raw sheet column over every filtered sheet row (so a card's
  // COUNT([Status], "Delivered") is the delivered orders, the same total the
  // table's own count column adds up to), and a computed header over
  // base.rowScopes (every row currently in the filtered/grouped table).
  const sheetColumn = rawColumnReader(namesFor(headers).rawColumns, filtered, rowValueReader(headers));
  const cardRows = (name) => sheetColumn(name) ?? base.rowScopes.map((r) => r[name]);
  const titleCardValues = {};
  for (const card of config?.titleCards || []) {
    const typed = { kindOf: (name) => base.headerKinds[name], now };
    const main = evaluateValueBlockTyped(card.mainValue, base.aggregate, base.refNames, cardRows, typed);
    const sub = evaluateValueBlockTyped(card.subValue, base.aggregate, base.refNames, cardRows, typed);
    titleCardValues[card.id] = {
      main: { raw: main.value, display: fmtTyped(main.value, main.kind, card.mainValue?.format) },
      sub: { raw: sub.value, display: fmtTyped(sub.value, sub.kind, card.subValue?.format) },
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
      const only = narrow ? neededFor(headers, gHeaders) : null;
      const bucketScopes = bucketKeys.map((t) => computeScope(config, buckets.get(t), { skuCostMap, ads, now }, only));
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

  // Overview tabs — each a pivot on its own "unique value hierarchy"
  // (Level 1 → Level N, see lib/profitLoss/overviewTree.js): every node is
  // one distinct value at its level, nested under its parent's value, and
  // every other selected header aggregates (Σ, via the same computeScope)
  // over exactly that node's rows. SUM([Header]) / COUNT([Header]) inside
  // an overview header's own formula reduce over those rows too. Which
  // headers a tab's nodes carry is its own picks (ov.headerIds) unless the
  // caller names others in `overviewHeaderIds[ov.id]` — the dashboard's
  // My Details ticks; cells are only ever built for the ones shown.
  const overviews = {};
  const readLevel = rowValueReader(headers);
  for (const ov of config?.overviewTabs || []) {
    const picked = overviewLevelIds(ov).map((id) => headers.find((h) => h.id === id)).filter(Boolean);
    const shownIds = Array.isArray(overviewHeaderIds?.[ov.id]) ? overviewHeaderIds[ov.id] : ov.headerIds || [];
    // Exactly the levels created for this overview (Template Settings ›
    // Overview Tab) — nothing is added under them automatically.
    const levels = picked;
    const levelIds = new Set(levels.map((h) => h.id));
    const entry = {
      name: ov.name,
      fixedHeader: levels[0] || null,
      levels,
      autoLevelIds: levels.slice(picked.length).map((h) => h.id), // the ones added here, not picked
      headers: [],
      rows: [],
      tree: [],
      flatRows: [],
    };
    if (levels.length) {
      entry.headers = shownIds
        .filter((id) => !levelIds.has(id))
        .map((id) => headers.find((h) => h.id === id))
        .filter(Boolean);
      const only = narrow ? neededFor(headers, entry.headers.filter((h) => !readOffRows(h))) : null;
      // A Review / Reason column shown → each node also lists its orders
      // (`txns`), so a Yes / No picked on the node can be set on all of them.
      const reviewShown = entry.headers.some(isReviewField);
      // Which order ids split the last level: only the ones this overview
      // shows (a level or a column) — never a hidden one.
      const visibleIds = new Set([...levels, ...entry.headers].map((h) => h.id));
      const keyIds = [
        visibleIds.has(RESERVED_HEADER_IDS.transactionId) && 'txn',
        visibleIds.has(RESERVED_HEADER_IDS.orderId) && 'order',
      ].filter(Boolean);
      entry.tree = buildOverviewTree({
        levels,
        rows: filtered,
        readValue: readLevel,
        cellsFor: (groupRows) => {
          const out = overviewCells(config, entry.headers, groupRows, { skuCostMap, ads, now }, only);
          if (reviewShown) out.txns = transactionsOf(headers, groupRows);
          return out;
        },
        // The last level: one plain row per unique item, never merged.
        splitRows: (groupRows, path) => uniqueItemsOf(headers, groupRows, path, keyIds),
        // Never merge two accounts: one node per value per account (the
        // account is not shown) — unless Account Name is itself a level.
        accountOf: (r) => r.company,
        accountLevel: levels.some((h) => h.fixedKey === ACCOUNT_NAME_KEY),
      });
      entry.rows = entry.tree; // Level-1 nodes — same { key, company, cells } row shape as before
      entry.flatRows = flattenTree(entry.tree);
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
  if (key === 'sku') return joinDistinct(skuRows.map((s) => s.sku)) || undefined;
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
//
// `everyRow: true` — the normal tabs' tables: one row per unique item, SKU +
// Size + (Transaction Id, else Order Id, else the sheet row itself) —
// rowIdentity.js. A different SKU, size or transaction is never merged; no
// Order Id needed. Each row keeps its `sku` and `size` (the price boxes go
// by both).
export function resolveTransactionRows(config, opts = {}) {
  const {
    canonicalRows = [],
    skuCostMap = {},
    ads = { mode: 'percent', value: 0 },
    dateFrom = null,
    dateTo = null,
    platform = 'all',
    company = 'all',
    now = Date.now(),
    everyRow = false,
    // everyRow: which id columns the tab shows — 'txn' / 'order' (null =
    // all of them, then the row itself). Rows are keyed on SKU + Size + the
    // first of those the row has a value for; a tab showing none has one row
    // per SKU + Size.
    rowKeyIds = null,
  } = opts;

  const headers = Array.isArray(config?.headers) ? config.headers : [];
  const dated = datedHeaderNames(headers);
  const orderIdHeader = headers.find((h) => h.id === RESERVED_HEADER_IDS.orderId) || null;
  const transactionIdHeader = headers.find((h) => h.id === RESERVED_HEADER_IDS.transactionId) || null;
  if (!orderIdHeader && !everyRow) return { headers, rows: [], rowCount: 0 };

  const inRange = (iso) => {
    if (!iso) return true;
    if (dateFrom && iso < dateFrom) return false;
    if (dateTo && iso > dateTo) return false;
    return true;
  };
  const filtered = canonicalRows.filter((r) => {
    if (platform !== 'all' && r.platform !== platform) return false;
    if (!inRange(r.orderDate)) return false;
    if (!companyMatches(company, r)) return false;
    return true;
  });

  const { refNames, rawColumns } = namesFor(headers);
  const readRow = rowValueReader(headers);
  // The normal tabs' rows: one per SKU + Size + (Transaction Id → Order Id
  // → the row itself) — rowIdentity.js. Lines of one item (the same SKU and
  // size on the same transaction) add up into one row; any other SKU, size
  // or transaction is a row of its own.
  const sizeHeader = everyRow ? headers.find((h) => h.fixedKey === SIZE_KEY) || null : null;
  const sizeOf = sizeReader(sizeHeader, readRow);
  const idOf = (h, r, fallback) => {
    const v = h ? readHeaderFromRow(h, r) : null;
    return v != null && String(v).trim() !== '' ? v : fallback;
  };
  const identities = new Map(); // key → { sku, size }
  const groups = new Map(); // key -> rows[]
  for (const [i, r] of filtered.entries()) {
    let key;
    if (everyRow) {
      const useTxn = !rowKeyIds || rowKeyIds.includes('txn');
      const useOrder = !rowKeyIds || rowKeyIds.includes('order');
      const id = rowIdentity(r, {
        orderId: useOrder ? idOf(orderIdHeader, r, r.orderId || r.meta?.Order_ID || r.meta?.Sub_Order_ID) : null,
        transactionId: useTxn ? idOf(transactionIdHeader, r, r.settlementId || r.meta?.Transaction_ID || r.meta?.Settlement_ID) : null,
        size: sizeOf(r),
        // No id to tell it apart: by default it is only itself; on a tab
        // that shows no id column it joins its SKU + Size.
        own: rowKeyIds ? '' : r.rowId != null && String(r.rowId) !== '' ? r.rowId : `#${i}`,
      });
      key = id.key; // Account Name + SKU + Size + the shown ids (rowIdentity.js)
      if (!identities.has(key)) identities.set(key, id);
    } else {
      key = transactionKeyFor(r, orderIdHeader, transactionIdHeader);
    }
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const rows = [...groups.entries()].map(([key, groupRows]) => {
    const { summary, skuRows } = computeProfitLoss(groupRows, { skuCostMap: skuCostMap || {}, ads: ads || { mode: 'percent', value: 0 } });
    const builtins = {
      'Ads %': summary.ads.pct,
      'SKU Count': skuRows.length,
      'Settled SKU Count': summary.profitLoss.count,
      'Row Count': groupRows.length,
    };
    const scope = { ...builtins };
    const kinds = {};
    const shown = {};
    for (const h of headers) {
      if (h.primitive) { scope[h.name] = primitiveFromSkuRows(skuRows, h.primitive); continue; }
      if (h.type === 'formula') continue;
      if (h.type === 'date') { seedDate(h, groupRows, scope, kinds, shown, readRow); continue; }
      scope[h.name] = aggregateHeaderValue(h, groupRows, readRow);
    }
    evalFormulaHeaders(headers, scope, refNames, rawColumnReader(rawColumns, groupRows, readRow), kinds, now);
    const cells = {};
    for (const h of headers) {
      const raw = scope[h.name];
      cells[h.id] = { raw, display: cellDisplay(h, raw, kinds, shown, dated) };
    }
    const companies = [...new Set(groupRows.map((r) => r.company).filter(Boolean))];
    return everyRow
      ? { key, sku: groupRows[0]?.sku ?? null, size: identities.get(key)?.size || '', company: companyLabel(companies), cells }
      : { key, company: companyLabel(companies), cells };
  });

  // The normal tabs' rows come out in the uniqueness hierarchy's order —
  // Account Name → SKU → Size (S before M before L) → Transaction / Order —
  // what a download shows, and what the table starts from.
  if (everyRow) {
    const parts = (r) => {
      const id = identities.get(r.key);
      return [r.company, r.sku, r.size, id?.ref || ''];
    };
    rows.sort((a, b) => {
      const x = parts(a);
      const y = parts(b);
      for (let i = 0; i < x.length; i += 1) {
        const c = compareCellValues(x[i], y[i]);
        if (c) return c;
      }
      return 0;
    });
  }

  return { headers, rows, rowCount: filtered.length };
}
