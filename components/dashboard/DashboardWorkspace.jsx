'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { useLiveTemplates } from '@/lib/profitLoss/useLiveTemplates';
import { readAnyFile } from '@/lib/sheet/readAnyFile';
import { downloadSkuCostTemplate } from '@/lib/sheet/skuCostTemplate';
import { rowOverrideFor } from '@/lib/sheet/rowOverride';
import { effectiveConfig } from '@/lib/profitLoss/effectiveConfig';
import { rangeForPreset, todayISO } from '@/lib/profitLoss/dateRanges';
import { readHeaderFromRow, transactionKeyFor } from '@/lib/profitLoss/resolveTemplate';
import { rowPathKeys } from '@/lib/profitLoss/overviewTree';
import { mergeExtractedData, fillFromExtractedData, snapshotConfig } from '@/lib/profitLoss/extractedDataStore';
import { createCalculationClient } from '@/lib/profitLoss/calculationClient';
import { useCalculation } from '@/lib/profitLoss/useCalculation';
import { buildExtractedRowsPayload, rowsFromExtractedPayload } from '@/lib/profitLoss/rowsPayload';
import { loadAllPages } from '@/lib/profitLoss/loadAllPages';
import { useRowSaver } from '@/lib/profitLoss/useRowSaver';
import { nextPaint } from '@/lib/profitLoss/nextPaint';
import { downloadMultiTabXlsx, downloadMultiTabPdf } from '@/lib/profitLoss/exportTemplate';
import { listCompanies, saveCompany, listExtractedRows, deleteExtractedRows } from '@/lib/profitLoss/apiClient';
import { useDashboardSettings } from '@/lib/profitLoss/useDashboardSettings';
import { applyLayout, emptySection } from '@/lib/profitLoss/layoutSections';
import { myDetailColumns, overviewShownHeaders, tabColumnDefs } from '@/lib/profitLoss/tabColumns';
import { normalizeSkuCosts, stampSkuCosts } from '@/lib/profitLoss/skuCosts';
import { useSkuCosts } from '@/lib/profitLoss/useSkuCosts';
import { RESERVED_HEADER_IDS } from '@/data/templateSchema';
import { DEBUG_TOOLS } from '@/lib/debugTools';
import { useToast } from '@/components/admin/Toast';
import ConfirmDialog from '@/components/admin/ConfirmDialog';

import DashboardSidebar from './DashboardSidebar';
import DashboardToolbar from './DashboardToolbar';
import DashboardHeaderBar from './DashboardHeaderBar';
import TabView from './TabView';
import OverviewTab from './OverviewTab';
import DetailsTable from './DetailsTable';
import NoMarketplaces from './NoMarketplaces';
import NoTemplateSidebar from './NoTemplateSidebar';
import TemplatesLoadError from './TemplatesLoadError';
import UploadProgress, { SavingRowsLine } from './UploadProgress';
const HistoryDrawer = dynamic(() => import('./HistoryDrawer'));
const MergedCommonHeadersTable = dynamic(() => import('./MergedCommonHeadersTable'));
const NextLevelSheetDebugger = dynamic(() => import('@/components/templateSettings/NextLevelSheetDebugger'));

const DEFAULT_RANGE = { preset: '7d', ...rangeForPreset('7d') };
const DEFAULT_ADS = { mode: 'percent', value: 0 };
const emptyResolved = { headers: [], tableRows: [], titleCardValues: {}, graphSeries: {}, overviews: {}, aggregate: {}, companyOptions: [], rowCount: 0, platforms: [] };
const EMPTY_ROWS = [];
const EMPTY_VIEW = { resolved: emptyResolved, transactionResolved: { headers: [], rows: [], rowCount: 0 } };
// The synthetic `uploads` entry a signed-in user's own previously-saved
// rows (GET /api/profit-loss/rows) land in on load — never a real file
// slot id, so it's easy to tell apart from an actual upload.
const RESTORED_SLOT_ID = 'restored';
// Sentinel activeTabId for the always-available "Transactions" view (one
// row per Order Id + Transaction Id, see resolveTransactionRows) — never a
// real Tab/Overview Tab id, so it can share the same activeTabId plumbing
// without colliding with anything Template Settings defines.
const TRANSACTIONS_TAB_ID = '__transactions__';

// The tab that owns the upload / Position Settings toolbar (see uploadTab).
const UPLOAD_TAB_NAME = 'upload';
const normTabName = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
// The hub's own per-page cap (lib/db.js) — used as the restore loop's page
// size so pulling this user's ENTIRE saved history takes as few round trips
// as possible. No page-count ceiling: every page gets fetched, however many
// there are — Date/Company/Platform narrow the DASHBOARD (resolveTemplate
// below), not what gets loaded, so title cards/graphs/table and the table's
// own sort/search always see the complete dataset.
const RESTORE_PAGE_SIZE = 500;
// How many of those pages are in flight at once, after the first.
const RESTORE_CONCURRENCY = 4;
// Same suffix app/layout.js's metadata title template adds — the browser tab
// follows whichever page (Tab / Overview Tab / Transactions) is open.
const DOC_TITLE_SUFFIX = ' | Barmeto Profit & Loss';

export default function DashboardWorkspace({ canManageTemplates = false, onMenuClick, mobileNavOpen = false, onCloseMobileNav = () => {} }) {
  const { addToast } = useToast();
  const [calculations] = useState(() => createCalculationClient());
  useEffect(() => () => calculations.dispose(), [calculations]);

  // ── templates ───────────────────────────────────────────────────────────
  // Starts empty and stays empty unless a real marketplace template is
  // published — no built-in fallback config, so a fresh install with nothing
  // configured shows "No marketplaces" instead of a fake dashboard.
  // Headers/Title Cards/Graphs/Tabs/Overview Tabs are global (`global`,
  // shared, fetched once) — switching marketplace only changes `templates`'
  // per-marketplace fileSlots/mappings, never the dashboard's shape.
  // Loading them — drawn from the last visit's copy first, then checked
  // against the server — is lib/profitLoss/useLiveTemplates.js. A failed
  // load (hub unreachable / restarting, server error) with no copy to show
  // is its own state there (templatesError) — never treated as "zero
  // marketplaces" — so the page can say why and offer Try again
  // (TemplatesLoadError) instead of "No marketplaces yet".
  const {
    templates, globalConfig, templatesReady, templatesChecked, templatesError, retryTemplates,
  } = useLiveTemplates({ addToast });
  // The marketplace picked in the toolbar; until one is (or once it's gone
  // from `templates`) the first one is the active one.
  const [activeTemplateId, setActiveTemplateId] = useState(null);

  const activeMarketplace = useMemo(
    () => templates.find((t) => t.id === activeTemplateId) || templates[0],
    [templates, activeTemplateId],
  );

  // Global Settings + the active marketplace's files and mappings — see
  // lib/profitLoss/effectiveConfig.js.
  const config = useMemo(
    () => effectiveConfig(globalConfig, activeMarketplace?.config || (activeMarketplace ? {} : null)),
    [globalConfig, activeMarketplace],
  );

  // Every tab the template defines, in template order — the full list the
  // sidebar's edit-mode "Tabs" dropdown reorders/hides from.
  const allTabsSorted = useMemo(
    () => [...(config.tabs || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [config],
  );

  // Overview tabs each have their own globally-unique id, so they slot into
  // the same activeTabId as a regular Tab — no magic '__overview__' string.
  const allOverviewTabsSorted = useMemo(
    () => [...(config.overviewTabs || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [config],
  );

  // ── uploads ─────────────────────────────────────────────────────────────
  const [uploads, setUploads] = useState([]); // { id, slotId, fileName, platform, rows }
  // Each SKU's DEFAULT costs ({ [sku]: { cogs, costGst, finalCost,
  // otherExpense } } — lib/profitLoss/skuCosts.js): the live copy, its home
  // in the hub's profit_loss_sku_costs table, and the tables' cost inputs —
  // the four cost headers' own columns on a SKU's row (CostCell), one cost
  // at a time: `onCostChange(sku, field, text)` makes it live at once and
  // saves it as a request of its own. `dirtyCostCells` / `dirtySkuKeys` mark
  // the box and its row light blue ("unsaved") until that cost's own save
  // has landed — signed out that never happens, so the highlight correctly
  // stays on. See lib/profitLoss/useSkuCosts.js.
  const {
    skuCosts, onCostChange, applyCostSheet, adoptLegacyCosts, legacyMoved, dirtyCostCells, dirtySkuKeys,
  } = useSkuCosts({ addToast });
  const [busy, setBusy] = useState(false);
  const [restorePaging, setRestorePaging] = useState(null);
  const [restoring, setRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState(null);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  // The most recently uploaded raw File (any slot, or the SKU Cost button) —
  // fed to the embedded SheetDebugger below the toolbar so it always shows
  // the real upload just made, no picker of its own needed there. debugSlotId
  // (null for a SKU Cost upload, which isn't a marketplace file slot) travels
  // WITH that file — SheetDebugger captures it onto that file's own tab the
  // moment the tab is created, not as a single value applied to whichever
  // tab happens to be showing, so uploading a second file to a different
  // slot afterward can't retroactively change what the first file's tab is
  // checked against.
  const [debugFile, setDebugFile] = useState(null);
  const [debugSlotId, setDebugSlotId] = useState(null);

  // Cross-sheet match + merge: keyed off the two reserved global headers
  // (Order Id + Transaction Id), not the platform mapper's own canonical
  // `orderId`. Uploading several files for one marketplace (e.g. a Payment
  // file + an Order file, each mapped to its own headers) is meant to
  // enrich one row per transaction, not produce two disconnected ones — so
  // a row from a DIFFERENT file slot with the same Order Id (and Transaction
  // Id too, when both sheets have one) gets merged into whichever row for
  // that transaction was seen first (mergeCanonicalRows — every mapped
  // header's value carried over from both sheets). Within the SAME file,
  // Order Id alone never merges/collapses anything — one order can
  // legitimately repeat across separate line items in a single sheet, and
  // without a Transaction Id to confirm it there's no safe way to tell that
  // apart from a real duplicate re-upload, so it's always kept as its own
  // row. An identical Order Id + Transaction Id pair from the SAME slot (a
  // literal re-upload of overlapping data) is the one case actually treated
  // as a duplicate and dropped.
  const orderIdHeader = useMemo(
    () => (config.headers || []).find((h) => h.id === RESERVED_HEADER_IDS.orderId) || null,
    [config],
  );
  const transactionIdHeader = useMemo(
    () => (config.headers || []).find((h) => h.id === RESERVED_HEADER_IDS.transactionId) || null,
    [config],
  );
  // The full logic (normalized cross-file enrichment, then exact Order Id
  // + Transaction Id match/de-dupe) lives in mergeUploadsAcrossSlots — the
  // Sheet Debugger's "Merged" preview tab runs that exact same function
  // against whatever files are open there, so the two can never disagree.
  const mergeInput = useMemo(
    () => ({ uploads, orderIdHeader, transactionIdHeader, headers: config.headers }),
    [uploads, orderIdHeader, transactionIdHeader, config.headers],
  );
  const merged = useCalculation(calculations, 'merge', mergeInput, EMPTY_ROWS);
  const canonicalRows = useMemo(() => {
    const originals = merged.input?.uploads.flatMap((upload) => upload.rows) || EMPTY_ROWS;
    return merged.value.map((row) => typeof row === 'number' ? originals[row] : row);
  }, [merged.value, merged.input]);
  // Pricing is applied in the calculation worker; these canonical rows stay
  // unmodified for persistence. Untouched rows retain their original identity.

  // ── filters (pending vs applied) ────────────────────────────────────────
  // dateRange is a "getting data" bound — Download PDF/Excel ignores it (see
  // resolveEverything below) but still respects company/platform. All three (plus
  // ads) feed resolveTemplate directly, in-browser (see `resolved` below) —
  // there's no server round-trip left to protect, so nothing here caps how
  // many rows feed the calculation anymore; every saved row is always in
  // play. Column sort/search/pagination of the RESULT stays entirely inside
  // DetailsTable, which never re-fetches or re-resolves anything.
  const [pending, setPending] = useState({ dateRange: DEFAULT_RANGE, company: 'all', platform: 'all', ads: DEFAULT_ADS });
  const [applied, setApplied] = useState({ dateRange: DEFAULT_RANGE, company: 'all', platform: 'all', ads: DEFAULT_ADS });
  const dirty = JSON.stringify(pending) !== JSON.stringify(applied);

  // No "Apply" button — every change above debounces into effect on its own
  // after a short pause, so picking a date/company or typing an ads value
  // doesn't recompute the whole dashboard on every keystroke. resetFilters
  // (below) sets `applied` directly for an instant reset, bypassing this.
  // `applied` is only replaced when something in it really differs: a new
  // object with the same values (an upload sets both to the same range) used
  // to recalculate the whole dashboard a second time for nothing.
  useEffect(() => {
    const t = setTimeout(() => setApplied((cur) => (JSON.stringify(cur) === JSON.stringify(pending) ? cur : pending)), 500);
    return () => clearTimeout(t);
  }, [pending]);

  // ── brand (toolbar setup step, not a view filter) ───────────────────────
  // Market Place, then Brand — picking/creating one here is what unlocks the
  // file upload buttons and tags every row of the next upload as
  // "MarketPlace_Brand" (Company). Unlike the filters above this takes effect
  // immediately, no Apply needed — it has to be live the moment an upload
  // button is clicked. The saved brand *list* persists per-user (or
  // session-only when signed out); which one is currently active does not.
  const [selectedBrand, setSelectedBrand] = useState(null);

  // ── view ────────────────────────────────────────────────────────────────
  const [historyOpen, setHistoryOpen] = useState(false);
  // DashboardHeaderBar's empty slot (callback ref → DOM node): TabView
  // portals its My Details pill into it (after the date filter). The table's
  // page limit + Prev/Next stay in its own footer, bottom right.
  const [viewPillsSlot, setViewPillsSlot] = useState(null);

  // My Details column ticks (per tab) + the sidebar's Settings -> Save
  // edit-mode layout (tabs/title-cards/graphs/columns show+order) — one
  // per-user settings row, see lib/profitLoss/useDashboardSettings.js.
  const {
    loggedIn, myColumnsFor, onMyColumnsChange,
    layout, setTopSection, setTabSection, resetLayout,
    brands, addBrand,
    dropLegacySkuCosts,
    extractedData, onExtractedDataChange,
    editMode, setEditMode, saveLayout, savingLayout,
  } = useDashboardSettings({
    ads: pending.ads,
    dateRange: pending.dateRange,
    addToast,
    onLoadedPreferences: (p) => {
      if (p.adsMode) setPending((s) => ({ ...s, ads: { mode: p.adsMode, value: p.adsValue ?? 0 } }));
      if (p.defaultDatePreset) setPending((s) => ({ ...s, dateRange: { preset: p.defaultDatePreset, ...rangeForPreset(p.defaultDatePreset) } }));
      // SKU costs used to be saved in this settings row; whatever an account
      // still has there is handed to the costs table's hook, which moves it
      // across (once) and then says so — `legacyMoved`, below.
      adoptLegacyCosts(normalizeSkuCosts(p.skuCosts));
    },
  });
  useEffect(() => {
    if (legacyMoved) dropLegacySkuCosts();
  }, [legacyMoved, dropLegacySkuCosts]);

  // Automatic, unmetered per-ROW persistence (Task: "save all my headers
  // data user-wise... one row one json") — distinct from the per-SKU
  // extractedData snapshot below and from the deliberate, coin-metered Save
  // to History. Whenever the rows change, the ones not stored yet go to the
  // hub in parts; `rowSave` says how far along that is (the upload window
  // and SavingRowsLine show it). Only once something was uploaded this
  // session: what was just fetched back from that same table is stored
  // already (markRowsStored, in addRestoredRows). See useRowSaver.
  const {
    status: rowSave, retry: retryRowSave, reset: resetRowSave, markStored: markRowsStored, forget: forgetStoredRows,
  } = useRowSaver({
    enabled: loggedIn && !restoring && !restoreError && !merged.pending && !merged.error && uploads.some((u) => u.slotId !== RESTORED_SLOT_ID),
    rows: canonicalRows,
    orderIdHeader,
    transactionIdHeader,
  });

  // Every Marketplace x Brand combo ("company") this user has actually used,
  // from the dedicated market_place_companies table — reloaded on every
  // mount so a returning session's Brand picker isn't limited to only what
  // preferences.brands happens to remember. Merged with `brands` (never
  // replaces it) since the two lists can diverge (a brand typed before this
  // table existed, say).
  const [savedCompanies, setSavedCompanies] = useState([]);
  useEffect(() => {
    if (!loggedIn) return;
    listCompanies().then(({ ok, data }) => {
      if (ok && Array.isArray(data?.companies)) setSavedCompanies(data.companies);
    });
  }, [loggedIn]);
  const effectiveBrands = useMemo(
    () => [...new Set([...brands, ...savedCompanies.map((c) => c.brand)])],
    [brands, savedCompanies],
  );

  // Every previously-saved row (GET /api/profit-loss/rows) for this user —
  // ALL of it, every page, auto-loaded on load before any fresh upload. No
  // page-count ceiling: Date/Company/Platform are scoping filters that
  // resolveTemplate applies AFTER everything is already in memory (see
  // `resolved` below), not a way to limit what gets fetched — narrowing them
  // changes what's shown, never what's loaded. It becomes just another
  // `uploads` entry (RESTORED_SLOT_ID) feeding the exact same canonicalRows
  // pipeline a real file would. Loading EVERY page (not just one) matters
  // specifically for the table's own per-column sort/search and for title
  // cards/graphs: all of that is local, in-browser computation over
  // whatever's already in canonicalRows — it only ever looked "wrong" once
  // rows started living in the database instead of entirely in memory,
  // because it was silently computing off just the one loaded page. Sorted
  // newest-saved-first by the API; covers every company for this user, not
  // just the active marketplace.
  // How the pages are fetched and added (page 1 at once, the rest a few at a
  // time, in order) is lib/profitLoss/loadAllPages.js.
  const addRestoredRows = useCallback((rows) => {
    markRowsStored(rows); // they came from the hub — nothing to save back
    setUploads((prev) => (prev.some((u) => u.slotId === RESTORED_SLOT_ID)
      ? prev.map((u) => (u.slotId === RESTORED_SLOT_ID ? { ...u, rows: [...u.rows, ...rows] } : u))
      : [...prev, { id: 'restored', slotId: RESTORED_SLOT_ID, fileName: 'Saved from your account', platform: 'restored', rows }]));
  }, [markRowsStored]);
  useEffect(() => {
    if (!loggedIn) {
      Promise.resolve().then(() => setRestoring(false));
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const fetchPage = async (page) => {
      try {
        const { ok, data } = await listExtractedRows({ page, limit: RESTORE_PAGE_SIZE, signal: controller.signal, includeCount: page === 1 });
        return ok ? { ...data, rows: rowsFromExtractedPayload(data.rows || []) } : null;
      } catch {
        return null;
      }
    };
    (async () => {
      setRestoring(true);
      setRestoreError(null);
      setRestorePaging(null);
      setUploads((prev) => prev.filter((upload) => upload.slotId !== RESTORED_SLOT_ID));
      try {
        const result = await loadAllPages({
          fetchPage,
          onRows: addRestoredRows,
          onProgress: setRestorePaging,
          cancelled: () => cancelled,
          concurrency: RESTORE_CONCURRENCY,
        });
        if (!cancelled && !result.complete) setRestoreError('Some saved rows could not be loaded. Retry to get complete totals and enable uploads and exports.');
      } catch {
        if (!cancelled) setRestoreError('Saved data could not be loaded. Retry before uploading or exporting.');
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => { cancelled = true; controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, restoreAttempt]);

  const visibleTabs = useMemo(
    () => applyLayout(allTabsSorted, layout.tabs || emptySection()),
    [allTabsSorted, layout],
  );
  const visibleOverviewTabs = useMemo(
    () => applyLayout(allOverviewTabsSorted, layout.overviewTabs || emptySection()),
    [allOverviewTabsSorted, layout],
  );

  // The tab the user last picked; the *actual* active tab is derived from it so
  // switching templates (or hiding the current tab in edit mode) can't leave a
  // dangling id (no setState-in-effect).
  const [preferredTabId, setPreferredTabId] = useState(null);
  const activeTabId = useMemo(() => {
    if (preferredTabId === TRANSACTIONS_TAB_ID) return TRANSACTIONS_TAB_ID;
    if (visibleTabs.some((t) => t.id === preferredTabId)) return preferredTabId;
    if (visibleOverviewTabs.some((o) => o.id === preferredTabId)) return preferredTabId;
    return visibleTabs[0]?.id ?? visibleOverviewTabs[0]?.id ?? null;
  }, [preferredTabId, visibleTabs, visibleOverviewTabs]);
  const showTransactions = activeTabId === TRANSACTIONS_TAB_ID;

  // A (visible) Tab / Overview Tab named "Upload Sheet & Cost" — compared in
  // lower case, extra spaces ignored — becomes the home of the upload /
  // Position Settings toolbar: shown only while that tab is open, hidden on
  // every other one. Without such a tab it shows everywhere, as before. While
  // arranging (Position Settings → edit mode) it always shows, so Save
  // Position stays reachable from whichever tab is being arranged.
  const uploadTab = useMemo(
    () => [...visibleTabs, ...visibleOverviewTabs].find((t) => normTabName(t.name).includes(UPLOAD_TAB_NAME)) || null,
    [visibleTabs, visibleOverviewTabs],
  );

  // ── resolve (in the calculation worker) ────────────────────────────────
  // Preserve the full dataset and the existing formula/filter semantics, but
  // compute only the active tab's outputs. useCalculation discards obsolete
  // results after a filter change. Failed work is visible and blocks exports;
  // it must never silently turn financial results into zeros.
  //
  // Which headers each Overview tab shows — its My Details ticks, else its
  // own picks (overviewShownHeaders). resolveTemplate builds an overview's
  // tree for exactly these, so this is an input of `resolved` — held as a
  // string, so ticking a column on some OTHER tab (a new myColumnsFor, the
  // same ids here) doesn't recompute the whole dashboard.
  const overviewHeaderKey = useMemo(() => JSON.stringify(Object.fromEntries(
    (config.overviewTabs || []).map((ov) => [ov.id, overviewShownHeaders(ov, config.headers || [], myColumnsFor(ov.id, ov.headerIds || [], false)).map((h) => h.id)]),
  )), [config, myColumnsFor]);
  const overviewHeaderIds = useMemo(() => JSON.parse(overviewHeaderKey), [overviewHeaderKey]);

  const viewOptions = useMemo(() => ({
    ads: applied.ads,
    dateFrom: applied.dateRange.from,
    dateTo: applied.dateRange.to,
    platform: applied.platform,
    company: applied.company,
    overviewHeaderIds,
  }), [applied, overviewHeaderIds]);
  const viewInput = useMemo(() => ({
    config, rows: canonicalRows, skuCosts, options: viewOptions,
    activeTabId, transactions: showTransactions,
  }), [config, canonicalRows, skuCosts, viewOptions, activeTabId, showTransactions]);
  const computed = useCalculation(calculations, 'view', viewInput, EMPTY_VIEW, !merged.pending && !merged.error);
  const { resolved, transactionResolved } = computed.value;
  const calculating = merged.pending || computed.pending;
  const calculationError = merged.error || computed.error;
  const [exporting, setExporting] = useState(false);

  // Export resolves ALL tabs and all dates explicitly. A single active view
  // is deliberately incomplete for export, even when its date filter is empty.
  const resolveEverything = useCallback(() => calculations.run('export', {
    config, rows: canonicalRows, skuCosts,
    options: { ...viewOptions, dateFrom: null, dateTo: null },
    transactions: !!orderIdHeader,
  }), [calculations, config, canonicalRows, skuCosts, viewOptions, orderIdHeader]);

  // Every mapped (non-computed) header's per-SKU value the FULL dataset
  // currently has — persisted (debounced, merge-only-where-non-empty; see
  // extractedDataStore.js) so a header this session's upload doesn't happen
  // to touch still shows what it was last known to be, without ever
  // freezing a computed metric (Profit/Loss, COGS, ...) from a stale
  // session. Read off every row (no date bound) rather than the live view,
  // so an older row falling outside the date filter doesn't look like its
  // data disappeared. Those headers' values depend on the rows alone, so
  // only they are resolved (snapshotConfig) — and a moment after the rows
  // settle, not while an upload is still being put on screen.
  const snapConfig = useMemo(() => snapshotConfig(config), [config]);
  const extractedLatest = useRef(extractedData);
  useEffect(() => { extractedLatest.current = extractedData; }, [extractedData]);
  useEffect(() => {
    if (!loggedIn || restoring || restoreError || merged.pending || merged.error || !canonicalRows.length || !snapConfig.headers.length) return undefined;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const snapshot = await calculations.run('snapshot', {
          config: snapConfig, rows: canonicalRows,
          options: { platform: applied.platform, company: applied.company },
        }, { signal: controller.signal });
        if (controller.signal.aborted || !Object.keys(snapshot).length) return;
        const next = mergeExtractedData(extractedLatest.current, snapshot);
        if (JSON.stringify(next) !== JSON.stringify(extractedLatest.current)) onExtractedDataChange(next);
      } catch (error) {
        if (error.name !== 'AbortError') addToast('Could not update saved header values', 'error');
      }
    }, 1200);
    return () => { clearTimeout(t); controller.abort(); };
  }, [snapConfig, canonicalRows, applied.platform, applied.company, loggedIn, calculations, onExtractedDataChange, addToast, restoring, restoreError, merged.pending, merged.error]);

  // The live table's rows, with any header this SKU has no CURRENT value
  // for filled in from that same saved snapshot — display only (aggregate/
  // title cards/graphs/export still read the live, un-filled `resolved`).
  const displayTableRows = useMemo(
    () => fillFromExtractedData(resolved.tableRows, resolved.headers, extractedData),
    [resolved, extractedData],
  );

  const hasData = uploads.length > 0;

  // "All Companies" always lists every saved brand as "MarketPlace_Brand" for
  // the active marketplace — not just the ones with uploaded rows yet — plus
  // any company tag already present in the data (belt-and-braces in case a
  // row was tagged with a brand no longer in the saved list).
  const companyOptions = useMemo(() => {
    const marketplaceName = config.marketplace?.name || 'Marketplace';
    const fromBrands = effectiveBrands.map((b) => `${marketplaceName}_${b}`);
    return [...new Set([...fromBrands, ...(resolved.companyOptions || [])])].sort();
  }, [effectiveBrands, config, resolved.companyOptions]);

  // Right after an upload: if NONE of its rows fall inside the date filter
  // in effect (settlement exports are usually older than the default 7
  // days), switch the filter to the uploaded rows' own date span so the
  // dashboard shows what was just loaded — and say so. A filter that
  // already shows some of them is left alone.
  const fitDateRangeTo = useCallback((rows) => {
    const dates = rows.map((r) => r.orderDate).filter(Boolean).sort();
    if (!dates.length) return;
    const { from, to } = applied.dateRange;
    if (dates.some((d) => (!from || d >= from) && (!to || d <= to))) return;
    const today = todayISO();
    const range = { preset: 'custom', from: dates[0] > today ? today : dates[0], to: dates[dates.length - 1] > today ? today : dates[dates.length - 1] };
    setPending((s) => ({ ...s, dateRange: range }));
    setApplied((s) => ({ ...s, dateRange: range }));
    addToast(`Date filter set to ${range.from} → ${range.to} to show the uploaded rows`);
  }, [applied.dateRange, addToast]);

  // ── ingest ──────────────────────────────────────────────────────────────
  // Every upload is checked against the slot's saved headers (extracted in
  // Template Settings when its sample sheet was mapped) before it's parsed —
  // a sheet missing columns the template expects is rejected with an error
  // instead of silently producing a table with holes in it.
  //
  // Parsing and calculation run in the worker while the upload reports progress
  // in a progress window (UploadProgress): `uploadStage` is the step it is
  // on, set — and painted (nextPaint) — BEFORE each piece of work starts.
  // The last step, saving the rows to the account in parts, is useRowSaver's
  // (`rowSave`); the rows are on the dashboard by then, so the window can be
  // hidden while it runs.
  const [uploadStage, setUploadStage] = useState(null); // { step: 'reading' | 'adding' | 'saving' | 'done', fileIndex, fileCount, fileName, rows, hidden }
  const onUpload = useCallback(async (slotId, files) => {
    if (restoring || restoreError || merged.pending || merged.error) { addToast('Wait for your saved data to finish loading, or retry the failed load', 'error'); return; }
    if (!selectedBrand) { addToast('Pick or create a brand first', 'error'); return; }
    // The file slots + mappings on screen may still be the last visit's copy
    // (useLiveTemplates) — a sheet isn't read against them until the server
    // has confirmed they're current.
    if (!templatesChecked) { addToast('Still checking the marketplace setup — try again in a moment', 'error'); return; }
    setBusy(true);
    resetRowSave(); // the window's last step must be THIS upload's save, not the one before
    setUploadStage({ step: 'reading', fileIndex: 0, fileCount: files.length, fileName: files[0]?.name || '', rows: 0 });
    await nextPaint();
    let landed = false;
    try {
      const slotDef = (config.fileSlots || []).find((s) => s.id === slotId);
      const rowOverride = rowOverrideFor(slotDef);
      const marketplaceName = config.marketplace?.name || 'Marketplace';
      const tag = { brand: selectedBrand, company: `${marketplaceName}_${selectedBrand}` };
      // Record this Marketplace x Brand combo in the backend the moment it's
      // actually used — fire-and-forget, never blocks the upload; a brand
      // already-known to this table just gets its updated_at bumped.
      if (loggedIn) saveCompany({ marketplace: marketplaceName, brand: selectedBrand }).catch(() => {});
      const added = [];
      for (const [fileIndex, file] of [...files].entries()) {
        if (fileIndex) {
          setUploadStage((s) => s && { ...s, fileIndex, fileName: file.name });
          await nextPaint();
        }
        setDebugFile(file);
        setDebugSlotId(slotId);
        let res;
        try {
          const options = { slotDef, config, tag, fileName: file.name };
          if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
            // PDF.js already uses its own worker; only the mapping goes to ours.
            const workbook = await readAnyFile(file, rowOverride);
            res = workbook.sheetNames.length
              ? await calculations.run('ingest', { workbook, options })
              : { ok: false, empty: true };
          } else {
            res = await calculations.run('upload', { file, override: rowOverride, options });
          }
        } catch (error) {
          addToast(file.name + ': could not be read (' + error.message + ')', 'error');
          continue;
        }
        if (res.empty) { addToast('No table found in ' + file.name, 'error'); continue; }
        if (!res.ok) {
          addToast(file.name + ': missing columns: ' + res.missing.join(', '), 'error');
          continue;
        }
        const fileId = crypto.randomUUID();
        for (const part of res.parts) {
          added.push({
            id: `${fileId}:${part.sheetName}`,
            slotId,
            // one merge source per sheet — sheets of one file match by Order Id like separate files
            mergeKey: res.parts.length > 1 ? `${slotId}::${part.sheetName}` : slotId,
            fileName: res.parts.length > 1 ? `${file.name} › ${part.sheetName}` : file.name,
            platform: part.platform,
            rows: part.rows,
          });
        }
      }
      if (added.length) {
        // The price an order is uploaded at: its SKU's default costs as they
        // stand right now are written onto the new rows — and onto the older
        // rows of those same SKUs that had no price yet — and stay there
        // (stampSkuCosts). A default changed after this prices the next
        // upload, never these.
        const skus = new Set(added.flatMap((a) => a.rows.map((r) => r.sku)));
        const priced = added.map((a) => ({ ...a, rows: stampSkuCosts(a.rows, skuCosts) }));
        const fresh = priced.flatMap((a) => a.rows);
        // The worker merges and calculates the new rows after they are queued.
        setUploadStage((s) => s && { ...s, step: 'adding', rows: fresh.length });
        await nextPaint();
        setUploads((prev) => [
          ...prev.map((u) => {
            const rows = stampSkuCosts(u.rows, skuCosts, skus);
            return rows === u.rows ? u : { ...u, rows };
          }),
          ...priced,
        ]);
        const sheets = added.length > files.length ? ` from ${added.length} sheets` : '';
        addToast(fresh.length ? `Loaded ${fresh.length} rows${sheets}` : 'File loaded but no rows matched — check the sheet', fresh.length ? 'success' : 'error');
        fitDateRangeTo(fresh);
        landed = fresh.length > 0;
      }
    } finally {
      setBusy(false);
      // Rows went in: on to saving them (signed in), else that's it. Nothing
      // went in (every file was turned down — the toasts say why): no window.
      setUploadStage((s) => (s && landed ? { ...s, step: loggedIn ? 'saving' : 'done' } : null));
    }
  }, [addToast, config, selectedBrand, loggedIn, fitDateRangeTo, templatesChecked, skuCosts, resetRowSave, calculations, restoring, restoreError, merged.pending, merged.error]);

  // The window closes by itself a moment after its last step is done — a
  // failed save keeps it open (it offers Try again), and so does one still
  // running.
  const uploadDone = uploadStage?.step === 'done' || (uploadStage?.step === 'saving' && rowSave?.phase === 'saved');
  useEffect(() => {
    if (!uploadDone) return undefined;
    const t = setTimeout(() => setUploadStage(null), 1400);
    return () => clearTimeout(t);
  }, [uploadDone]);

  const onUploadSkuCost = useCallback(async (file) => {
    if (!file) return;
    setDebugFile(file);
    setDebugSlotId(null); // not a marketplace file slot — nothing to match against
    setBusy(true);
    try {
      const { costs, fields, count, unread } = await calculations.run('skuCosts', { file });
      if (!fields.length) { addToast('No SKU cost columns found — the sheet needs a SKU column and the cost columns from Download SKU Cost', 'error'); return; }
      // Laid over what's already there, not swapped for it: a SKU the sheet
      // doesn't list keeps its costs, an emptied cell clears that one cost.
      // Saved for a signed-in user, the same as a typed cost. These are the
      // defaults: orders that already carry a price keep it.
      applyCostSheet(costs);
      const skipped = unread ? ` · ${unread} cell${unread === 1 ? ' isn’t a number' : 's aren’t numbers'} — left as before` : '';
      addToast(count ? `Loaded costs for ${count} SKU${count === 1 ? '' : 's'}${skipped}` : `SKU Cost sheet read — it has no costs filled in${skipped}`, count ? 'success' : 'error');
    } catch (error) {
      addToast(`Could not read SKU costs: ${error.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }, [addToast, applyCostSheet, calculations]);

  const onDownloadSkuTemplate = useCallback(async () => {
    try { await downloadSkuCostTemplate(canonicalRows.map((r) => r.sku), skuCosts); }
    catch { addToast('Could not download the SKU cost template', 'error'); }
  }, [canonicalRows, skuCosts, addToast]);

  const resetFilters = () => {
    const fresh = { dateRange: DEFAULT_RANGE, company: 'all', platform: 'all', ads: DEFAULT_ADS };
    setPending(fresh);
    setApplied(fresh);
  };

  const openTemplateSettings = () => { window.location.href = '/profit-loss/template-settings'; };

  const activeOverview = resolved.overviews?.[activeTabId] || null;
  const showOverview = (config.overviewTabs || []).some((tab) => tab.id === activeTabId);
  const activeTab = visibleTabs.find((t) => t.id === activeTabId) || null;
  const activeOverviewTab = (config.overviewTabs || []).find((o) => o.id === activeTabId) || null;
  // The open page's own name — the header bar's title, the browser tab, and
  // the export's active-tab label all follow it.
  const activePageName = (showTransactions ? 'Transactions' : (activeOverviewTab?.name || activeTab?.name)) || 'Dashboard';
  useEffect(() => {
    document.title = `${activePageName}${DOC_TITLE_SUFFIX}`;
  }, [activePageName]);

  // ── row selection + delete ───────────────────────────────────────────────
  // Checkboxes in the table (DetailsTable) are controlled from here so the
  // header bar's Delete button can act on them regardless of which tab they
  // were checked in. A table row is a group (by SKU on a regular tab, or by
  // the Overview's fixed header on an Overview tab), not a single uploaded
  // record — deleting one removes every underlying uploaded row that fell
  // into that group. Selection resets on tab switch since a key from one
  // grouping (a SKU) has no meaning in the other (a fixed-header value).
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  // Reset Position saves straight away (see resetLayout), so it asks first.
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  useEffect(() => {
    (() => setSelectedKeys(new Set()))();
  }, [activeTabId]);

  const onToggleRow = useCallback((key) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  const onToggleAll = useCallback((keys) => {
    setSelectedKeys((prev) => {
      const allIn = keys.every((k) => prev.has(k));
      const next = new Set(prev);
      keys.forEach((k) => (allIn ? next.delete(k) : next.add(k)));
      return next;
    });
  }, []);

  const onDeleteSelected = useCallback(() => {
    if (calculating || calculationError || restoring || restoreError) return;
    const count = selectedKeys.size;
    if (!count) return;
    // An Overview row is a hierarchy node (Company → Sku → …) keyed by its
    // path; a raw row is covered when ANY prefix of its own path is
    // selected — checking a Company removes every row beneath it.
    const overviewLevels = activeOverview?.levels || [];
    const isSelected = showTransactions
      ? (r) => selectedKeys.has(transactionKeyFor(r, orderIdHeader, transactionIdHeader))
      : showOverview && overviewLevels.length
      ? (r) => rowPathKeys(overviewLevels, r, readHeaderFromRow).some((k) => selectedKeys.has(k))
      : (r) => selectedKeys.has(r.sku);
    const removedRows = uploads.flatMap((u) => u.rows.filter(isSelected));
    setUploads((prev) => prev
      .map((u) => ({ ...u, rows: u.rows.filter((r) => !isSelected(r)) }))
      .filter((u) => u.rows.length > 0));
    addToast(`Deleted ${count} row${count === 1 ? '' : 's'}`);
    setSelectedKeys(new Set());
    setConfirmDeleteOpen(false);

    // Removing rows from `uploads` only clears the in-browser view — every
    // one of them may already be mirrored in profit_loss_extracted_rows by
    // the automatic save (useRowSaver), and load-on-refresh reloads ALL of
    // it, so without this a "deleted" row just comes right back on the next
    // visit. Keyed off the same {orderId, transactionId} the save itself
    // uses (buildExtractedRowsPayload), deduped since a SKU/Overview-group
    // delete can match many raw rows that share one order. Surfaced as a
    // toast on failure, since this is a deliberate action the user just
    // took. The saver is told too (forgetStoredRows): the same rows uploaded
    // again must be saved again, not taken for still stored.
    if (loggedIn && orderIdHeader && removedRows.length) {
      const seen = new Set();
      const keys = buildExtractedRowsPayload(removedRows, orderIdHeader, transactionIdHeader)
        .map((r) => ({ orderId: r.orderId, transactionId: r.transactionId }))
        .filter((k) => {
          const sig = `${k.orderId}::${k.transactionId ?? ''}`;
          if (seen.has(sig)) return false;
          seen.add(sig);
          return true;
        });
      if (keys.length) {
        forgetStoredRows({ keys });
        deleteExtractedRows(keys)
          .then(({ ok }) => {
            if (!ok) addToast('Deleted here, but failed to remove from your saved history — it may come back on refresh', 'error');
          })
          .catch(() => addToast('Deleted here, but failed to remove from your saved history — it may come back on refresh', 'error'));
      }
    }
  }, [selectedKeys, showTransactions, showOverview, activeOverview, orderIdHeader, transactionIdHeader, uploads, loggedIn, addToast, forgetStoredRows, calculating, calculationError, restoring, restoreError]);

  // ── build the "current tab" view for export + save ──────────────────────
  // Takes which resolved snapshot to read from — `resolved` (the live,
  // date-filtered view) by default, or every uploaded row with no date
  // bound (resolveEverything) when Download PDF/Excel calls it.
  // One tab's export view — the table respects "My Details" (that tab's own
  // ticks, the same ones the screen itself uses): only the fields currently
  // ticked there, or the tab's default headers while nothing is (the same
  // tabColumnDefs order TabView shows, narrowed by the same
  // myDetailColumns). Shared by the
  // single-tab Save-to-History payload (buildView, below) and the multi-tab
  // PDF/Excel export (doExport) — "what you're looking at is what gets
  // saved/exported".
  const buildTabView = useCallback((tabDef, isOverview, source) => {
    const ov = isOverview ? (source.overviews?.[tabDef?.id] || null) : null;
    const overview = ov || { name: tabDef?.name, levels: [], headers: [], flatRows: [] };
    // An Overview exports as a pivot with subtotal rows: one column per
    // hierarchy level, then the summed headers (overview.headers — already
    // just its My Details columns, see overviewHeaderIds); every node in
    // depth-first order (a Company row, then its Sku rows, then each Sku's
    // Order Ids).
    let defs = [];
    if (isOverview) {
      if ((overview.levels || []).length) defs = [...overview.levels, ...overview.headers];
    } else {
      const { key, rest } = tabColumnDefs(tabDef, source.headers, { allHeaders: true, groupByHeaderId: config.marketplace?.groupByHeaderId });
      if (key) defs = [key, ...myDetailColumns(rest, myColumnsFor(tabDef?.id, tabDef?.headerIds || []), tabDef?.headerIds)];
    }
    const rows = isOverview ? overview.flatRows || overview.rows || [] : source.tableRows;
    const cards = (tabDef?.titleCardIds || []).map((id) => {
      const c = (config.titleCards || []).find((x) => x.id === id);
      const v = source.titleCardValues[id] || {};
      return { name: c?.name || id, mainDisplay: v.main?.display, subDisplay: v.sub?.display };
    });
    const graphs = (tabDef?.graphIds || []).map((id) => {
      const gDef = (config.graphs || []).find((x) => x.id === id);
      const gData = source.graphSeries?.[id] || null;
      return {
        id,
        name: gDef?.name || id,
        chartType: gData?.chartType || gDef?.chartType || 'line',
        series: gData?.series || [],
      };
    }).filter((g) => g.series && g.series.length > 0);

    return {
      tabName: isOverview ? (overview.name || tabDef?.name || 'Overview') : (tabDef?.name || ''),
      cards,
      graphs,
      table: {
        columns: defs.map((d) => d.name),
        rows: rows.map((r) => defs.map((d) => r.cells[d.id]?.display ?? '')),
      },
    };
  }, [config, myColumnsFor]);

  // Transactions has no Template Settings config of its own (no title
  // cards, no My Details subset) — always every header, one row per Order
  // Id + Transaction Id, straight off whichever resolved-transactions
  // source is passed in.
  const buildTransactionsView = useCallback((source) => ({
    tabName: 'Transactions',
    cards: [],
    graphs: [],
    table: {
      columns: source.headers.map((h) => h.name),
      rows: source.rows.map((r) => source.headers.map((h) => r.cells[h.id]?.display ?? '')),
    },
  }), []);

  const buildView = useCallback((source = resolved) => ({
    label: config.marketplace?.name || 'Dashboard',
    ...(showTransactions ? buildTransactionsView(transactionResolved) : buildTabView(showOverview ? activeOverviewTab : activeTab, showOverview, source)),
  }), [showTransactions, buildTransactionsView, transactionResolved, buildTabView, showOverview, activeOverviewTab, activeTab, config, resolved]);

  // Excel/PDF always pull "all data" — every uploaded row, no date bound
  // (resolveEverything, worked out here, when asked for) — and every visible
  // Tab + Overview Tab, PLUS Transactions (when Order Id is mapped), not
  // just the active one, each its own sheet/section.
  const doExport = async (kind) => {
    if (restoring || restoreError || calculating || calculationError || exporting || busy) { addToast('Wait for complete data and calculations before exporting', 'error'); return; }
    setExporting(true);
    try {
      const { full, fullTransactions } = await resolveEverything();
      const tabs = [
        ...visibleTabs.map((t) => buildTabView(t, false, full)),
        ...visibleOverviewTabs.map((t) => buildTabView(t, true, full)),
        ...(orderIdHeader ? [buildTransactionsView(fullTransactions)] : []),
      ].filter((v) => v.table.columns.length);
      if (!tabs.length) { addToast('Nothing to export', 'error'); return; }
      const label = config.marketplace?.name || 'Dashboard';
      await (kind === 'pdf'
        ? downloadMultiTabPdf({ label, activeTabName: activePageName, tabs })
        : downloadMultiTabXlsx({ label, activeTabName: activePageName, tabs }));
    } catch (err) {
      console.error('Export error:', err);
      addToast(`${kind.toUpperCase()} export failed`, 'error');
    } finally {
      setExporting(false);
    }
  };

  const buildSavePayload = useCallback(() => {
    const view = buildView();
    return {
      label: `${view.label}${applied.dateRange.from ? ` · ${applied.dateRange.from}→${applied.dateRange.to || ''}` : ''}`,
      platforms: resolved.platforms,
      dateFrom: applied.dateRange.from || null,
      dateTo: applied.dateRange.to || null,
      adsMode: applied.ads.mode,
      adsValue: applied.ads.value,
      rowCount: canonicalRows.length,
      summary: showTransactions ? {} : Object.fromEntries((activeTab?.titleCardIds || []).map((id) => {
        const c = (config.titleCards || []).find((x) => x.id === id);
        return [c?.name || id, resolved.titleCardValues[id]?.main?.raw ?? null];
      })),
      // Whichever table is actually on screen — the per-SKU one normally,
      // or (same profit_loss_history.sku_rows column, just a different
      // shape of flat record) the per-transaction one while Transactions
      // is the active view. "Save what I'm looking at", same rule buildView
      // already applies to the label/cards above.
      skuRows: (showTransactions ? transactionResolved.rows : resolved.tableRows).map((r) => {
        const o = {};
        for (const h of (showTransactions ? transactionResolved.headers : resolved.headers)) { if (r.cells[h.id]) o[h.name] = r.cells[h.id].raw; }
        return o;
      }),
      sourceFiles: uploads.map((u) => ({ kind: u.slotId, platform: u.platform, name: u.fileName, sizeBytes: 0, rowCount: u.rows.length, contentBase64: null })),
    };
  }, [buildView, applied, resolved, canonicalRows, activeTab, config, uploads, showTransactions, transactionResolved]);

  if (!templatesReady) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="animate-spin text-muted" size={28} />
      </div>
    );
  }
  if (templatesError) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1">
        <NoTemplateSidebar showTemplateSettings={canManageTemplates} onOpenTemplateSettings={openTemplateSettings} />
        <TemplatesLoadError message={templatesError} onRetry={retryTemplates} />
      </div>
    );
  }
  if (templates.length === 0) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1">
        <NoTemplateSidebar showTemplateSettings={canManageTemplates} onOpenTemplateSettings={openTemplateSettings} />
        <NoMarketplaces showTemplateSettings={canManageTemplates} onOpenTemplateSettings={openTemplateSettings} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <DashboardSidebar
        tabs={visibleTabs}
        activeKey={activeTabId}
        onSelect={(id) => { setPreferredTabId(id); onCloseMobileNav(); }}
        overviewTabs={visibleOverviewTabs}
        showTemplateSettings={canManageTemplates}
        onOpenTemplateSettings={openTemplateSettings}
        onReset={resetFilters}
        mobileOpen={mobileNavOpen}
        onClose={onCloseMobileNav}
        editMode={editMode}
        allTabs={allTabsSorted}
        tabsSection={layout.tabs || emptySection()}
        onTabsSectionChange={(next) => setTopSection('tabs', next)}
        allOverviewTabs={allOverviewTabsSorted}
        overviewTabsSection={layout.overviewTabs || emptySection()}
        onOverviewTabsSectionChange={(next) => setTopSection('overviewTabs', next)}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {(!uploadTab || activeTabId === uploadTab.id || editMode) && (
        <DashboardToolbar
          templates={templates}
          activeTemplateId={activeMarketplace?.id ?? null}
          onSelectTemplate={setActiveTemplateId}
          brands={effectiveBrands}
          brand={selectedBrand}
          onBrandChange={setSelectedBrand}
          onCreateBrand={addBrand}
          fileSlots={config.fileSlots || []}
          onUpload={onUpload}
          onUploadSkuCost={onUploadSkuCost}
          onDownloadSkuTemplate={onDownloadSkuTemplate}
          hasData={hasData}
          busy={busy || restoring || !!restoreError || merged.pending || !!merged.error}
          loggedIn={loggedIn}
          editMode={editMode}
          onEnterEditMode={() => setEditMode(true)}
          onSaveLayout={saveLayout}
          onResetLayout={() => setConfirmResetOpen(true)}
          savingLayout={savingLayout}
        />
        )}

     
        <main className="w-full min-h-0 min-w-0 flex-1 overflow-y-auto px-0 py-6">
          <DashboardHeaderBar
            title={activePageName}
            viewPillsSlotRef={setViewPillsSlot}
            onMenuClick={onMenuClick}
            onReset={resetFilters}
            showSetting={canManageTemplates}
            onOpenSetting={openTemplateSettings}
            companyOptions={companyOptions}
            company={pending.company}
            onCompanyChange={(company) => setPending((s) => ({ ...s, company }))}
            dateRange={pending.dateRange}
            onDateChange={(dr) => setPending((s) => ({ ...s, dateRange: dr }))}
            ads={pending.ads}
            onAdsChange={(ads) => setPending((s) => ({ ...s, ads }))}
            updating={dirty || calculating || exporting}
            actionsDisabled={busy || restoring || !!restoreError || calculating || !!calculationError || exporting}
            hasData={hasData}
            selectedCount={selectedKeys.size}
            onDeleteClick={() => setConfirmDeleteOpen(true)}
            onExportExcel={() => doExport('xlsx')}
            onExportPdf={() => doExport('pdf')}
            onOpenHistory={() => setHistoryOpen(true)}
            saveProps={{ buildPayload: buildSavePayload, rowCount: canonicalRows.length, disabled: busy || restoring || !!restoreError || calculating || !!calculationError }}
          />

          {/* Rows were uploaded and mapped fine, but every one of them falls
              outside the selected date range — the table would otherwise
              look identical to "nothing was ever uploaded", with no clue
              why. Settlement exports are almost always older than the
              default 7-day window. */}
          {!calculating && !calculationError && hasData && canonicalRows.length > 0 && !showTransactions && resolved.rowCount === 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-neg/10 px-3 py-2 text-[13px] text-neg">
              <span>
                {canonicalRows.length} row{canonicalRows.length === 1 ? '' : 's'} uploaded, but none fall in the selected date range.
              </span>
              <button
                type="button"
                onClick={() => {
                  const wide = { preset: 'custom', from: null, to: null };
                  setPending((s) => ({ ...s, dateRange: wide }));
                  setApplied((s) => ({ ...s, dateRange: wide }));
                }}
                className="shrink-0 rounded-full bg-neg px-3 py-1 text-[12px] font-semibold text-white hover:opacity-90"
              >
                Show all dates
              </button>
            </div>
          )}

          {restoring && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-action-soft px-3 py-2 text-[13px] text-action">
              <Loader2 size={14} className="shrink-0 animate-spin" />
              <span>
                {restorePaging ? `Loading your saved data — ${Math.min(restorePaging.page * RESTORE_PAGE_SIZE, restorePaging.totalCount)} of ${restorePaging.totalCount} rows… Totals are provisional.` : 'Loading your saved data…'}
              </span>
            </div>
          )}
          {restoreError && (
            <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-neg/10 px-3 py-2 text-sm text-neg">
              <span>{restoreError}</span>
              <button type="button" className="font-semibold underline" onClick={() => setRestoreAttempt((attempt) => attempt + 1)}>Retry</button>
            </div>
          )}
          {calculationError && <p role="alert" className="mt-4 text-sm text-neg">Could not calculate this view: {calculationError.message}. Change the filters or reload to retry.</p>}

          {/* The save of an upload whose window was hidden, or of rows written back outside one. */}
          {(!uploadStage || uploadStage.hidden) && <SavingRowsLine saving={rowSave} onRetry={retryRowSave} />}

          <div aria-busy={calculating} inert={calculating || !!calculationError || restoring || !!restoreError || undefined} className={`mt-6 space-y-5 ${calculating ? 'opacity-60' : ''}`}>
            {/* Even with nothing uploaded yet, the active tab's title cards /
                graphs / table headers render from the template config in
                their zero/empty state — only the rows are empty. */}
            {showTransactions ? (
              <div className="space-y-3">
                {/* "Transactions" itself is the header bar's title now. */}
                <p className="text-sm text-muted">
                  One row per Order Id{transactionIdHeader ? ' + Transaction Id' : ''} — every mapped header at its own raw value, not summed across a SKU&rsquo;s whole history.
                </p>
                <DetailsTable
                  columns={transactionResolved.headers}
                  rows={transactionResolved.rows}
                  disableCostColumn
                  selectedKeys={selectedKeys}
                  onToggleRow={onToggleRow}
                  onToggleAll={onToggleAll}
                  totalCount={canonicalRows.length}
                />
              </div>
            ) : showOverview ? (
              <OverviewTab
                key={activeOverviewTab?.id}
                config={config}
                tab={activeOverviewTab}
                resolved={resolved}
                editMode={editMode}
                layout={layout}
                onSetTabSection={setTabSection}
                skuCosts={skuCosts}
                onCostChange={onCostChange}
                selectedKeys={selectedKeys}
                onToggleRow={onToggleRow}
                onToggleAll={onToggleAll}
                dirtyKeys={dirtySkuKeys}
                dirtyCostCells={dirtyCostCells}
                myColumns={myColumnsFor(activeOverviewTab?.id, activeOverviewTab?.headerIds || [], false)}
                onMyColumnsChange={(next) => onMyColumnsChange(activeOverviewTab?.id, next, activeOverviewTab?.headerIds || [])}
                viewPillsSlot={viewPillsSlot}
              />
            ) : (
              <TabView
                config={config}
                tab={activeTab}
                resolved={resolved.tableRows === displayTableRows ? resolved : { ...resolved, tableRows: displayTableRows }}
                myColumns={myColumnsFor(activeTab?.id, activeTab?.headerIds || [])}
                onMyColumnsChange={(next) => onMyColumnsChange(activeTab?.id, next, activeTab?.headerIds || [])}
                editMode={editMode}
                layout={layout}
                onSetTabSection={setTabSection}
                skuCosts={skuCosts}
                onCostChange={onCostChange}
                selectedKeys={selectedKeys}
                onToggleRow={onToggleRow}
                onToggleAll={onToggleAll}
                dirtyKeys={dirtySkuKeys}
                dirtyCostCells={dirtyCostCells}
                totalCount={canonicalRows.length}
                viewPillsSlot={viewPillsSlot}
                allHeaders
              />
            )}
          </div>

          {/* The two diagnostic screens below are development-only — a
              production build hides both (lib/debugTools.js). */}

          {/* Merged Extracted Common Headers Data Table */}
          {DEBUG_TOOLS && canonicalRows.length > 0 && (
            <MergedCommonHeadersTable canonicalRows={canonicalRows} config={config} uploads={uploads} />
          )}

          {/* Right below the upload toolbar — template builders can inspect
              exactly what any file (including one they haven't mapped yet)
              parses to without leaving the dashboard. Same gate as Template
              Settings; a regular seller never sees it. */}
          {DEBUG_TOOLS && canManageTemplates && (
            <div className="mt-6 max-h-[60vh] shrink-0 overflow-y-auto border-t border-divider bg-surface p-4 rounded-xl">
              <NextLevelSheetDebugger
                externalFile={debugFile}
                externalSlotId={debugSlotId}
                showPicker={false}
                fileSlots={config.fileSlots || []}
                headers={config.headers || []}
              />
            </div>
          )}
        </main>
      </div>

      {historyOpen && <HistoryDrawer open onClose={() => setHistoryOpen(false)} onOpenRun={() => {}} />}

      <UploadProgress
        stage={uploadStage}
        saving={rowSave}
        signedIn={loggedIn}
        onHide={() => setUploadStage((s) => (rowSave?.phase === 'failed' ? null : s && { ...s, hidden: true }))}
        onRetry={retryRowSave}
      />

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={`Delete ${selectedKeys.size} row${selectedKeys.size === 1 ? '' : 's'}?`}
        description="Removes the underlying uploaded rows from this session's loaded data. This can't be undone."
        confirmLabel="Delete"
        onConfirm={onDeleteSelected}
        onCancel={() => setConfirmDeleteOpen(false)}
      />

      <ConfirmDialog
        open={confirmResetOpen}
        title="Reset your dashboard to the default layout?"
        description="Your own arrangement — tab order, hidden items, column order and My Details columns, on every tab — goes back to what the template sets. It is saved straight away."
        confirmLabel="Reset"
        loadingLabel="Resetting…"
        loading={savingLayout}
        onConfirm={async () => { await resetLayout(); setConfirmResetOpen(false); }}
        onCancel={() => { if (!savingLayout) setConfirmResetOpen(false); }}
      />
    </div>
  );
}
