'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { failureMessage, listLiveTemplates } from '@/lib/profitLoss/templatesApi';
import { readAnyFile } from '@/lib/sheet/readAnyFile';
import { parseSkuCostSheet } from '@/lib/sheet/parseWorkbook';
import { downloadSkuCostTemplate } from '@/lib/sheet/skuCostTemplate';
import { rowOverrideFor } from '@/lib/sheet/rowOverride';
import { ingestWorkbook } from '@/lib/profitLoss/ingest';
import { effectiveConfig } from '@/lib/profitLoss/effectiveConfig';
import { rangeForPreset, todayISO } from '@/lib/profitLoss/dateRanges';
import { resolveTemplate, readHeaderFromRow, resolveTransactionRows, transactionKeyFor } from '@/lib/profitLoss/resolveTemplate';
import { rowPathKeys } from '@/lib/profitLoss/overviewTree';
import { mergeUploadsAcrossSlots } from '@/lib/profitLoss/mergeRows';
import { buildExtractedSnapshot, mergeExtractedData, fillFromExtractedData } from '@/lib/profitLoss/extractedDataStore';
import { buildExtractedRowsPayload, rowsFromExtractedPayload } from '@/lib/profitLoss/rowsPayload';
import { downloadMultiTabXlsx, downloadMultiTabPdf } from '@/lib/profitLoss/exportTemplate';
import { listCompanies, saveCompany, saveExtractedRows, listExtractedRows, deleteExtractedRows } from '@/lib/profitLoss/apiClient';
import { useDashboardSettings } from '@/lib/profitLoss/useDashboardSettings';
import { applyLayout, emptySection } from '@/lib/profitLoss/layoutSections';
import { myDetailColumns, tabColumnDefs } from '@/lib/profitLoss/tabColumns';
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
import MergedCommonHeadersTable from './MergedCommonHeadersTable';
import HistoryDrawer from './HistoryDrawer';
import NoMarketplaces from './NoMarketplaces';
import NoTemplateSidebar from './NoTemplateSidebar';
import TemplatesLoadError from './TemplatesLoadError';
import NextLevelSheetDebugger from '@/components/templateSettings/NextLevelSheetDebugger';

const DEFAULT_RANGE = { preset: '7d', ...rangeForPreset('7d') };
const DEFAULT_ADS = { mode: 'percent', value: 0 };
const emptyResolved = { headers: [], tableRows: [], titleCardValues: {}, graphSeries: {}, overviews: {}, aggregate: {}, companyOptions: [], rowCount: 0, platforms: [] };
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
// Same suffix app/layout.js's metadata title template adds — the browser tab
// follows whichever page (Tab / Overview Tab / Transactions) is open.
const DOC_TITLE_SUFFIX = ' | Barmeto Profit & Loss';

export default function DashboardWorkspace({ canManageTemplates = false, onMenuClick, mobileNavOpen = false, onCloseMobileNav = () => {} }) {
  const { addToast } = useToast();

  // ── templates ───────────────────────────────────────────────────────────
  // Starts empty and stays empty unless a real marketplace template is
  // published — no built-in fallback config, so a fresh install with nothing
  // configured shows "No marketplaces" instead of a fake dashboard.
  // Headers/Title Cards/Graphs/Tabs/Overview Tabs are global (`global`,
  // shared, fetched once) — switching marketplace only changes `templates`'
  // per-marketplace fileSlots/mappings, never the dashboard's shape.
  const [templates, setTemplates] = useState([]);
  const [globalConfig, setGlobalConfig] = useState(null);
  const [templatesReady, setTemplatesReady] = useState(false);
  const [activeTemplateId, setActiveTemplateId] = useState(null);
  // A failed load (hub unreachable / restarting, server error) is its own
  // state — never treated as "zero marketplaces" — so the page can say why
  // and offer Try again (TemplatesLoadError) instead of "No marketplaces yet".
  const [templatesError, setTemplatesError] = useState(null);

  // State is only set inside the promise callbacks (never synchronously) —
  // the first load runs from the mount effect with the initial "loading, no
  // error" state already in place; Try again (retryTemplates) resets that
  // state itself first.
  const fetchTemplates = useCallback(() => listLiveTemplates()
    .then((res) => {
      if (!res.ok) { setTemplatesError(failureMessage(res, 'Could not load the marketplaces')); return; }
      const live = Array.isArray(res.data?.templates) ? res.data.templates : [];
      setGlobalConfig(res.data?.global || {});
      setTemplates(live);
      setActiveTemplateId((cur) => (live.some((t) => t.id === cur) ? cur : live[0]?.id ?? null));
    })
    .catch((err) => setTemplatesError(failureMessage(err, 'Could not load the marketplaces')))
    .finally(() => setTemplatesReady(true)), []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);
  const retryTemplates = () => {
    setTemplatesReady(false);
    setTemplatesError(null);
    fetchTemplates();
  };

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
  const [skuCost, setSkuCost] = useState(null); // { map, count, fileName }
  const [busy, setBusy] = useState(false);
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
  const canonicalRows = useMemo(
    () => mergeUploadsAcrossSlots(uploads, orderIdHeader, transactionIdHeader, config.headers),
    [uploads, orderIdHeader, transactionIdHeader, config.headers],
  );

  // ── filters (pending vs applied) ────────────────────────────────────────
  // dateRange is a "getting data" bound — Download PDF/Excel ignores it (see
  // fullResolved below) but still respects company/platform. All three (plus
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
  useEffect(() => {
    const t = setTimeout(() => setApplied(pending), 500);
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
  // DashboardHeaderBar's two empty slots (callback refs → DOM nodes): the
  // active table portals its page limit + row counts into the first (before
  // "All Companies"), TabView its My Details pill into the second (after the
  // date filter).
  const [pagerSlot, setPagerSlot] = useState(null);
  const [viewPillsSlot, setViewPillsSlot] = useState(null);

  // My Details column ticks (per tab) + the sidebar's Settings -> Save
  // edit-mode layout (tabs/title-cards/graphs/columns show+order) — one
  // per-user settings row, see lib/profitLoss/useDashboardSettings.js.
  const {
    loggedIn, myColumnsFor, onMyColumnsChange,
    layout, setTopSection, setTabSection, resetLayout,
    brands, addBrand,
    onSkuCostsChange, skuCostsSaveTick,
    extractedData, onExtractedDataChange,
    editMode, setEditMode, saveLayout, savingLayout,
  } = useDashboardSettings({
    ads: pending.ads,
    dateRange: pending.dateRange,
    addToast,
    onLoadedPreferences: (p) => {
      if (p.adsMode) setPending((s) => ({ ...s, ads: { mode: p.adsMode, value: p.adsValue ?? 0 } }));
      if (p.defaultDatePreset) setPending((s) => ({ ...s, dateRange: { preset: p.defaultDatePreset, ...rangeForPreset(p.defaultDatePreset) } }));
      // A returning signed-in user's manually-typed SKU costs, saved (debounced)
      // from the table's Cost column — restored here so they don't have to
      // retype them every session. A later SKU-cost sheet upload still wins
      // (onUploadSkuCost replaces the whole map wholesale, same as today).
      if (p.skuCosts && typeof p.skuCosts === 'object' && Object.keys(p.skuCosts).length) {
        setSkuCost({ map: p.skuCosts, count: Object.keys(p.skuCosts).length, fileName: null });
      }
    },
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
  const [restorePaging, setRestorePaging] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const loadRestoredPage = useCallback(async (page) => {
    const { ok, data } = await listExtractedRows({ page, limit: RESTORE_PAGE_SIZE });
    if (!ok) return null;
    const rows = rowsFromExtractedPayload(data.rows || []);
    setUploads((prev) => (prev.some((u) => u.slotId === RESTORED_SLOT_ID)
      ? prev.map((u) => (u.slotId === RESTORED_SLOT_ID ? { ...u, rows: [...u.rows, ...rows] } : u))
      : [...prev, { id: 'restored', slotId: RESTORED_SLOT_ID, fileName: 'Saved from your account', platform: 'restored', rows }]));
    return data;
  }, []);
  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    (async () => {
      setRestoring(true);
      try {
        let page = 1;
        let data = await loadRestoredPage(page);
        while (data && !cancelled && page < data.totalPages) {
          setRestorePaging({ page, totalPages: data.totalPages, totalCount: data.totalCount });
          page += 1;
          data = await loadRestoredPage(page);
        }
        if (!cancelled && data) {
          setRestorePaging({ page, totalPages: data.totalPages, totalCount: data.totalCount });
        }
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

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
    () => [...visibleTabs, ...visibleOverviewTabs].find((t) => normTabName(t.name) === UPLOAD_TAB_NAME) || null,
    [visibleTabs, visibleOverviewTabs],
  );

  // ── resolve (computed right here in the browser) ────────────────────────
  // Title cards, graphs, the table, overview pivots — every formula — run
  // via resolveTemplate/resolveTransactionRows directly against the FULL
  // canonicalRows, the same way the export-only fullResolved below already
  // did. Date range, Company and Platform are the only things that narrow
  // what counts (resolveTemplate's own dateFrom/dateTo/company/platform
  // filter, unchanged) — everything past that (which columns show, sort
  // order, per-column search, page size/page) is DetailsTable's own
  // client-side concern and never touches this. No network round trip
  // anymore, so no separate debounce/request-race guard is needed beyond
  // the existing pending->applied one above — a useMemo just recomputes
  // synchronously whenever an input changes. Falls back to the config's own
  // zero/empty shape on any failure so tabs/title cards/graphs/table headers
  // still render — just with blank values.
  const resolved = useMemo(() => {
    if (!config.headers?.length) return emptyResolved;
    try {
      return resolveTemplate(config, {
        canonicalRows,
        skuCostMap: skuCost?.map || {},
        ads: applied.ads,
        dateFrom: applied.dateRange.from,
        dateTo: applied.dateRange.to,
        platform: applied.platform,
        company: applied.company,
      });
    } catch (err) {
      console.error('resolveTemplate failed:', err);
      return emptyResolved;
    }
  }, [config, canonicalRows, skuCost, applied]);

  const transactionResolved = useMemo(() => {
    if (!orderIdHeader || !config.headers?.length) return { headers: config.headers || [], rows: [], rowCount: 0 };
    try {
      return resolveTransactionRows(config, {
        canonicalRows,
        skuCostMap: skuCost?.map || {},
        ads: applied.ads,
        dateFrom: applied.dateRange.from,
        dateTo: applied.dateRange.to,
        platform: applied.platform,
        company: applied.company,
      });
    } catch (err) {
      console.error('resolveTransactionRows failed:', err);
      return { headers: config.headers || [], rows: [], rowCount: 0 };
    }
  }, [orderIdHeader, config, canonicalRows, skuCost, applied]);

  // The complete, unlimited dataset — every uploaded row, no date bound —
  // resolved once so Download PDF/Excel can pull "all data" regardless of
  // the live view's date-range. Still respects an intentional Company/
  // Platform scope, since those are a deliberate choice, not a performance
  // limit. Only computed lazily inside doExport (not on every keystroke)
  // would be nicer, but resolveTemplate is cheap enough over this dataset's
  // realistic size that resolving it here eagerly is fine.
  const fullResolved = useMemo(() => {
    if (!config.headers?.length) return emptyResolved;
    try {
      return resolveTemplate(config, {
        canonicalRows,
        skuCostMap: skuCost?.map || {},
        ads: applied.ads,
        dateFrom: null,
        dateTo: null,
        platform: applied.platform,
        company: applied.company,
      });
    } catch (err) {
      console.error('resolveTemplate (export) failed:', err);
      return emptyResolved;
    }
  }, [config, canonicalRows, skuCost, applied.ads, applied.platform, applied.company]);

  // Transactions' own "all data" counterpart to fullResolved — same reason:
  // Download PDF/Excel pulls every row regardless of the live view's date
  // range. Computed unconditionally (not gated on showTransactions) since
  // export needs it even when some other tab is the one on screen.
  const fullTransactionResolved = useMemo(() => {
    if (!orderIdHeader || !config.headers?.length) return { headers: config.headers || [], rows: [], rowCount: 0 };
    try {
      return resolveTransactionRows(config, {
        canonicalRows,
        skuCostMap: skuCost?.map || {},
        ads: applied.ads,
        dateFrom: null,
        dateTo: null,
        platform: applied.platform,
        company: applied.company,
      });
    } catch (err) {
      console.error('resolveTransactionRows (export) failed:', err);
      return { headers: config.headers || [], rows: [], rowCount: 0 };
    }
  }, [orderIdHeader, config, canonicalRows, skuCost, applied.ads, applied.platform, applied.company]);

  // Every mapped (non-computed) header's per-SKU value the FULL dataset
  // currently has — persisted (debounced, merge-only-where-non-empty; see
  // extractedDataStore.js) so a header this session's upload doesn't happen
  // to touch still shows what it was last known to be, without ever
  // freezing a computed metric (Profit/Loss, COGS, ...) from a stale
  // session. Uses fullResolved (every row, no row-limit) rather than the
  // live/limited `resolved` so an older row falling outside the "smart
  // limit" doesn't look like its data disappeared.
  useEffect(() => {
    if (!loggedIn || !fullResolved.tableRows.length) return;
    const snapshot = buildExtractedSnapshot(fullResolved.tableRows, fullResolved.headers);
    if (!Object.keys(snapshot).length) return;
    const merged = mergeExtractedData(extractedData, snapshot);
    if (JSON.stringify(merged) === JSON.stringify(extractedData)) return;
    (() => onExtractedDataChange(merged))();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullResolved, loggedIn]);

  // The live table's rows, with any header this SKU has no CURRENT value
  // for filled in from that same saved snapshot — display only (aggregate/
  // title cards/graphs/export still read the live, un-filled `resolved`).
  const displayTableRows = useMemo(
    () => fillFromExtractedData(resolved.tableRows, resolved.headers, extractedData),
    [resolved, extractedData],
  );

  // Automatic, unmetered per-ROW persistence (Task: "save all my headers
  // data user-wise... one row one json") — distinct from the per-SKU
  // extractedData snapshot above. Debounced against canonicalRows churn (a
  // multi-file upload fires setUploads more than once); best-effort — a
  // failure here is silent (never a toast) since this is background
  // enrichment, not the deliberate, coin-metered Save to History.
  useEffect(() => {
    // Nothing freshly uploaded this session — everything on screen is what
    // was just fetched back from this same table, so writing it straight
    // back would be a pointless (if harmless) round-trip.
    if (!loggedIn || !canonicalRows.length || !uploads.some((u) => u.slotId !== RESTORED_SLOT_ID)) return;
    const t = setTimeout(() => {
      const payload = buildExtractedRowsPayload(canonicalRows, orderIdHeader, transactionIdHeader);
      if (payload.length) saveExtractedRows(payload).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [canonicalRows, uploads, orderIdHeader, transactionIdHeader, loggedIn]);

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
  const onUpload = useCallback(async (slotId, files) => {
    if (!selectedBrand) { addToast('Pick or create a brand first', 'error'); return; }
    setBusy(true);
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
      for (const file of files) {
        setDebugFile(file);
        setDebugSlotId(slotId);
        let wb;
        try {
          wb = await readAnyFile(file, rowOverride);
        } catch {
          addToast(`${file.name}: could not be read`, 'error');
          continue;
        }
        if (!wb.sheetNames.length) { addToast(`No table found in ${file.name}`, 'error'); continue; }
        // Reads every sheet the slot's Template Settings included (or the
        // best one for an older slot) and applies the marketplace's own
        // Order Id / SKU / Order Date mappings — see lib/profitLoss/ingest.js.
        const res = ingestWorkbook(wb, { slotDef, config, tag, fileName: file.name });
        if (!res.ok) {
          addToast(`${file.name}: doesn't match "${slotDef.label}" — missing column${res.missing.length === 1 ? '' : 's'}: ${res.missing.join(', ')}`, 'error');
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
        setUploads((prev) => [...prev, ...added]);
        const fresh = added.flatMap((a) => a.rows);
        const sheets = added.length > files.length ? ` from ${added.length} sheets` : '';
        addToast(fresh.length ? `Loaded ${fresh.length} rows${sheets}` : 'File loaded but no rows matched — check the sheet', fresh.length ? 'success' : 'error');
        fitDateRangeTo(fresh);
      }
    } finally {
      setBusy(false);
    }
  }, [addToast, config, selectedBrand, loggedIn, fitDateRangeTo]);

  const onUploadSkuCost = useCallback(async (file) => {
    if (!file) return;
    setDebugFile(file);
    setDebugSlotId(null); // not a marketplace file slot — nothing to match against
    setBusy(true);
    try {
      const { map, count } = await parseSkuCostSheet(file);
      if (!count) { addToast('No SKU/Cost columns found', 'error'); return; }
      setSkuCost({ map, count, fileName: file.name });
      addToast(`Loaded costs for ${count} SKUs`);
    } finally {
      setBusy(false);
    }
  }, [addToast]);

  const onDownloadSkuTemplate = useCallback(() => {
    downloadSkuCostTemplate([...new Set(canonicalRows.map((r) => r.sku))]);
  }, [canonicalRows]);

  // The table's inline Cost input — updates the live skuCostMap immediately
  // (so Product Cost / COGS / Profit-Loss recompute as the user types) and
  // hands the fresh map to the debounced-save hook for signed-in users.
  // `dirtySkuKeys` marks the row light blue ("unsaved") the moment a Cost is
  // typed; it clears (back to normal) once useDashboardSettings' debounced
  // PUT actually succeeds (skuCostsSaveTick below) — for a signed-out user
  // that never happens, so the highlight correctly stays on forever (it
  // really isn't being saved anywhere for them).
  const [dirtySkuKeys, setDirtySkuKeys] = useState(() => new Set());
  const onCostChange = useCallback((sku, rawValue) => {
    const map = { ...(skuCost?.map || {}) };
    const trimmed = String(rawValue ?? '').trim();
    if (trimmed === '') delete map[sku];
    else {
      const n = Number(trimmed);
      if (Number.isFinite(n)) map[sku] = n;
    }
    setSkuCost({ map, count: Object.keys(map).length, fileName: skuCost?.fileName ?? null });
    onSkuCostsChange(map);
    setDirtySkuKeys((prev) => new Set(prev).add(sku));
  }, [skuCost, onSkuCostsChange]);

  useEffect(() => {
    if (skuCostsSaveTick > 0) (() => setDirtySkuKeys(new Set()))();
  }, [skuCostsSaveTick]);

  const resetFilters = () => {
    const fresh = { dateRange: DEFAULT_RANGE, company: 'all', platform: 'all', ads: DEFAULT_ADS };
    setPending(fresh);
    setApplied(fresh);
  };

  const openTemplateSettings = () => { window.location.href = '/profit-loss/template-settings'; };

  const activeOverview = resolved.overviews?.[activeTabId] || null;
  const showOverview = !!activeOverview;
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
    // the background auto-save effect above, and load-on-refresh reloads
    // ALL of it, so without this a "deleted" row just comes right back on
    // the next visit. Keyed off the same {orderId, transactionId} the
    // auto-save itself uses (buildExtractedRowsPayload), deduped since a
    // SKU/Overview-group delete can match many raw rows that share one
    // order. Best-effort like the auto-save, but — unlike that silent
    // background sync — surfaced as a toast on failure, since this is a
    // deliberate action the user just took.
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
        deleteExtractedRows(keys)
          .then(({ ok }) => {
            if (!ok) addToast('Deleted here, but failed to remove from your saved history — it may come back on refresh', 'error');
          })
          .catch(() => addToast('Deleted here, but failed to remove from your saved history — it may come back on refresh', 'error'));
      }
    }
  }, [selectedKeys, showTransactions, showOverview, activeOverview, orderIdHeader, transactionIdHeader, uploads, loggedIn, addToast]);

  // ── build the "current tab" view for export + save ──────────────────────
  // Takes which resolved snapshot to read from — `resolved` (the live,
  // date-filtered view) by default, or `fullResolved` (every uploaded row,
  // no date bound) when Download PDF/Excel calls it.
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
    // hierarchy level, then the summed headers; every node in depth-first
    // order (a Company row, then its Sku rows, then each Sku's Order Ids).
    let defs = [];
    if (isOverview) {
      if ((overview.levels || []).length) defs = [...overview.levels, ...overview.headers];
    } else {
      const { key, rest } = tabColumnDefs(tabDef, source.headers, { allHeaders: true, groupByHeaderId: config.marketplace?.groupByHeaderId });
      if (key) defs = [key, ...myDetailColumns(rest, myColumnsFor(tabDef?.id), tabDef?.headerIds)];
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
  // (fullResolved/fullTransactionResolved) — and every visible Tab +
  // Overview Tab, PLUS Transactions (when Order Id is mapped), not just the
  // active one, each its own sheet/section.
  const doExport = async (kind) => {
    if (restoring) { addToast('Still loading your saved data — try again in a moment', 'error'); return; }
    const tabs = [
      ...visibleTabs.map((t) => buildTabView(t, false, fullResolved)),
      ...visibleOverviewTabs.map((t) => buildTabView(t, true, fullResolved)),
      ...(orderIdHeader ? [buildTransactionsView(fullTransactionResolved)] : []),
    ].filter((v) => v.table.columns.length);
    if (!tabs.length) { addToast('Nothing to export', 'error'); return; }
    try {
      const label = config.marketplace?.name || 'Dashboard';
      await (kind === 'pdf'
        ? downloadMultiTabPdf({ label, activeTabName: activePageName, tabs })
        : downloadMultiTabXlsx({ label, activeTabName: activePageName, tabs }));
    } catch (err) {
      console.error('Export error:', err);
      addToast(`${kind.toUpperCase()} export failed`, 'error');
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
        showTransactions={!!orderIdHeader}
        transactionsActive={showTransactions}
        onOpenTransactions={() => { setPreferredTabId(TRANSACTIONS_TAB_ID); onCloseMobileNav(); }}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {(!uploadTab || activeTabId === uploadTab.id || editMode) && (
        <DashboardToolbar
          templates={templates}
          activeTemplateId={activeTemplateId}
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
          busy={busy}
          loggedIn={loggedIn}
          editMode={editMode}
          onEnterEditMode={() => setEditMode(true)}
          onSaveLayout={saveLayout}
          onResetLayout={resetLayout}
          savingLayout={savingLayout}
        />
        )}

     
        <main className="w-full min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-10">
          <DashboardHeaderBar
            title={activePageName}
            pagerSlotRef={setPagerSlot}
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
            updating={dirty}
            hasData={hasData}
            selectedCount={selectedKeys.size}
            onDeleteClick={() => setConfirmDeleteOpen(true)}
            onExportExcel={() => doExport('xlsx')}
            onExportPdf={() => doExport('pdf')}
            onOpenHistory={() => setHistoryOpen(true)}
            saveProps={{ buildPayload: buildSavePayload, rowCount: canonicalRows.length, disabled: busy }}
          />

          {/* Rows were uploaded and mapped fine, but every one of them falls
              outside the selected date range — the table would otherwise
              look identical to "nothing was ever uploaded", with no clue
              why. Settlement exports are almost always older than the
              default 7-day window. */}
          {hasData && canonicalRows.length > 0 && !showTransactions && resolved.rowCount === 0 && (
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

          {restoring && restorePaging && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-action-soft px-3 py-2 text-[13px] text-action">
              <Loader2 size={14} className="shrink-0 animate-spin" />
              <span>
                Loading your saved data — {Math.min(restorePaging.page * RESTORE_PAGE_SIZE, restorePaging.totalCount)} of {restorePaging.totalCount} rows…
              </span>
            </div>
          )}

          <div className="mt-6 space-y-5">
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
                  pagerSlot={pagerSlot}
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
                costBySku={skuCost?.map || {}}
                onCostChange={onCostChange}
                selectedKeys={selectedKeys}
                onToggleRow={onToggleRow}
                onToggleAll={onToggleAll}
                dirtyKeys={dirtySkuKeys}
                pagerSlot={pagerSlot}
              />
            ) : (
              <TabView
                config={config}
                tab={activeTab}
                resolved={resolved.tableRows === displayTableRows ? resolved : { ...resolved, tableRows: displayTableRows }}
                myColumns={myColumnsFor(activeTab?.id)}
                onMyColumnsChange={(next) => onMyColumnsChange(activeTab?.id, next)}
                editMode={editMode}
                layout={layout}
                onSetTabSection={setTabSection}
                costBySku={skuCost?.map || {}}
                onCostChange={onCostChange}
                selectedKeys={selectedKeys}
                onToggleRow={onToggleRow}
                onToggleAll={onToggleAll}
                dirtyKeys={dirtySkuKeys}
                totalCount={canonicalRows.length}
                viewPillsSlot={viewPillsSlot}
                pagerSlot={pagerSlot}
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

      <HistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} onOpenRun={() => {}} />

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={`Delete ${selectedKeys.size} row${selectedKeys.size === 1 ? '' : 's'}?`}
        description="Removes the underlying uploaded rows from this session's loaded data. This can't be undone."
        confirmLabel="Delete"
        onConfirm={onDeleteSelected}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </div>
  );
}
