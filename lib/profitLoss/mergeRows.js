import { readHeaderFromRow, normalizeOrderId } from './resolveTemplate';

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
export function mergeCanonicalRows(a, b) {
  const mergedMeta = { ...(b?.meta || {}), ...(a?.meta || {}) };
  if (b?.meta) {
    for (const [k, v] of Object.entries(b.meta)) {
      if ((mergedMeta[k] == null || String(mergedMeta[k]).trim() === '') && v != null && String(v).trim() !== '') {
        mergedMeta[k] = v;
      }
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
// out of sync. `uploads` = [{ slotId, rows }] — `rows` only need a `.meta`
// (or whatever readHeaderFromRow can already resolve a header against) to
// work; a full canonicalRow works too, `.meta` is all this function reads.
//
// A Payment export is often one row per LINE ITEM (Order Id carries a
// trailing "_1"/"_2" suffix), while an Order export is often one row per
// ORDER (no suffix) — so an exact Order Id match alone would never link
// them. Before the exact match, this first tries a NORMALIZED (suffix-
// stripped) Order Id match across DIFFERENT slots: whichever slot
// contributes exactly ONE row to a normalized group (while another slot
// contributes at all) is that group's order-level data source and gets
// absorbed into every other row in the group — never kept as its own
// separate, financial-data-free line (which would double-count quantities).
// Within the SAME slot, Order Id alone never merges/collapses anything —
// only an identical Order Id + Transaction Id pair does; anything short of
// that is always kept as its own row.
export function mergeUploadsAcrossSlots(uploads, orderIdHeader, transactionIdHeader) {
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
      if (!bySlot.has(u.slotId)) bySlot.set(u.slotId, []);
      bySlot.get(u.slotId).push(r);
    }
  }
  const enrichmentSourceFor = (r, ownSlotId) => {
    const nk = rowOrderNorm(r);
    const bySlot = nk ? bySlotInGroup.get(nk) : null;
    if (!bySlot || bySlot.size < 2) return null;
    for (const [slotId, rows] of bySlot) {
      if (slotId !== ownSlotId && rows.length === 1) return rows[0];
    }
    return null;
  };
  const consumed = new Set();
  for (const u of uploads) {
    for (const r of u.rows) {
      const src = enrichmentSourceFor(r, u.slotId);
      if (src) consumed.add(src);
    }
  }

  const byKey = new Map(); // matchKey -> { row, slotId, hasTxn }
  const kept = [];
  for (const u of uploads) {
    for (const rawRow of u.rows) {
      if (consumed.has(rawRow)) continue;
      const src = enrichmentSourceFor(rawRow, u.slotId);
      const r = src ? mergeCanonicalRows(rawRow, src) : rawRow;

      const k = keyFor(r);
      if (!k) { kept.push(r); continue; }

      const existing = byKey.get(k.key);
      if (!existing) { byKey.set(k.key, { row: r, slotId: u.slotId, hasTxn: k.hasTxn }); continue; }

      if (existing.slotId === u.slotId) {
        if (!k.hasTxn) kept.push(r);
        continue;
      }
      existing.row = mergeCanonicalRows(existing.row, r);
    }
  }
  return [...[...byKey.values()].map((v) => v.row), ...kept];
}
