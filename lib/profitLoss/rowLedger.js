// Which uploaded rows still have to be saved to the hub — so an upload sends
// only what it brought in or changed, in parts, instead of every row on
// screen again (lib/profitLoss/useRowSaver.js). Pure: no React, no network.
//
// A row counts as stored when
//  - it is the very object the hub handed back or took (load on refresh,
//    a part that saved) — merging leaves an untouched row the same object; or
//  - a merge rebuilt the object but what it holds is what is already stored
//    under its Order Id + Transaction Id (two files of one order merge into a
//    fresh object on every recalculation) — told by a hash of its JSON, so
//    the JSON itself needn't be kept.
// A row with no Transaction Id has no key of its own (one Order Id can repeat
// across line items), so only the first rule covers it.

// A 53-bit hash of a text (cyrb53).
function hashOf(text) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

const keyOf = (entry) => (entry.transactionId == null ? null : `${entry.orderId}\u0000${entry.transactionId}`);

export function createRowLedger() {
  let stored = new WeakSet(); // row objects the hub holds exactly as they are
  const hashes = new Map(); // "orderId␀transactionId" → hash of the JSON last stored under it

  return {
    // Rows that came from the hub are stored by definition.
    markStored(rows) {
      for (const row of rows) stored.add(row);
    },

    // `entries` = buildExtractedRowsPayload's ([{ orderId, transactionId,
    // data: row }]) → the ones still to save, as items for `record`.
    pending(entries) {
      const items = [];
      for (const entry of entries) {
        if (stored.has(entry.data)) continue;
        const key = keyOf(entry);
        const hash = key == null ? 0 : hashOf(JSON.stringify(entry.data));
        if (key != null && hashes.get(key) === hash) {
          stored.add(entry.data); // rebuilt by a merge, same content — nothing to send
          continue;
        }
        items.push({ entry, key, hash });
      }
      return items;
    },

    // These items were saved.
    record(items) {
      for (const { entry, key, hash } of items) {
        stored.add(entry.data);
        if (key != null) hashes.set(key, hash);
      }
    },

    // Rows were deleted from the hub: what is stored under their keys can no
    // longer be assumed, so the same rows uploaded again are saved again.
    // `keys` = [{ orderId, transactionId }] of the deleted rows (every key
    // when left out); `everything` also forgets which objects are stored —
    // the hub was wiped.
    forget({ keys = null, everything = false } = {}) {
      if (keys && !everything) {
        for (const k of keys) hashes.delete(keyOf(k));
      } else {
        hashes.clear();
      }
      if (everything) stored = new WeakSet();
    },
  };
}
