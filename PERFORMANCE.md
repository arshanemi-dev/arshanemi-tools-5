# Dashboard performance

The dashboard uses one reusable Web Worker for spreadsheet parsing/mapping,
cross-file merging, pricing, active-view calculations, saved-header snapshots,
and the calculations required by exports. PDF.js retains its own parsing worker.
If workers cannot start, the existing calculation engine is loaded on demand
and used on the main thread. That fallback preserves functionality, but can block
the UI on large datasets.

Unchanged input arrays are retained inside the worker. Filter changes send only
changed inputs. Superseded queued jobs are cancelled, and obsolete results cannot
replace the current view. Merging returns indices for untouched rows so the row
save ledger retains identity and does not insert unchanged rows again.

Only the active tab's cards, charts, and overview are calculated. All headers
remain available for formula dependencies. Exports explicitly calculate every
tab without the display date restriction, as before.

Spreadsheet libraries and optional history/debug panels load on demand. Table
pagination remains in place. Full raw history still loads because filtering
before cross-file merging can change enrichment and financial results. A future
server summary API must share those semantics; merely calculating a displayed
page's totals would be incorrect.

## Saved-data reads

The companion root admin app now supports `includeCount=false` on subsequent
pages, stable timestamp/ID ordering, and authenticated private ETag revalidation.
The tool forwards conditional requests. Unchanged responses can avoid transferring
the JSON body; database reads still occur. Deploy both apps for these improvements.
No schema, dependency, environment, or migration changes are required.

Loads are cancelled when leaving the dashboard. A failed or truncated load shows
Retry and blocks uploads, deletion and exports until the complete data is known.
Hub GET requests time out after 30 seconds instead of waiting indefinitely.

## Verification

Use Node 22.15+ (tested with Node 24) for the built-in test runner's module hooks:

```text
node --import ./tests/register.mjs --test tests/performance.test.mjs
npm run build
node scripts/measure-dashboard.mjs
```

From the root admin app:

```text
node --test scripts/test_profit_loss_reads.mjs
```

To verify the compiled worker in a browser, run `node scripts/serve-worker-check.mjs`
after building and open `http://127.0.0.1:3106`. The check merges/calculates 20,000
synthetic rows, patches a filter, and lazy-loads the CSV parser. A main-thread
heartbeat confirms the worker does not monopolize the UI thread.

For a synthetic UI check, also run `node node_modules/next/dist/bin/next start --port 3105` and visit
`http://127.0.0.1:3106/profit-loss`. The test server supplies fixture templates and
intercepts every API request so no account data or writes reach the hub. Upload
`tests/orders.csv`. These fixtures and the test server are not production routes.

Initial `/profit-loss` HTML script references measured before this change:
1,261,331 bytes, or 404,507 gzip bytes. In the final tested build:
833,358 bytes, or 263,682 gzip bytes (about 34% less). This measures initial page
scripts, not runtime worker/lazy chunks, API latency, or end-user load time.
Re-run the measurement script after subsequent builds.
