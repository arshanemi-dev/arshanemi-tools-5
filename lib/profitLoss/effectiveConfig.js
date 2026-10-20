import { sourceKey } from './rowSources';
import { withHeaderGroups } from './headerGroups';

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
// what's shown; an unmapped header just renders blank. The one exception is
// its Show / Hide switch: every header comes back with `isHidden` — true for
// the ones switched to Hidden, false for the rest — and a hidden one is still
// worked out but never a column (tabColumns.js). `headerGroups` = the live
// templates' { groups, members, hiddenHeaderIds } (headerGroups.js; null =
// not set up: nothing hidden, no groups); with it every header also carries
// its `groupId` and the config its `headerGroups` (in order) — what My
// Details groups its list by. Pure — used by DashboardWorkspace and the
// node tests.
export function effectiveConfig(globalConfig, marketplaceConfig, headerGroups = null) {
  if (!globalConfig || !marketplaceConfig) return {};
  const fileSlots = marketplaceConfig.fileSlots || [];
  const mappedFromByHeaderId = new Map();
  const sourcesByHeaderId = new Map(); // headerId → [{ src (null = any sheet), column, slot, sheet }]
  for (const slot of fileSlots) {
    for (const m of slot.mappings || []) {
      const prev = mappedFromByHeaderId.get(m.headerId)?.sheetHeaders || [];
      const sheetHeaders = prev.includes(m.sheetHeader) ? prev : [...prev, m.sheetHeader];
      mappedFromByHeaderId.set(m.headerId, { slot: slot.id, sheetHeader: m.sheetHeader, sheetHeaders });
      const src = m.sheet ? sourceKey(slot.id, m.sheet) : null;
      sourcesByHeaderId.set(m.headerId, [...(sourcesByHeaderId.get(m.headerId) || []), { src, column: m.sheetHeader, slot: slot.id, sheet: m.sheet || null }]);
    }
  }
  // A header mapped to a named sheet's column (Template Settings › Header:
  // File › Sheet › Header) also carries `sources`, in mapping order, for
  // readHeaderFromRow to read each from its own sheet (rowSources.js); when
  // EVERY mapping of it names a sheet it is `exact` — read from those
  // sheets only, never from a same-named column of another. A header with
  // only older "any sheet" mappings stays exactly as it was.
  for (const [headerId, sources] of sourcesByHeaderId) {
    if (!sources.some((s) => s.src)) continue;
    const mf = mappedFromByHeaderId.get(headerId);
    mappedFromByHeaderId.set(headerId, { ...mf, sources, ...(sources.every((s) => s.src) ? { exact: true } : {}) });
  }
  return withHeaderGroups({
    ...globalConfig,
    headers: (globalConfig.headers || []).map((h) => ({ ...h, mappedFrom: mappedFromByHeaderId.get(h.id) || null })),
    marketplace: marketplaceConfig.marketplace || {},
    fileSlots,
  }, headerGroups);
}
