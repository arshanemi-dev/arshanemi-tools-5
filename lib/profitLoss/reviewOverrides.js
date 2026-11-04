import { readHeaderFromRow } from './resolveTemplate';
import { withCells } from './packedRows';

// Review / Reason (data/fixedHeaders.js) set on the Transactions page this
// session, kept apart from the uploaded rows — so a pick doesn't re-send
// every row to the calculation worker, re-merge the files and re-resolve the
// whole table (seconds on a long history). Applied where it's needed
// instead: onto the rows that are saved (applyReviewOverrides) and onto the
// Transactions rows on screen (patchTransactionRows). Pure.
//
// `overrides` = Map(Order-Id → Map(Transaction-Id or '' → { review:
// 'yes' | 'no', reviewReason })). Never mutated — withReviewOverride returns
// a new one.

const text = (v) => (v == null ? '' : String(v).trim());

export function withReviewOverride(overrides, orderId, txnId, state) {
  const next = new Map(overrides);
  next.set(orderId, new Map(overrides.get(orderId) || []).set(txnId, state));
  return next;
}

export const reviewOverrideOf = (overrides, orderId, txnId) => overrides.get(orderId)?.get(txnId) || null;

// The override for one uploaded row: the same Order-Id, and the same
// Transaction-Id where both have one (a merged order's other sheet may not).
function overrideForRow(byTxn, rowTxn) {
  if (rowTxn && byTxn.has(rowTxn)) return byTxn.get(rowTxn);
  if (byTxn.has('')) return byTxn.get('');
  if (!rowTxn) return byTxn.values().next().value || null;
  return null;
}

// A row's Order-Id / Transaction-Id, remembered per row object — a long
// history reads them once, not once per Review pick.
const idsCache = new WeakMap();
function idsOf(row, orderIdHeader, transactionIdHeader) {
  let ids = idsCache.get(row);
  if (!ids || ids.o !== orderIdHeader || ids.t !== transactionIdHeader) {
    ids = {
      o: orderIdHeader,
      t: transactionIdHeader,
      orderId: text(readHeaderFromRow(orderIdHeader, row)),
      txnId: transactionIdHeader ? text(readHeaderFromRow(transactionIdHeader, row)) : '',
    };
    idsCache.set(row, ids);
  }
  return ids;
}

// `rows` with each overridden transaction's rows replaced by a copy carrying
// its Review — every other row the very same object (the save ledger counts
// those as stored). `rows` itself when there's nothing to apply.
export function applyReviewOverrides(rows, overrides, orderIdHeader, transactionIdHeader) {
  if (!overrides.size || !orderIdHeader) return rows;
  return rows.map((row) => {
    const { orderId, txnId } = idsOf(row, orderIdHeader, transactionIdHeader);
    const byTxn = orderId ? overrides.get(orderId) : null;
    const state = byTxn && overrideForRow(byTxn, txnId);
    return state && (row.review !== state.review || row.reviewReason !== state.reviewReason) ? { ...row, ...state } : row;
  });
}

// The Transactions table's resolved rows with the overridden ones' Review /
// Reason cells swapped in — on the main thread, at once.
export function patchTransactionRows(rows, overrides, { orderId: orderCol, txnId: txnCol, review: reviewCol, reason: reasonCol }) {
  if (!overrides.size || !reviewCol) return rows;
  return rows.map((row) => {
    const state = reviewOverrideOf(overrides, text(row.cells[orderCol]?.raw), text(row.cells[txnCol]?.raw));
    if (!state) return row;
    const yes = state.review === 'yes';
    const changes = { [reviewCol]: { raw: yes ? 'Yes' : 'No', display: yes ? 'Yes' : 'No' } };
    if (reasonCol) {
      const reason = yes ? text(state.reviewReason) : '';
      changes[reasonCol] = { raw: reason, display: reason };
    }
    return { ...row, cells: withCells(row.cells, changes) };
  });
}
