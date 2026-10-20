// Where a canonical row's raw values came from — so a header mapped to one
// file's one sheet's column (Template Settings › Header: Market Place ›
// File › Sheet › Header) is read from exactly that sheet, even when another
// sheet has a column of the same name.
//
//   row.src       the one source (file slot + sheet) an uploaded row came
//                 from — set by ingest.js for every row of every sheet read.
//   row.srcs      every source a merged row was built from (mergeRows.js).
//   row.bySource  { [src]: { [column]: value } } — the values two sources
//                 disagreed on for a column they both have (the merged
//                 `meta` can only hold one of them), plus what a line-item
//                 merge copied in describe-only (see mergeRows.js).
// A row saved before any of this has none of the three: it is read by
// column name, as it always was.

export const sourceKey = (slotId, sheet) => `${slotId}::${sheet}`;

export const hasSources = (row) => !!(row?.src || row?.srcs);

export function rowHasSource(row, src) {
  return row.src === src || (Array.isArray(row.srcs) && row.srcs.includes(src));
}

// `column`'s value in this row as `src` had it — undefined when the row
// didn't come from `src` at all.
export function sourceValue(row, src, column) {
  const own = row.bySource?.[src];
  if (own && column in own) return own[column];
  if (hasSources(row) && !rowHasSource(row, src)) return undefined;
  return row.meta?.[column];
}

export const sourcesOf = (row) => (Array.isArray(row?.srcs) ? row.srcs : row?.src ? [row.src] : []);

const same = (x, y) => String(x ?? '').trim() === String(y ?? '').trim();

// The provenance of mergeCanonicalRows(a, b): every source of either row,
// and — for each column in `bKeys` (the ones `b` brings in) that both rows
// have with different values — each source's own value, kept in `bySource`.
// `describeOnly`: `b` is spread over several line-item rows, so only `bKeys`
// of it are copied — its sources aren't added as a whole; what was copied is
// recorded under them instead. → { srcs?, bySource? } to spread onto the
// merged row ({} when neither row has sources), or null when only ONE of
// them does — a row saved before sources existed, merged with a new upload:
// the merged row can't say which of its values came from where, so the
// caller drops src / srcs / bySource and it is read by column name, as
// before (never strictly by sheet, which would lose the old row's values).
export function mergedSources(a, b, bKeys, { describeOnly = false } = {}) {
  const aSrcs = sourcesOf(a);
  const bSrcs = sourcesOf(b);
  if (!aSrcs.length && !bSrcs.length) return {};
  if (!aSrcs.length || !bSrcs.length) return null;
  const bySource = {};
  const take = (from) => {
    for (const [s, vals] of Object.entries(from?.bySource || {})) bySource[s] = { ...(bySource[s] || {}), ...vals };
  };
  take(a);
  take(b);
  const put = (srcs, k, v) => {
    for (const s of srcs) {
      if (bySource[s] && k in bySource[s]) continue;
      bySource[s] = { ...(bySource[s] || {}), [k]: v };
    }
  };
  const aMeta = a?.meta || {};
  const bMeta = b?.meta || {};
  for (const k of bKeys) {
    if (describeOnly) put(bSrcs, k, bMeta[k]);
    if (k in aMeta && !same(aMeta[k], bMeta[k])) {
      put(aSrcs, k, aMeta[k]);
      put(bSrcs, k, bMeta[k]);
    }
  }
  const srcs = describeOnly ? aSrcs : [...new Set([...aSrcs, ...bSrcs])];
  return {
    ...(srcs.length ? { srcs } : {}),
    ...(Object.keys(bySource).length ? { bySource } : {}),
  };
}
