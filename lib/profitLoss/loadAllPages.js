// Loads every page of a paged list and hands the rows over in page order —
// the dashboard's load-on-refresh of a signed-in user's saved rows (see
// DashboardWorkspace). Pure: no React, no network of its own.
//
//   fetchPage(page)  → { rows, totalPages, totalCount }, or null when the page can't be loaded
//   onRows(rows)     the next rows, in order — every call adds to what's on screen
//   onProgress({ page, totalPages, totalCount })   `page` = pages fetched so far
//   cancelled()      → true once the caller no longer wants the result
//
// Page 1 is handed over as soon as it arrives. The rest are fetched
// `concurrency` at a time and handed over in batches that double in size:
// the dashboard re-merges and re-resolves everything loaded so far on every
// onRows, so one call per page made a long history slower with each page —
// doubling keeps the total work at about twice the final dataset. A page
// that fails ends the load there, with every page before it handed over.
export async function loadAllPages({ fetchPage, onRows, onProgress = () => {}, cancelled = () => false, concurrency = 4 }) {
  const first = await fetchPage(1);
  if (!first || cancelled()) return;
  const { totalPages, totalCount } = first;
  onRows(first.rows);
  onProgress({ page: 1, totalPages, totalCount });

  const waiting = new Map(); // page number -> its rows, fetched but not handed over yet
  let shown = 1; // pages handed over — always pages 1..shown, no gaps
  let fetched = 1;
  let nextPage = 2;
  let failed = false;

  const handOver = (all) => {
    let upTo = shown;
    while (waiting.has(upTo + 1)) upTo += 1;
    if (upTo === shown || (!all && upTo - shown < shown)) return;
    const rows = [];
    for (let p = shown + 1; p <= upTo; p += 1) {
      for (const row of waiting.get(p)) rows.push(row);
      waiting.delete(p);
    }
    shown = upTo;
    onRows(rows);
  };

  const fetchNext = async () => {
    while (!cancelled() && !failed && nextPage <= totalPages) {
      const page = nextPage;
      nextPage += 1;
      const data = await fetchPage(page);
      if (cancelled()) return;
      if (!data) { failed = true; return; }
      waiting.set(page, data.rows);
      fetched += 1;
      onProgress({ page: fetched, totalPages, totalCount });
      handOver(false);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, totalPages - 1) }, fetchNext));
  if (!cancelled()) handOver(true);
}
