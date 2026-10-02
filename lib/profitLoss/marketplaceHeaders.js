// Marketplace-wide view of a marketplace config's saved sheet headers, and
// the mapping edits the global Header section's matrix makes against it.
//
// Mappings still live where they always did — fileSlots[].mappings
// ({ sheetHeader, headerId }), so the dashboard merge, the Market Place
// Unmap/Map grid and both validators keep working untouched. The Header
// section works at marketplace level over the marketplace's UNIQUE headers
// (every file, every included sheet, de-duped case-/whitespace-
// insensitively): one global header can merge any number of a marketplace's
// columns. Mapping a column maps it in every file slot that has it;
// resolveTemplate only ever reads a mapping's sheetHeader off the row, so
// which slot holds it doesn't matter.

const norm = (s) => String(s ?? '').trim().toLowerCase();

// A slot's saved sheet columns (fileSlot.extractedHeaders), exact duplicates
// dropped. Today's "Save All Sheets" already de-dupes, but slots saved by
// the older single-sheet uploader can carry a column twice (Meesho's
// "Fixed Fee (Incl. GST)") — read them through this, never the raw array.
export function slotExtractedHeaders(slot) {
  return [...new Set(slot?.extractedHeaders || [])];
}

function slotColumns(slot) {
  const sheets = (Array.isArray(slot?.sheets) ? slot.sheets : []).filter((s) => s && s.include !== false);
  if (sheets.length) return sheets.flatMap((s) => (s.headers || []).map((h) => ({ name: h, source: `${slot.label} › ${s.name}` })));
  return slotExtractedHeaders(slot).map((h) => ({ name: h, source: slot.label }));
}

// → [{ name, sources: ['File 1 › Payments', ...] }] in first-seen order.
export function marketplaceUniqueHeaders(config) {
  const byKey = new Map();
  for (const slot of config?.fileSlots || []) {
    for (const { name, source } of slotColumns(slot)) {
      const key = norm(name);
      if (!key) continue;
      const entry = byKey.get(key) || { name: String(name).trim(), sources: [] };
      if (!entry.sources.includes(source)) entry.sources.push(source);
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()];
}

// headerId → every sheet header mapped to it in this marketplace (de-duped,
// first spelling wins) — one global header can merge several columns, e.g.
// "Sub Order No" from the Payments file + "Order ID" from the Orders file.
// Mappings pointing at a header id not in `knownIds` (deleted) are skipped.
export function mappedColumnsByHeader(config, knownIds = null) {
  const out = new Map();
  for (const slot of config?.fileSlots || []) {
    for (const m of slot.mappings || []) {
      if (knownIds && !knownIds.has(m.headerId)) continue;
      const list = out.get(m.headerId) || [];
      if (!list.some((s) => norm(s) === norm(m.sheetHeader))) list.push(m.sheetHeader);
      out.set(m.headerId, list);
    }
  }
  return out;
}

// Add `sheetHeaders` (any number) to one global header's mappings for this
// marketplace — existing mappings stay. Each column is mapped in every file
// slot that has it; a column no file lists anymore still lands in the first
// file rather than silently doing nothing. Pure — returns a new config.
export function withAddedMappings(config, headerId, sheetHeaders = []) {
  const targets = [...new Set(sheetHeaders.map(norm).filter(Boolean))];
  const placed = new Set();
  const fileSlots = (config?.fileSlots || []).map((slot) => {
    const mappings = [...(slot.mappings || [])];
    for (const key of targets) {
      const spelled = slotColumns(slot).find((c) => norm(c.name) === key)?.name;
      if (!spelled) continue;
      placed.add(key);
      if (!mappings.some((m) => m.headerId === headerId && norm(m.sheetHeader) === key)) mappings.push({ sheetHeader: spelled, headerId });
    }
    return { ...slot, mappings };
  });
  const orphans = targets.filter((k) => !placed.has(k));
  if (orphans.length && fileSlots.length) {
    const raw = (k) => String(sheetHeaders.find((s) => norm(s) === k)).trim();
    fileSlots[0] = { ...fileSlots[0], mappings: [...fileSlots[0].mappings, ...orphans.map((k) => ({ sheetHeader: raw(k), headerId }))] };
  }
  return { ...config, fileSlots };
}

// Remove every mapping that points at one of `headerIds` (every file slot) —
// used when an Our Header is deleted, and to clear mappings left behind by
// headers deleted before that cleanup existed. Pure.
export function withoutHeaderMappings(config, headerIds) {
  const drop = headerIds instanceof Set ? headerIds : new Set(headerIds);
  return {
    ...config,
    fileSlots: (config?.fileSlots || []).map((s) => ({ ...s, mappings: (s.mappings || []).filter((m) => !drop.has(m.headerId)) })),
  };
}

// Header ids this marketplace still maps to that no longer exist (`knownIds`
// = the global config's header ids) — such mappings do nothing on the
// dashboard and fail validation, which blocks Save.
export function staleMappingHeaderIds(config, knownIds) {
  const out = new Set();
  for (const s of config?.fileSlots || []) for (const m of s.mappings || []) if (!knownIds.has(m.headerId)) out.add(m.headerId);
  return out;
}

// Remove one column from one global header's mappings (every file slot).
export function withoutMapping(config, headerId, sheetHeader) {
  const key = norm(sheetHeader);
  return {
    ...config,
    fileSlots: (config?.fileSlots || []).map((slot) => ({
      ...slot,
      mappings: (slot.mappings || []).filter((m) => !(m.headerId === headerId && norm(m.sheetHeader) === key)),
    })),
  };
}
