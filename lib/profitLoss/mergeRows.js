import { readHeaderFromRow, normalizeOrderId } from './resolveTemplate';
import { normHeader } from '@/data/platforms/canonical';

// Which raw sheet columns hold an AMOUNT — something that adds up (money, a
// quantity) rather than describes (a name, a date, a rate). Built from the
// template's Number headers: the columns each is mapped to, plus the header's
// own name / id (readHeaderFromRow matches those too). A percentage header is
// a rate, not an amount. → a `(columnName) => boolean` test for
// mergeUploadsAcrossSlots.
export function additiveColumnTest(headers) {
  const exact = new Set();
  const normalized = new Set();
  for (const h of headers || []) {
    if (h?.type !== 'number' || h.format === 'pct') continue;
    for (const col of h.mappedFrom?.sheetHeaders || (h.mappedFrom?.sheetHeader ? [h.mappedFrom.sheetHeader] : [])) exact.add(col);
    normalized.add(normHeader(h.name));
    normalized.add(normHeader(h.id));
  }
  if (!exact.size && !normalized.size) return () => false;
  return (col) => exact.has(col) || normalized.has(normHeader(col));
}

// Merges two canonical rows that represent the SAME transaction seen in two
// different uploaded files for one marketplace — e.g. a Payment file's
// settlement row and an Order file's product/date row for the same Order
// Id (+ Transaction Id, when both sheets carry one). Used by
// DashboardWorkspace's canonicalRows so a mapped header finds its value no
// matter which of the two files it actually came from, instead of the two
// sheets staying as disconnected, half-empty rows.
//
// `meta` (every raw sheet column, keyed by its own header text — what
// resolveTemplate's readHeaderFromRow reads a mapped header's value from)
// is unioned first, `a`'s own keys winning on a clash since it's whatever
// has already been accumulated for this transaction. A handful of the
// canonical fields most likely to live on only ONE of the two sheets are
// then filled in from `b` wherever `a` doesn't already have something
// meaningful. Pure — returns a new object, mutates neither input.
//
// `describeOnly` is for when ONE row `b` is being spread across SEVERAL
// rows: only what describes the transaction is copied, never an amount —
// `b`'s money and its `isAdditive` columns go to a single one of those rows
// (a normal merge), or they'd be counted once per row.
export function mergeCanonicalRows(a, b, { describeOnly = false, isAdditive = () => false } = {}) {
  const fromB = describeOnly
    ? Object.fromEntries(Object.entries(b?.meta || {}).filter(([k]) => !isAdditive(k)))
    : (b?.meta || {});
  const mergedMeta = { ...fromB, ...(a?.meta || {}) };
  for (const [k, v] of Object.entries(fromB)) {
    if ((mergedMeta[k] == null || String(mergedMeta[k]).trim() === '') && v != null && String(v).trim() !== '') {
      mergedMeta[k] = v;
    }
  }

  const merged = {
    ...a,
    meta: mergedMeta,
    fees: { ...(a.fees || {}) },
    taxes: { ...(a.taxes || {}) },
  };

  const fillIfEmpty = (field) => {
    if ((merged[field] == null || merged[field] === '') && b[field] != null && b[field] !== '') {
      merged[field] = b[field];
    }
  };
  ['orderDate', 'settlementDate', 'productName', 'commissionRate', 'brand', 'company', 'settlementId'].forEach(fillIfEmpty);

  if ((merged.sku === '—' || !merged.sku) && b.sku && b.sku !== '—') merged.sku = b.sku;
  if (describeOnly) return merged;

  if (!merged.grossSale && b.grossSale) merged.grossSale = b.grossSale;
  if (!merged.settlement && b.settlement) merged.settlement = b.settlement;
  if (!merged.shippingCredit && b.shippingCredit) merged.shippingCredit = b.shippingCredit;

  for (const k of Object.keys(merged.fees)) {
    if (!merged.fees[k] && b.fees?.[k]) merged.fees[k] = b.fees[k];
  }
  for (const k of Object.keys(merged.taxes)) {
    if (!merged.taxes[k] && b.taxes?.[k]) merged.taxes[k] = b.taxes[k];
  }

  return merged;
}

// The full cross-file match/merge + same-slot de-dupe DashboardWorkspace's
// canonicalRows runs — extracted here so anything else that needs the exact
// same result (the Sheet Debugger's "Merged" preview tab, currently) calls
// this instead of hand-copying the logic somewhere it could quietly drift
// out of sync. `uploads` = [{ slotId, mergeKey?, rows }] — `mergeKey`
// (one per sheet when a file's several sheets are read, see
// lib/profitLoss/ingest.js) wins over `slotId` as the "source" a row came
// from, so two sheets of one workbook match/merge by Order Id exactly like
// two separate files would. `rows` only need a `.meta`
// (or whatever readHeaderFromRow can already resolve a header against) to
// work; a full canonicalRow works too, `.meta` is all this function reads.
// `headers` (the template's own, optional) tells it which sheet columns are
// amounts — see additiveColumnTest.
//
// A Payment export is often one row per LINE ITEM (Order Id carries a
// trailing "_1"/"_2" suffix), while an Order export is often one row per
// ORDER (no suffix) — so an exact Order Id match alone would never link
// them. Before the exact match, this first tries a NORMALIZED (suffix-
// stripped) Order Id match across DIFFERENT sources, per normalized group:
//   - some source has several rows (line items) → every source with exactly
//     ONE row is order-level data, absorbed into each of those line items —
//     never kept as its own separate line. What DESCRIBES the order (product,
//     dates, text columns) goes onto every line item; its AMOUNTS (settlement,
//     gross sale, fees, taxes, Number-header columns) go onto the first line
//     item only. Copying an amount onto every line item counted it once per
//     line — an order with two item rows and one payment row showed twice
//     the settlement.
//   - every source has exactly one row (e.g. an Orders file + a Payments
//     file, one row per order each) → the earliest-uploaded source's row is
//     kept and the others are absorbed into it. (Each used to pick the other
//     as "its" source, so BOTH rows were dropped.)
// Within the SAME source, Order Id alone never merges/collapses anything —
// only an identical Order Id + Transaction Id pair does; anything short of
// that is always kept as its own row.
export function mergeUploadsAcrossSlots(uploads, orderIdHeader, transactionIdHeader, headers = []) {
  const isAdditive = additiveColumnTest(headers);
  const sourceOf = (u) => u.mergeKey || u.slotId;
  const keyFor = (r) => {
    let orderVal = orderIdHeader ? readHeaderFromRow(orderIdHeader, r) : null;
    if (!orderVal) orderVal = r.orderId || r.meta?.Order_ID || r.meta?.Sub_Order_ID || r.meta?.Merchant_Ref_No;

    let txnVal = transactionIdHeader ? readHeaderFromRow(transactionIdHeader, r) : null;
    if (!txnVal) txnVal = r.settlementId || r.meta?.Transaction_ID || r.meta?.Jio_Transaction_ID || r.meta?.Release_ID || r.meta?.Settlement_ID;

    const orderKey = orderVal != null && String(orderVal).trim() !== '' ? String(orderVal).trim() : null;
    const txnKey = txnVal != null && String(txnVal).trim() !== '' ? String(txnVal).trim() : null;
    if (!orderKey) return null;
    return { key: txnKey ? `${orderKey}::${txnKey}` : orderKey, hasTxn: !!txnKey };
  };
  const rowOrderNorm = (r) => {
    const val = orderIdHeader ? readHeaderFromRow(orderIdHeader, r) : (r.orderId || r.meta?.Order_ID || r.meta?.Sub_Order_ID || r.meta?.Merchant_Ref_No);
    return val ? normalizeOrderId(val) : '';
  };

  const bySlotInGroup = new Map(); // normalizedOrderId -> Map<slotId, rows[]>
  for (const u of uploads) {
    for (const r of u.rows) {
      const nk = rowOrderNorm(r);
      if (!nk) continue;
      if (!bySlotInGroup.has(nk)) bySlotInGroup.set(nk, new Map());
      const bySlot = bySlotInGroup.get(nk);
      if (!bySlot.has(sourceOf(u))) bySlot.set(sourceOf(u), []);
      bySlot.get(sourceOf(u)).push(r);
    }
  }
  // Enrichment plan per normalized group (see the header comment). A Map's
  // keys keep insertion order, so a group's first source = earliest upload.
  const enrichWith = new Map(); // row -> { rows: order-level rows merged into it, describeOnly }
  const consumed = new Set();
  for (const bySlot of bySlotInGroup.values()) {
    if (bySlot.size < 2) continue;
    const sources = [...bySlot.values()];
    const singles = sources.filter((rows) => rows.length === 1).map((rows) => rows[0]);
    if (!singles.length) continue;
    const lineItems = sources.filter((rows) => rows.length > 1).flat();
    if (lineItems.length) {
      for (const s of singles) consumed.add(s);
      lineItems.forEach((r, i) => enrichWith.set(r, { rows: singles, describeOnly: i > 0 }));
    } else {
      const [keep, ...others] = singles;
      for (const s of others) consumed.add(s);
      enrichWith.set(keep, { rows: others, describeOnly: false });
    }
  }

  const byKey = new Map(); // matchKey -> { row, slotId, hasTxn }
  const kept = [];
  for (const u of uploads) {
    for (const rawRow of u.rows) {
      if (consumed.has(rawRow)) continue;
      const plan = enrichWith.get(rawRow);
      const r = plan
        ? plan.rows.reduce((acc, s) => mergeCanonicalRows(acc, s, { describeOnly: plan.describeOnly, isAdditive }), rawRow)
        : rawRow;

      const k = keyFor(r);
      if (!k) { kept.push(r); continue; }

      const existing = byKey.get(k.key);
      if (!existing) { byKey.set(k.key, { row: r, slotId: sourceOf(u), hasTxn: k.hasTxn }); continue; }

      if (existing.slotId === sourceOf(u)) {
        if (!k.hasTxn) kept.push(r);
        continue;
      }
      existing.row = mergeCanonicalRows(existing.row, r);
    }
  }
  return [...[...byKey.values()].map((v) => v.row), ...kept];
}
