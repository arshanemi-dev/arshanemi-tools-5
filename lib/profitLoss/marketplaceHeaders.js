// Marketplace-wide view of a marketplace config's saved sheet headers, and
// the mapping edits the global Header section's matrix makes against it.
//
// Mappings live where they always did — fileSlots[].mappings, so they sit
// inside their FILE — as { sheetHeader, headerId, sheet }: `sheet` names the
// sheet of that file the column is read from. The Header section lists a
// marketplace's columns as Market Place › File › Sheet › Header — every
// sheet's own, NOT de-duped (an "Amount" in two sheets is two columns) — and
// a mapping made there names its file and sheet, so the dashboard reads the
// value from exactly that sheet (effectiveConfig.js `sources`,
// resolveTemplate.js readHeaderFromRow). A mapping saved before sheets were
// named (no `sheet`) still means "this column, in any sheet": read by name,
// as it always was.

const norm = (s) => String(s ?? '').trim().toLowerCase();

// "File 1 › Payments" — where a column lives.
const pathOf = (slot, sheet) => (sheet ? `${slot.label || 'File'} › ${sheet}` : `${slot.label || 'File'}`);

// Every column of every file › included sheet, in that order, each listed
// once per sheet it is in → [{ key, slotId, slotLabel, sheet, name, path,
// label }]. `sheet` is null for a file saved before sheets existed (its
// extractedHeaders). `key` identifies the column (file + sheet + header).
export function marketplaceColumns(config) {
  const out = [];
  for (const slot of config?.fileSlots || []) {
    const sheets = (Array.isArray(slot?.sheets) ? slot.sheets : []).filter((s) => s && s.include !== false);
    const lines = sheets.length
      ? sheets.flatMap((s) => (s.headers || []).map((name) => ({ sheet: s.name, name })))
      : slotExtractedHeaders(slot).map((name) => ({ sheet: null, name }));
    const seen = new Set();
    for (const { sheet, name } of lines) {
      const clean = String(name ?? '').trim();
      const key = JSON.stringify([slot.id, sheet ?? '', norm(clean)]);
      if (!clean || seen.has(key)) continue;
      seen.add(key);
      const path = pathOf(slot, sheet);
      out.push({ key, slotId: slot.id, slotLabel: slot.label || 'File', sheet, name: clean, path, label: `${path} › ${clean}` });
    }
  }
  return out;
}

// Does mapping `m` (in the column's file) cover `column`? Same header, and
// the same sheet — or no sheet at all (an older "any sheet" mapping).
const covers = (m, column) => norm(m.sheetHeader) === norm(column.name) && (m.sheet == null || m.sheet === column.sheet);

// Is `column` (a marketplaceColumns entry) mapped to any header in
// `knownIds` (all, when null)?
export function isColumnMapped(config, column, knownIds = null) {
  const slot = (config?.fileSlots || []).find((s) => s.id === column.slotId);
  return (slot?.mappings || []).some((m) => (!knownIds || knownIds.has(m.headerId)) && covers(m, column));
}

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

// headerId → every column mapped to it in this marketplace, mapping by
// mapping → [{ slotId, slotLabel, sheet (null = any sheet of that file),
// name, path, label }] — one global header can merge several columns, e.g.
// "Payment File › Order Payments › Sub Order No" + "Order File › Sheet1 ›
// Sub Order No". Mappings pointing at a header id not in `knownIds`
// (deleted) are skipped.
export function mappedColumnsByHeader(config, knownIds = null) {
  const out = new Map();
  for (const slot of config?.fileSlots || []) {
    for (const m of slot.mappings || []) {
      if (knownIds && !knownIds.has(m.headerId)) continue;
      const sheet = m.sheet ?? null;
      const list = out.get(m.headerId) || [];
      if (list.some((c) => c.slotId === slot.id && c.sheet === sheet && norm(c.name) === norm(m.sheetHeader))) continue;
      const path = sheet ? pathOf(slot, sheet) : `${pathOf(slot, null)} › any sheet`;
      list.push({ slotId: slot.id, slotLabel: slot.label || 'File', sheet, name: m.sheetHeader, path, label: `${path} › ${m.sheetHeader}` });
      out.set(m.headerId, list);
    }
  }
  return out;
}

// Map `columns` (marketplaceColumns entries — any number, each naming its
// file and sheet) onto one global header for this marketplace — existing
// mappings stay. Each lands in its own file as { sheetHeader, headerId,
// sheet }. Pure — returns a new config.
export function withAddedMappings(config, headerId, columns = []) {
  const bySlot = new Map();
  for (const c of columns) {
    if (!c?.slotId || !String(c.name ?? '').trim()) continue;
    bySlot.set(c.slotId, [...(bySlot.get(c.slotId) || []), c]);
  }
  const fileSlots = (config?.fileSlots || []).map((slot) => {
    const add = bySlot.get(slot.id);
    if (!add) return slot;
    const mappings = [...(slot.mappings || [])];
    for (const c of add) {
      const sheet = c.sheet ?? null;
      const same = (m) => m.headerId === headerId && norm(m.sheetHeader) === norm(c.name) && (m.sheet ?? null) === sheet;
      if (!mappings.some(same)) mappings.push(sheet ? { sheetHeader: String(c.name).trim(), headerId, sheet } : { sheetHeader: String(c.name).trim(), headerId });
    }
    return { ...slot, mappings };
  });
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

// Remove one mapping from one global header — `target` = a
// mappedColumnsByHeader entry ({ slotId, sheet, name }): that file, that
// sheet (or the "any sheet" mapping when sheet is null), that column. Pure.
export function withoutMapping(config, headerId, target) {
  const sheet = target?.sheet ?? null;
  return {
    ...config,
    fileSlots: (config?.fileSlots || []).map((slot) => (slot.id !== target?.slotId ? slot : {
      ...slot,
      mappings: (slot.mappings || []).filter((m) => !(m.headerId === headerId && norm(m.sheetHeader) === norm(target.name) && (m.sheet ?? null) === sheet)),
    })),
  };
}
