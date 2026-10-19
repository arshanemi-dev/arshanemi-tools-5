import { AGGREGATE_BUILTIN_NAMES, refsIn } from '@/data/templateSchema';
import { AGG_FN_RE, formulaRefs, labelPattern } from './formula';

// Where an Our Header (global config header) is used, and how to rename or
// remove one without leaving the config pointing at it.

const norm = (s) => String(s ?? '').trim().toLowerCase();

// Every name a formula of this config can reference — the headers' and the
// built-ins' (the list resolveTemplate evaluates formulas against).
const refNamesOf = (config) => [...(config?.headers || []).map((h) => h.name), ...AGGREGATE_BUILTIN_NAMES];

// Does `formula` name the header whose lower-cased name is `key` — as
// [Name], as a bare Name (the tokenizer reads a known name without brackets
// too) or in SUM / COUNT([Name])?
const refsName = (formula, key, refNames) =>
  refsIn(formula).some((r) => norm(r) === key) || formulaRefs(formula, refNames).some((r) => norm(r) === key);

// One formula with every reference to the header `from` pointing at `to`:
// [From], a bare From and SUM / COUNT([From], …), found the way the
// evaluator finds them, against the names the formula was written with
// (`refNames`). A COUNT's filter values are text, not references, so they
// stay as typed — COUNT([Status], "Delivered") keeps its "Delivered" when the
// Delivered header is renamed. The new name is always written as [To]: a
// bracket can't run into the text around it.
export function renameRef(formula, from, to, refNames = []) {
  if (!formula || typeof formula !== 'string') return formula;
  const key = norm(from);
  const re = new RegExp(`(\\btoday\\s*\\(\\s*\\))|\\[([^[\\]]+)\\]|(${labelPattern([...refNames, from])})`, 'gi');
  const swap = (text) => text.replace(re, (whole, today, bracketed, bare) => (norm(bracketed ?? bare) === key ? `[${to}]` : whole));
  let out = '';
  let last = 0;
  for (const m of formula.matchAll(AGG_FN_RE)) {
    out += swap(formula.slice(last, m.index));
    out += norm(m[2]) === key ? m[0].replace(`[${m[2]}]`, () => `[${to}]`) : m[0];
    last = m.index + m[0].length;
  }
  return out + swap(formula.slice(last));
}

// Why `name` can't be a header's name, or '' when it can: a formula names a
// header by its name, so no two headers (or a header and a built-in) may
// share one — renaming would merge their references — and a bracket would
// end the [reference] early.
export function headerNameProblem(config, id, name) {
  const key = norm(name);
  if (!key) return 'Give the header a name';
  const own = (config?.headers || []).find((h) => h.id === id);
  if (own && own.name.trim() === name.trim()) return ''; // keeping its own name (even one saved before this check)
  if (/[[\]]/.test(name)) return 'A header name can’t contain [ or ]';
  const clash = (config?.headers || []).find((h) => h.id !== id && norm(h.name) === key);
  if (clash) return `Another header is already called “${clash.name}”`;
  if (AGGREGATE_BUILTIN_NAMES.some((b) => norm(b) === key)) return `“${name.trim()}” is a built-in name`;
  return '';
}

// Edit one header (`patch` — any of its fields, the Edit popup's or just a
// rename). A new name is written into every formula that used the old one —
// other headers' and the Title Cards' main and sub values. Everything else
// points at a header by id, so it follows on its own: Tabs, Overview Tabs,
// Graphs, hierarchy levels and every marketplace's mappings. Pure.
export function withHeaderUpdate(config, id, patch) {
  const header = (config?.headers || []).find((h) => h.id === id);
  if (!header) return config;
  const to = typeof patch?.name === 'string' ? patch.name.trim() : header.name;
  const headers = config.headers.map((h) => (h.id === id ? { ...h, ...patch, name: to } : h));
  if (to === header.name) return { ...config, headers };

  const refNames = refNamesOf(config); // the names every formula was written against, the old one among them
  const rename = (formula) => renameRef(formula, header.name, to, refNames);
  const value = (v) => (v?.formula ? { ...v, formula: rename(v.formula) } : v);
  return {
    ...config,
    headers: headers.map((h) => (h.formula ? { ...h, formula: rename(h.formula) } : h)),
    titleCards: (config.titleCards || []).map((c) => ({ ...c, mainValue: value(c.mainValue), subValue: value(c.subValue) })),
  };
}

// An Our Header = one created in Global Settings (default / manual), never a
// marketplace sheet column copied in automatically (source 'extracted').
export const isOurHeader = (h) => !!h && h.source !== 'extracted';

// Picker options for the Tab / Overview Tab / Graph header lists in Template
// Settings: every header of the template — Our Headers and the marketplace
// sheet columns copied in (flagged "(sheet)" so the two read apart).
export function headerPickerOptions(headers) {
  return (headers || []).map((h) => ({ id: h.id, name: isOurHeader(h) ? h.name : `${h.name} (sheet)` }));
}

// The formulas that name `header` — other headers' and the Title Cards'.
// → ['Header “Net” formula', 'Title Card “Bank”']. A header any formula
// names can't be deleted (HeaderSection): a [reference] to a deleted header
// only fails validation, but a bare-word one is just skipped, and the
// formula quietly computes something else.
export function formulaUsages(config, header) {
  if (!header) return [];
  const key = norm(header.name);
  const refNames = refNamesOf(config);
  const out = [];
  for (const h of config?.headers || []) {
    if (h.id !== header.id && h.type === 'formula' && refsName(h.formula, key, refNames)) out.push(`Header “${h.name}” formula`);
  }
  for (const c of config?.titleCards || []) {
    if (refsName(c.mainValue?.formula, key, refNames) || refsName(c.subValue?.formula, key, refNames)) out.push(`Title Card “${c.name}”`);
  }
  return out;
}

// → ['Tab “Dashboard”', 'Graph “Sales”', 'Header “Net” formula', ...]
export function headerUsages(config, header) {
  if (!header) return [];
  const { id } = header;
  const out = [];
  for (const t of config?.tabs || []) if ((t.headerIds || []).includes(id)) out.push(`Tab “${t.name}”`);
  for (const o of config?.overviewTabs || []) {
    if ((o.headerIds || []).includes(id) || (o.hierarchyHeaderIds || []).includes(id) || o.fixedHeaderId === id) out.push(`Overview Tab “${o.name}”`);
  }
  for (const g of config?.graphs || []) if ((g.headerIds || []).includes(id)) out.push(`Graph “${g.name}”`);
  return [...out, ...formulaUsages(config, header)];
}

// Remove a header and drop its id from every Tab / Overview Tab / Graph
// pick. Not for a header a formula still names — the delete is refused
// while formulaUsages lists any. Pure.
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
