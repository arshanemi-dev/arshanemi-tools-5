import { leafHeader, normHeader } from './canonical.js';

// Given one parsed sheet row (keyed by its ORIGINAL headers) build a lookup by
// normalised header, then resolve a canonical field against a list of
// candidate header names. Real seller-panel exports rename/re-case columns and
// carry extras — this keeps the per-platform mappers tolerant of that.
// A header joined from several header rows ("Order Details › Sub Order No",
// Template Settings) is also reachable by its own column name ("Sub Order
// No") — unless a real column already has that name, or two joined headers
// share it (then neither alias is guessed).
export function rowLookup(row) {
  const byNorm = {};
  const keys = Object.keys(row ?? {});
  for (const k of keys) byNorm[normHeader(k)] = row[k];
  const leafCount = {};
  for (const k of keys) if (leafHeader(k) !== k) { const n = normHeader(leafHeader(k)); leafCount[n] = (leafCount[n] || 0) + 1; }
  for (const k of keys) {
    if (leafHeader(k) === k) continue;
    const n = normHeader(leafHeader(k));
    if (!(n in byNorm) && leafCount[n] === 1) byNorm[n] = row[k];
  }
  return {
    raw: row ?? {},
    get(...candidates) {
      for (const c of candidates) {
        const v = byNorm[normHeader(c)];
        if (v !== undefined && v !== null && v !== '') return v;
      }
      return undefined;
    },
    has(...candidates) {
      return candidates.some((c) => normHeader(c) in byNorm);
    },
  };
}

// The normalised header set a platform fingerprint is checked against —
// joined multi-row headers also count by their own column name.
export function headerNormSet(headerRow = []) {
  const set = new Set();
  for (const h of headerRow) {
    if (!h) continue;
    set.add(normHeader(h));
    set.add(normHeader(leafHeader(h)));
  }
  return set;
}

// Does a set of normalised headers contain every name in `needed`?
export function headersHaveAll(normSet, needed) {
  return needed.every((n) => normSet.has(normHeader(n)));
}

// Does it contain at least one of `anyOf`?
export function headersHaveAny(normSet, anyOf) {
  return anyOf.some((n) => normSet.has(normHeader(n)));
}
