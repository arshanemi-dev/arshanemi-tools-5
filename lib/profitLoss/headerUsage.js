import { refsIn } from '@/data/templateSchema';

// Where an Our Header (global config header) is used, and how to remove one
// without leaving the config pointing at it.

const norm = (s) => String(s ?? '').trim().toLowerCase();
const refsName = (formula, key) => refsIn(formula).some((r) => norm(r) === key);

// An Our Header = one created in Global Settings (default / manual), never a
// marketplace sheet column copied in automatically (source 'extracted').
export const isOurHeader = (h) => !!h && h.source !== 'extracted';

// Picker options for Title Card / Tab / Overview Tab / Graph header lists:
// Our Headers only. A sheet header already picked (`keepIds`) still shows —
// flagged — so an existing pick doesn't render as a raw id; it just can't be
// added anywhere new.
export function ourHeaderOptions(headers, keepIds = []) {
  const keep = new Set(keepIds);
  return (headers || [])
    .filter((h) => isOurHeader(h) || keep.has(h.id))
    .map((h) => ({ id: h.id, name: isOurHeader(h) ? h.name : `${h.name} (sheet)` }));
}

// → ['Tab “Dashboard”', 'Graph “Sales”', 'Header “Net” formula', ...]
export function headerUsages(config, header) {
  if (!header) return [];
  const { id } = header;
  const key = norm(header.name);
  const out = [];
  for (const t of config?.tabs || []) if ((t.headerIds || []).includes(id)) out.push(`Tab “${t.name}”`);
  for (const o of config?.overviewTabs || []) {
    if ((o.headerIds || []).includes(id) || (o.hierarchyHeaderIds || []).includes(id) || o.fixedHeaderId === id) out.push(`Overview Tab “${o.name}”`);
  }
  for (const g of config?.graphs || []) if ((g.headerIds || []).includes(id)) out.push(`Graph “${g.name}”`);
  for (const h of config?.headers || []) {
    if (h.id !== id && h.type === 'formula' && refsName(h.formula, key)) out.push(`Header “${h.name}” formula`);
  }
  for (const c of config?.titleCards || []) {
    if (refsName(c.mainValue?.formula, key) || refsName(c.subValue?.formula, key)) out.push(`Title Card “${c.name}”`);
  }
  return out;
}

// Remove a header and drop its id from every Tab / Overview Tab / Graph
// pick. Formula text referencing it by [name] can't be rewritten — the
// delete confirm lists those via headerUsages. Pure.
export function withoutHeader(config, id) {
  const drop = (ids) => (ids || []).filter((x) => x !== id);
  return {
    ...config,
    headers: (config.headers || []).filter((h) => h.id !== id),
    tabs: (config.tabs || []).map((t) => ({ ...t, headerIds: drop(t.headerIds) })),
    graphs: (config.graphs || []).map((g) => ({ ...g, headerIds: drop(g.headerIds) })),
    overviewTabs: (config.overviewTabs || []).map((o) => {
      const levels = o.hierarchyHeaderIds ? drop(o.hierarchyHeaderIds) : null;
      return {
        ...o,
        headerIds: drop(o.headerIds),
        ...(levels ? { hierarchyHeaderIds: levels } : {}),
        fixedHeaderId: o.fixedHeaderId === id ? (levels?.[0] ?? null) : o.fixedHeaderId,
      };
    }),
  };
}

// Headers auto-imported from marketplace sheets (source 'extracted', from
// before Our Headers stopped importing them): the unused ones are removed,
// the ones already picked into a Tab / Overview Tab / Graph / formula, or
// mapped in a marketplace (`mappedIds`), become regular Our Headers.
// → { config, removed, kept }
export function withoutAutoImported(config, mappedIds = new Set()) {
  let next = config;
  let removed = 0;
  let kept = 0;
  for (const h of config.headers || []) {
    if (h.source !== 'extracted') continue;
    if (mappedIds.has(h.id) || headerUsages(config, h).length) {
      kept += 1;
      next = { ...next, headers: next.headers.map((x) => (x.id === h.id ? { ...x, source: 'manual' } : x)) };
    } else {
      removed += 1;
      next = { ...next, headers: next.headers.filter((x) => x.id !== h.id) };
    }
  }
  return { config: next, removed, kept };
}
