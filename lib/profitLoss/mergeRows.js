import { readHeaderFromRow, normalizeOrderId } from './resolveTemplate';
import { normHeader } from '@/data/platforms/canonical';
import { mergedSources, sourcesOf } from './rowSources';
import { SIZE_KEY, rowIdentity, sameVariant as sameVariantBy, sizeReader, variantKey as variantKeyBy } from './rowIdentity';
import { rowOrderRef, rowTxnRef } from './rowsPayload';

// The upload that holds the rows saved in the user's account (loaded back on
// refresh) — DashboardWorkspace's restored slot. Always the OLDEST copy.
export const RESTORED_SLOT_ID = 'restored';

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

// A row's VARIANT — its SKU and its Size (rowIdentity.js: the template's
// Size header, else a sheet column named Size / Variant / Variation). Two
// rows of one Order Id + Transaction Id that differ in either are different
// items — a size S and a size M line — and are never merged, de-duped or
// saved over each other. An empty side matches anything (a Payment file with
// no size column still enriches its order's sized row).

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
  // Which file › sheet each value came from (rowSources.js): `meta` keeps
  // one value per column name, so a column both sheets have with different
  // values keeps each sheet's own in `bySource` — what a header mapped to one
  // sheet's column reads.
  const provenance = mergedSources(a, b, Object.keys(fromB), { describeOnly });
  if (provenance === null) {
    delete merged.src;
    delete merged.srcs;
    delete merged.bySource;
  } else {
    Object.assign(merged, provenance);
  }

  const fillIfEmpty = (field) => {
    if ((merged[field] == null || merged[field] === '') && b[field] != null && b[field] !== '') {
      merged[field] = b[field];
    }
  };
  ['orderDate', 'settlementDate', 'productName', 'commissionRate', 'brand', 'company', 'settlementId'].forEach(fillIfEmpty);
  // A Review set on either sheet's row (data/fixedHeaders.js) carries over.
  if (!merged.review && b.review) {
    merged.review = b.review;
    merged.reviewReason = b.reviewReason;
  }
  // The costs written onto an order at upload (`skuCost` —
  // lib/profitLoss/skuCosts.js) are a price, not an amount: `a` keeps its
  // own, and takes from `b` only a cost it has none of — so an order that is
  // uploaded again keeps the price it already had.
  if (b.skuCost) merged.skuCost = { ...b.skuCost, ...(a.skuCost || {}) };

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
// The same item uploaded AGAIN replaces its earlier copy instead of being
// added a second time. An item is the uniqueness hierarchy — Account Name +
// SKU + Size + Order Id (rowIdentity.js); two copies are the same item when
// their Transaction Ids agree (or one of them has none).
//
// A row replaces an earlier copy when that copy came from an EARLIER upload
// (a different file / a second upload of the same file — never another line
// of the same file, which is kept as it always was) and either
//  - both came from the same file slot (› sheet), or
//  - the copy is one saved in the account (RESTORED_SLOT_ID) that the same
//    slot built (or one saved before rows recorded where they came from).
// The new row wins on every value; the copy only fills what the new row
// has empty — so what another file (a Payments sheet) had merged into the
// saved copy is kept. A saved copy's hub id goes on the new row
// (`replacesSavedIds`) so the save can drop the old copy there too.
//
// → the uploads again, the saved rows first (they are always the oldest),
// with replaced copies gone. Untouched rows stay the same objects.
export function replaceEarlierCopies(uploads, { orderIdHeader, transactionIdHeader, readSize, sourceOf }) {
  const ordered = [
    ...uploads.filter((u) => u.slotId === RESTORED_SLOT_ID),
    ...uploads.filter((u) => u.slotId !== RESTORED_SLOT_ID),
  ];
  const groups = new Map(); // item key → [{ row, uid, upload, txn }]
  const swapped = new Map(); // a row → the row that took its copy over
  const dropped = new Set();
  const canReplace = (old, upload, row) => {
    if (sourceOf(old.upload) === sourceOf(upload)) return true;
    if (old.upload.slotId !== RESTORED_SLOT_ID) return false;
    const from = sourcesOf(old.row);
    return !from.length || !row.src || from.includes(row.src);
  };
  ordered.forEach((u, ui) => {
    const uid = u.id ?? `#${ui}`;
    for (const raw of u.rows) {
      const orderId = rowOrderRef(raw, orderIdHeader);
      if (!orderId) continue; // only an Order Id says two rows are one item
      const key = rowIdentity(raw, { orderId, size: readSize(raw) }).key;
      const txn = rowTxnRef(raw, transactionIdHeader) || '';
      const list = groups.get(key) || [];
      if (!groups.has(key)) groups.set(key, list);
      let copies = list.filter((e) => e.uid !== uid && (!e.txn || !txn || e.txn === txn) && canReplace(e, u, raw));
      // A row with no Transaction Id facing copies of several different
      // transactions can't tell which is its own — it takes over only the
      // copies with none.
      if (!txn && new Set(copies.map((e) => e.txn).filter(Boolean)).size > 1) copies = copies.filter((e) => !e.txn);
      if (!copies.length) { list.push({ row: raw, uid, upload: u, txn }); continue; }
      const row = mergeCanonicalRows(raw, copies[0].row);
      const savedIds = copies.flatMap((e) => [
        ...(e.upload.slotId === RESTORED_SLOT_ID && e.row.savedId ? [e.row.savedId] : []),
        ...(e.row.replacesSavedIds || []),
      ]);
      delete row.savedId; // a fresh row — its own hub id comes when it is saved
      if (savedIds.length) row.replacesSavedIds = [...new Set(savedIds)];
      else delete row.replacesSavedIds;
      for (const e of copies) dropped.add(e.row);
      swapped.set(raw, row);
      groups.set(key, [...list.filter((e) => !copies.includes(e)), { row, uid, upload: u, txn: txn || copies[0].txn }]);
    }
  });
  if (!swapped.size) return ordered;
  return ordered.map((u) => {
    const rows = u.rows.map((r) => swapped.get(r) || r).filter((r) => !dropped.has(r));
    return rows.length === u.rows.length && rows.every((r, i) => r === u.rows[i]) ? u : { ...u, rows };
  });
}

export function mergeUploadsAcrossSlots(rawUploads, orderIdHeader, transactionIdHeader, headers = []) {
  const isAdditive = additiveColumnTest(headers);
  const readSize = sizeReader((headers || []).find((h) => h?.fixedKey === SIZE_KEY) || null, readHeaderFromRow);
  const uploads = replaceEarlierCopies(rawUploads, { orderIdHeader, transactionIdHeader, readSize, sourceOf: (u) => u.mergeKey || u.slotId });
  const variantKey = (r) => variantKeyBy(r, readSize);
  const sameVariant = (a, b) => sameVariantBy(a, b, readSize);
  const sourceOf = (u) => u.mergeKey || u.slotId;
  const accountOf = (r) => String(r?.company ?? '').trim().toLowerCase();
  const keyFor = (r) => {
    let orderVal = orderIdHeader ? readHeaderFromRow(orderIdHeader, r) : null;
    if (!orderVal) orderVal = r.orderId || r.meta?.Order_ID || r.meta?.Sub_Order_ID || r.meta?.Merchant_Ref_No;

    let txnVal = transactionIdHeader ? readHeaderFromRow(transactionIdHeader, r) : null;
    if (!txnVal) txnVal = r.settlementId || r.meta?.Transaction_ID || r.meta?.Jio_Transaction_ID || r.meta?.Release_ID || r.meta?.Settlement_ID;

    const orderKey = orderVal != null && String(orderVal).trim() !== '' ? String(orderVal).trim() : null;
    const txnKey = txnVal != null && String(txnVal).trim() !== '' ? String(txnVal).trim() : null;
    if (!orderKey) return null;
    // Account Name is part of it: the same Order Id in two accounts is two
    // orders — never merged or de-duped into one.
    return { key: `${accountOf(r)}\u0000${txnKey ? `${orderKey}::${txnKey}` : orderKey}`, hasTxn: !!txnKey };
  };
  const rowOrderNorm = (r) => {
    const val = orderIdHeader ? readHeaderFromRow(orderIdHeader, r) : (r.orderId || r.meta?.Order_ID || r.meta?.Sub_Order_ID || r.meta?.Merchant_Ref_No);
    return val ? `${accountOf(r)}\u0000${normalizeOrderId(val)}` : '';
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
      // One row per source: the earliest absorbs the others of the SAME
      // variant; a row of another size / SKU stays its own row.
      const [keep, ...rest] = singles;
      const others = rest.filter((s) => sameVariant(keep, s));
      for (const s of others) consumed.add(s);
      if (others.length) enrichWith.set(keep, { rows: others, describeOnly: false });
    }
  }

  // matchKey -> [{ row, slotId, hasTxn, from: Set of sources merged in }] —
  // several per key when an order's lines differ in size / SKU.
  const byKey = new Map();
  const entries = [];
  const kept = [];
  for (const u of uploads) {
    const src = sourceOf(u);
    for (const rawRow of u.rows) {
      if (consumed.has(rawRow)) continue;
      const plan = enrichWith.get(rawRow);
      const r = plan
        ? plan.rows.reduce((acc, s) => mergeCanonicalRows(acc, s, { describeOnly: plan.describeOnly, isAdditive }), rawRow)
        : rawRow;

      const k = keyFor(r);
      if (!k) { kept.push(r); continue; }

      const list = byKey.get(k.key) || [];
      if (!byKey.has(k.key)) byKey.set(k.key, list);
      // The same file: only a true duplicate (same Order Id + Transaction Id
      // AND same size / SKU) goes; any other line is its own row.
      // (A row another file already merged into counts as that file's too.)
      const sameSource = list.find((e) => e.from.has(src)
        && (variantKey(e.row) === variantKey(r) || (e.slotId !== src && sameVariant(e.row, r))));
      if (sameSource) {
        if (!k.hasTxn) kept.push(r);
        continue;
      }
      // Another file: merge into a row of the same variant that hasn't
      // taken a row from this file yet — never two sizes into one.
      const match = list.find((e) => !e.from.has(src) && sameVariant(e.row, r));
      if (match) {
        match.row = mergeCanonicalRows(match.row, r);
        match.from.add(src);
        continue;
      }
      const entry = { row: r, slotId: src, hasTxn: k.hasTxn, from: new Set([src]) };
      list.push(entry);
      entries.push(entry);
    }
  }
  return [...entries.map((e) => e.row), ...kept];
}
