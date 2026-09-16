import { readHeaderFromRow } from './resolveTemplate';

// Builds the payload for POST /api/profit-loss/rows (automatic, unmetered
// per-row persistence) — one entry per raw canonical row (NOT the per-SKU
// aggregated table). `data` is the canonical row itself, close to verbatim
// (sku/settlement/grossSale/qty/status/dates/fees/taxes/brand/company/meta —
// everything computeProfitLoss needs), not just a header-name subset, so a
// row fetched back later (GET, see below) can be dropped straight into
// canonicalRows and produce a real, fully-computed dashboard on refresh —
// not just a few descriptive columns next to blank financials. A row with
// no Order Id mapped/present can't be keyed at all and is skipped.
export function buildExtractedRowsPayload(canonicalRows, orderIdHeader, transactionIdHeader) {
  const out = [];
  for (const r of canonicalRows) {
    const orderId = orderIdHeader ? readHeaderFromRow(orderIdHeader, r) : null;
    if (orderId == null || String(orderId).trim() === '') continue;
    const transactionId = transactionIdHeader ? readHeaderFromRow(transactionIdHeader, r) : null;
    out.push({
      orderId: String(orderId).trim(),
      transactionId: transactionId != null && String(transactionId).trim() !== '' ? String(transactionId).trim() : null,
      data: r,
    });
  }
  return out;
}

// The inverse — a row fetched back from GET /api/profit-loss/rows (each
// `{ id, orderId, transactionId, data, updatedAt }`) into a canonicalRows-
// shaped array, ready to feed straight into resolveTemplate. `data` is
// already a canonical row (see above), so this is close to a pass-through —
// it only re-asserts `rowId` so cross-source de-dupe (DashboardWorkspace's
// canonicalRows merge) has something stable and unique to key uploads by.
export function rowsFromExtractedPayload(saved) {
  return saved.map((r) => ({
    ...r.data,
    rowId: r.data?.rowId || `restored:${r.id}`,
  }));
}
