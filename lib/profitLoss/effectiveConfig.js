// The effective config a marketplace's dashboard renders: the shared global
// Headers / Title Cards / Graphs / Tabs / Overview Tabs, plus this
// marketplace's own `marketplace` + `fileSlots`. Each global header's
// `mappedFrom` isn't stored on the header itself (the same header maps to a
// different sheet column per marketplace) — it's rebuilt here from the
// marketplace's fileSlots[].mappings before resolveTemplate (which stays
// marketplace-agnostic) ever sees it. `sheetHeaders` = every column this
// marketplace merges into the header (readHeaderFromRow tries each);
// slot/sheetHeader stay the last mapping, as before.
//
// Every saved global header always shows, mapped for this marketplace or
// not — switching Market Place changes where the data comes from, never
// what's shown; an unmapped header just renders blank. Pure — used by
// DashboardWorkspace and the node tests.
export function effectiveConfig(globalConfig, marketplaceConfig) {
  if (!globalConfig || !marketplaceConfig) return {};
  const fileSlots = marketplaceConfig.fileSlots || [];
  const mappedFromByHeaderId = new Map();
  for (const slot of fileSlots) {
    for (const m of slot.mappings || []) {
      const prev = mappedFromByHeaderId.get(m.headerId)?.sheetHeaders || [];
      const sheetHeaders = prev.includes(m.sheetHeader) ? prev : [...prev, m.sheetHeader];
      mappedFromByHeaderId.set(m.headerId, { slot: slot.id, sheetHeader: m.sheetHeader, sheetHeaders });
    }
  }
  return {
    ...globalConfig,
    headers: (globalConfig.headers || []).map((h) => ({ ...h, mappedFrom: mappedFromByHeaderId.get(h.id) || null })),
    marketplace: marketplaceConfig.marketplace || {},
    fileSlots,
  };
}
