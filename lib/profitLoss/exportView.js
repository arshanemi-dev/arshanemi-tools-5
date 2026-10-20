import { applyLayout, emptySection } from './layoutSections';
import { myDetailColumns, tabColumnDefs } from './tabColumns';
import { isShown } from './headerGroups';

// What one dashboard page looks like, as plain text rows for a PDF / Excel
// download — exactly what TabView / OverviewTab show for it: the same Title
// Cards and Graphs and the same columns in the same order, i.e. the user's
// Position Settings (layout.perTab[tab.id] — hidden and reordered items)
// applied first, then their "My Details" ticks (`myColumns`). A column
// hidden on screen is never downloaded. Pure — no React, no browser.
//
// `source` = a resolveTemplate result (the export resolves every date —
// DashboardWorkspace's resolveEverything). → { tabName, cards, graphs,
// table: { columns, rows }, levelTables? } — `levelTables` only for an
// Overview tab: one table per hierarchy level (Excel puts each on its own
// sheet), every row also carrying its parent levels' values.

const texts = (defs, cells) => defs.map((d) => cells?.[d.id]?.display ?? '');

function cardsAndGraphs(tab, source, config, section) {
  const cardById = new Map((config.titleCards || []).map((c) => [c.id, c]));
  const graphById = new Map((config.graphs || []).map((g) => [g.id, g]));
  const cards = applyLayout((tab?.titleCardIds || []).map((id) => cardById.get(id)).filter(Boolean), section('titleCards'))
    .map((c) => {
      const v = source.titleCardValues?.[c.id] || {};
      return { name: c.name || c.id, mainDisplay: v.main?.display, subDisplay: v.sub?.display };
    });
  const graphs = applyLayout((tab?.graphIds || []).map((id) => ({ id })), section('graphs'))
    .map(({ id }) => {
      const def = graphById.get(id);
      const data = source.graphSeries?.[id] || null;
      return { id, name: def?.name || id, chartType: data?.chartType || def?.chartType || 'line', series: data?.series || [] };
    })
    .filter((g) => g.series.length > 0);
  return { cards, graphs };
}

export function tabExportView({ tab, isOverview = false, source, config, layout = {}, myColumns = [] }) {
  const tabLayout = (tab?.id && layout.perTab?.[tab.id]) || {};
  const section = (key) => tabLayout[key] || emptySection();
  const { cards, graphs } = cardsAndGraphs(tab, source, config, section);

  if (isOverview) {
    // OverviewTab: the hierarchy levels pinned first, then ov.headers (already
    // just the My Details ones) through the user's arrangement.
    const ov = source.overviews?.[tab?.id] || { name: tab?.name, levels: [], headers: [], flatRows: [] };
    const levels = ov.levels || (ov.fixedHeader ? [ov.fixedHeader] : []);
    const headers = applyLayout(ov.headers || [], section('headers'));
    const nodes = ov.flatRows || ov.rows || [];
    const defs = levels.length ? [...levels, ...headers] : [];
    return {
      tabName: ov.name || tab?.name || 'Overview',
      cards,
      graphs,
      table: { columns: defs.map((d) => d.name), rows: nodes.map((n) => texts(defs, n.cells)) },
      levelTables: levels.map((level, depth) => {
        const cols = [...levels.slice(0, depth + 1), ...headers];
        return {
          name: level.name,
          columns: cols.map((d) => d.name),
          rows: nodes.filter((n) => n.depth === depth).map((n) => texts(cols, n.cells)),
        };
      }),
    };
  }

  // TabView: the sticky key column, then the other headers through the
  // user's arrangement, narrowed to their My Details ticks.
  const { key, rest } = tabColumnDefs(tab, source.headers || [], { allHeaders: true, groupByHeaderId: config.marketplace?.groupByHeaderId });
  const arranged = applyLayout(rest, section('headers'));
  const shown = key ? [key, ...arranged] : arranged;
  const defs = shown.length ? [shown[0], ...myDetailColumns(shown.slice(1), myColumns, tab?.headerIds)] : shown;
  return {
    tabName: tab?.name || '',
    cards,
    graphs,
    table: { columns: defs.map((d) => d.name), rows: (source.tableRows || []).map((r) => texts(defs, r.cells)) },
  };
}

// Transactions — no template config of its own: every header, one row per
// Order Id (+ Transaction Id), as on screen.
export function transactionsExportView(source) {
  const headers = (source.headers || []).filter(isShown); // switched to Hidden = not a column (headerGroups.js)
  return {
    tabName: 'Transactions',
    cards: [],
    graphs: [],
    table: { columns: headers.map((h) => h.name), rows: (source.rows || []).map((r) => texts(headers, r.cells)) },
  };
}
