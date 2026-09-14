import { normHeader } from '@/data/platforms/canonical';

// Checks an uploaded sheet's header row against the headers the marketplace
// template saved for this file slot — captured in Template Settings when the
// slot's sample sheet was mapped (fileSlot.extractedHeaders). A slot with no
// saved headers yet (never sampled in the builder) has nothing to check
// against, so it always passes.
export function matchSlotHeaders(slot, headerRow = []) {
  const saved = slot?.extractedHeaders || [];
  if (!saved.length) return { ok: true, missing: [] };
  const have = new Set(headerRow.map(normHeader));
  const missing = saved.filter((h) => !have.has(normHeader(h)));
  return { ok: missing.length === 0, missing };
}
