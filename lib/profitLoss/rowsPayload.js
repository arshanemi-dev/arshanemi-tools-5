import { readHeaderFromRow } from './resolveTemplate';
import { canonicalRow } from '@/data/platforms/canonical';

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
    const orderId = rowOrderId(r, orderIdHeader);
    if (!orderId) continue;
    const transactionId = transactionIdHeader ? readHeaderFromRow(transactionIdHeader, r) : null;
    out.push({
      orderId,
      transactionId: transactionId != null && String(transactionId).trim() !== '' ? String(transactionId).trim() : null,
      data: r,
    });
  }
  return out;
}

// A row's Order Id exactly as it is saved (and billed — coins are charged
// once per Order Id, see lib/profitLoss/uploadBilling.js), or null.
export function rowOrderId(row, orderIdHeader) {
  const orderId = orderIdHeader ? readHeaderFromRow(orderIdHeader, row) : null;
  const id = orderId == null ? '' : String(orderId).trim();
  return id || null;
}

// The inverse — a row fetched back from GET /api/profit-loss/rows (each
// `{ id, orderId, transactionId, data, updatedAt }`) into a canonicalRows-
// shaped array, ready to feed straight into resolveTemplate. `data` is
// normally already a canonical row (see above) — but it's whatever was
// stored, so it goes back through canonicalRow first: a row saved by an
// older build, or with a field missing, gets every default (fees / taxes /
// meta objects, numeric money, a quantity) instead of crashing the engine on
// load. Fields canonicalRow doesn't know are kept as stored. `rowId` is
// re-asserted so cross-source de-dupe (DashboardWorkspace's canonicalRows
// merge) has something stable and unique to key uploads by.
export function rowsFromExtractedPayload(saved) {
  const objectOr = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  return saved.map((r) => {
    const data = objectOr(r.data);
    return {
      ...data,
      ...canonicalRow({ ...data, meta: objectOr(data.meta), fees: objectOr(data.fees), taxes: objectOr(data.taxes) }),
      rowId: data.rowId || `restored:${r.id}`,
    };
  });
}
