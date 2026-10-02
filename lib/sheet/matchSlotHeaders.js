import { normHeader } from '@/data/platforms/canonical';
import { slotExtractedHeaders } from '@/lib/profitLoss/marketplaceHeaders';

// Checks an uploaded sheet's header row against the headers the marketplace
// template saved for this file slot — captured in Template Settings when the
// slot's sample sheet was mapped (fileSlot.extractedHeaders). A slot with no
// saved headers yet (never sampled in the builder) has nothing to check
// against, so it always passes.
//
// A slot saved via "Save All Sheets" (fileSlot.sheets[]) spans several
// sheets, so its headers are checked against EVERY parsed tab of the upload
// (`wb`, the readAnyFile result) instead of the one best tab's header row.
// A saved sheet the upload also has, but with no data table this time, is
// skipped rather than reported missing.
function includedSheets(slot) {
  return (Array.isArray(slot?.sheets) ? slot.sheets : []).filter((s) => s && s.include !== false);
}

function expectedHeaders(slot, wb) {
  const sheets = includedSheets(slot);
  if (!sheets.length) return slotExtractedHeaders(slot);
  if (!wb) return sheets.flatMap((s) => s.headers || []);
  const parsed = new Set(wb.sheetNames || []);
  const present = new Set(wb.allSheetNames || wb.sheetNames || []);
  return sheets.filter((s) => parsed.has(s.name) || !present.has(s.name)).flatMap((s) => s.headers || []);
}

export function matchSlotHeaders(slot, headerRow = [], { wb = null } = {}) {
  const saved = expectedHeaders(slot, wb);
  if (!saved.length) return { ok: true, missing: [] };
  const acrossTabs = includedSheets(slot).length > 0 && wb?.byTab;
  const haveList = acrossTabs ? Object.values(wb.byTab).flatMap((t) => t?.headerRow || []) : headerRow;
  const have = new Set(haveList.map(normHeader));
  const missing = [...new Set(saved.filter((h) => !have.has(normHeader(h))))];
  return { ok: missing.length === 0, missing };
}
