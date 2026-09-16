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
  const merged = {
    ...a,
    meta: { ...b.meta, ...a.meta },
    fees: { ...a.fees },
    taxes: { ...a.taxes },
  };

  const fillIfEmpty = (field) => {
    if ((merged[field] == null || merged[field] === '') && b[field] != null && b[field] !== '') {
      merged[field] = b[field];
    }
  };
  ['orderDate', 'settlementDate', 'productName', 'commissionRate', 'brand', 'company', 'settlementId'].forEach(fillIfEmpty);

  if (merged.sku === '—' && b.sku && b.sku !== '—') merged.sku = b.sku;
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
