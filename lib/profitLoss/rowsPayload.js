import { readHeaderFromRow } from './resolveTemplate';
import { canonicalRow } from '@/data/platforms/canonical';
import { sizeReader, variantKey } from './rowIdentity';

// Builds the payload for POST /api/profit-loss/rows (automatic, unmetered
// per-row persistence) — one entry per raw canonical row (NOT the per-SKU
// aggregated table). `data` is the canonical row itself, close to verbatim
// (sku/settlement/grossSale/qty/status/dates/fees/taxes/brand/company/meta —
// everything computeProfitLoss needs), not just a header-name subset, so a
// row fetched back later (GET, see below) can be dropped straight into
// canonicalRows and produce a real, fully-computed dashboard on refresh —
// not just a few descriptive columns next to blank financials. A row with
// no Order Id mapped/present can't be keyed at all and is skipped.
//
// The hub keeps ONE row per Order Id + Transaction Id, so lines of one order
// that differ in size / SKU (mergeRows.js variantKey) would overwrite each
// other: when an Order Id + Transaction Id is shared by more than one
// variant, each saves under "<Transaction Id>::<variant>" instead. Only the
// stored key changes — the row (and the ids the dashboard reads) don't.
// `sizeHeader` = the template's fixed Size header (rowIdentity.js) — the
// same size the merge and the tables go by.
export function buildExtractedRowsPayload(canonicalRows, orderIdHeader, transactionIdHeader, sizeHeader = null) {
  const out = [];
  const variantsOf = new Map(); // "order␀txn" -> Set of variant keys
  const readSize = sizeReader(sizeHeader, readHeaderFromRow);
  for (const r of canonicalRows) {
    const orderId = rowOrderId(r, orderIdHeader);
    if (!orderId) continue;
    const raw = transactionIdHeader ? readHeaderFromRow(transactionIdHeader, r) : null;
    const transactionId = raw != null && String(raw).trim() !== '' ? String(raw).trim() : null;
    const variant = variantKey(r, readSize);
    const account = String(r.company ?? '').trim();
    if (transactionId != null) {
      const k = `${orderId}\u0000${transactionId}`;
      if (!variantsOf.has(k)) variantsOf.set(k, { variants: new Set(), accounts: new Set() });
      variantsOf.get(k).variants.add(variant);
      variantsOf.get(k).accounts.add(account);
    }
    out.push({ orderId, transactionId, data: r, variant, account });
  }
  // Only a shared key gets a suffix — a row's saved key never changes
  // otherwise: "::<variant>" when its lines differ in size / SKU, "@<account>"
  // when the same Order Id + Transaction Id is in more than one account.
  return out.map(({ variant, account, ...entry }) => {
    const seen = entry.transactionId != null ? variantsOf.get(`${entry.orderId}\u0000${entry.transactionId}`) : null;
    if (!seen || (seen.variants.size < 2 && seen.accounts.size < 2)) return entry;
    const suffix = `${seen.variants.size > 1 ? `::${variant}` : ''}${seen.accounts.size > 1 ? `@${account}` : ''}`;
    return { ...entry, transactionId: `${entry.transactionId}${suffix}` };
  });
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
