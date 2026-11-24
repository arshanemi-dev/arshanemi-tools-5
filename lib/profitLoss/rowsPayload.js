import { readHeaderFromRow, rowOrderRef, rowTxnRef } from './resolveTemplate';
import { canonicalRow } from '@/data/platforms/canonical';
import { rowIdentity, sizeReader, variantKey } from './rowIdentity';

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
  const keyCount = new Map(); // row key → how many rows so far
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
    // `rowKey` — what the hub keeps ONE row per (unique per user): the
    // uniqueness hierarchy, Account + SKU + Size + Transaction Id (else
    // Order Id). The same sheet uploaded again lands on the same keys and
    // updates them, never adds a copy. `replaces` = the hub ids of older
    // saved copies this row took over (mergeRows.js replaceEarlierCopies) —
    // the hub drops those that were saved before row keys existed.
    // Two lines of one and the same item in one file are both kept: the
    // 2nd, 3rd… is saved as "<key>#2", "#3"… in the order they come — the
    // same order on every upload of that file, so they too update in place.
    const baseKey = rowSaveKey(r, orderIdHeader, transactionIdHeader, readSize);
    const nth = (keyCount.get(baseKey) || 0) + 1;
    keyCount.set(baseKey, nth);
    const entry = { orderId, transactionId, rowKey: nth > 1 ? `${baseKey}#${nth}` : baseKey, data: r, variant, account };
    if (Array.isArray(r.replacesSavedIds) && r.replacesSavedIds.length) entry.replaces = r.replacesSavedIds;
    out.push(entry);
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

// rowOrderRef / rowTxnRef (a row's Order Id / Transaction Id, as the merge,
// the save and the tables read them) live in resolveTemplate.js.
export { rowOrderRef, rowTxnRef };

// The one key a row is told apart by — on screen, in the merge, and in the
// hub: Account Name + SKU + Size + (Transaction Id → else Order Id)
// (rowIdentity.js). null when the row has neither id (then it is only ever
// itself). `readSize` = sizeReader(...) of the template's Size header.
export function rowSaveKey(row, orderIdHeader, transactionIdHeader, readSize) {
  const orderId = rowOrderRef(row, orderIdHeader);
  const transactionId = rowTxnRef(row, transactionIdHeader);
  if (!orderId && !transactionId) return null;
  return rowIdentity(row, { orderId, transactionId, size: readSize(row) }).key;
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
    const { replacesSavedIds: _done, ...rest } = data; // already dropped by the hub
    return {
      ...rest,
      ...canonicalRow({ ...rest, meta: objectOr(rest.meta), fees: objectOr(rest.fees), taxes: objectOr(rest.taxes) }),
      rowId: rest.rowId || `restored:${r.id}`,
      // Its hub id — what a later upload of the same item replaces
      // (mergeRows.js replaceEarlierCopies).
      savedId: r.id,
    };
  });
}
