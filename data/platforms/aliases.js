import { normHeader } from './canonical.js';

// Given one parsed sheet row (keyed by its ORIGINAL headers) build a lookup by
// normalised header, then resolve a canonical field against a list of
// candidate header names. Real seller-panel exports rename/re-case columns and
// carry extras — this keeps the per-platform mappers tolerant of that.
export function rowLookup(row) {
  const byNorm = {};
  for (const k of Object.keys(row ?? {})) byNorm[normHeader(k)] = row[k];
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

// Does a set of normalised headers contain every name in `needed`?
export function headersHaveAll(normSet, needed) {
  return needed.every((n) => normSet.has(normHeader(n)));
}

// Does it contain at least one of `anyOf`?
export function headersHaveAny(normSet, anyOf) {
  return anyOf.some((n) => normSet.has(normHeader(n)));
}
