'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { listLiveTemplates } from '@/lib/profitLoss/templatesApi';
import { readAnyFile } from '@/lib/sheet/readAnyFile';
import { parseSkuCostSheet } from '@/lib/sheet/parseWorkbook';
import { downloadSkuCostTemplate } from '@/lib/sheet/skuCostTemplate';
import { matchSlotHeaders } from '@/lib/sheet/matchSlotHeaders';
import { rowOverrideFor } from '@/lib/sheet/rowOverride';
import { detectPlatform } from '@/data/platforms/detect';
import { mapRowsForPlatform, pickBestTab } from '@/data/platforms/index';
import { guessMapping } from '@/data/platforms/manual';
import { rangeForPreset } from '@/lib/profitLoss/dateRanges';
import { resolveTemplate, readHeaderFromRow, resolveTransactionRows, transactionKeyFor } from '@/lib/profitLoss/resolveTemplate';
import { mergeUploadsAcrossSlots } from '@/lib/profitLoss/mergeRows';
import { buildExtractedSnapshot, mergeExtractedData, fillFromExtractedData } from '@/lib/profitLoss/extractedDataStore';
import { buildExtractedRowsPayload, rowsFromExtractedPayload } from '@/lib/profitLoss/rowsPayload';
import { downloadMultiTabXlsx, downloadMultiTabPdf } from '@/lib/profitLoss/exportTemplate';
import { listCompanies, saveCompany, saveExtractedRows, listExtractedRows, deleteExtractedRows } from '@/lib/profitLoss/apiClient';
import { useDashboardSettings } from '@/lib/profitLoss/useDashboardSettings';
import { applyLayout, emptySection } from '@/lib/profitLoss/layoutSections';
import { RESERVED_HEADER_IDS } from '@/data/templateSchema';
import { useToast } from '@/components/admin/Toast';
import ConfirmDialog from '@/components/admin/ConfirmDialog';

import DashboardSidebar from './DashboardSidebar';
import DashboardToolbar from './DashboardToolbar';
import DashboardHeaderBar from './DashboardHeaderBar';
import BrandPicker from './BrandPicker';
import TabView from './TabView';
import OverviewTab from './OverviewTab';
import DetailsTable from './DetailsTable';
import MergedCommonHeadersTable from './MergedCommonHeadersTable';
import HistoryDrawer from './HistoryDrawer';
import NoMarketplaces from './NoMarketplaces';
import NoTemplateSidebar from './NoTemplateSidebar';
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
// The hub's own per-page cap (lib/db.js) — used as the restore loop's page
// size so pulling this user's ENTIRE saved history takes as few round trips
// as possible. No page-count ceiling: every page gets fetched, however many
// there are — Date/Company/Platform narrow the DASHBOARD (resolveTemplate
// below), not what gets loaded, so title cards/graphs/table and the table's
// own sort/search always see the complete dataset.
const RESTORE_PAGE_SIZE = 500;

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

  useEffect(() => {
    listLiveTemplates()
      .then(({ ok, data }) => {
        const live = ok && Array.isArray(data?.templates) ? data.templates : [];
        setGlobalConfig(ok ? data?.global || {} : {});
        if (live.length) {
          setTemplates(live);
          setActiveTemplateId(live[0].id);
        }
      })
      .finally(() => setTemplatesReady(true));
  }, []);

  const activeMarketplace = useMemo(
    () => templates.find((t) => t.id === activeTemplateId) || templates[0],
    [templates, activeTemplateId],
  );

  // The effective config a marketplace's dashboard renders: the shared
  // global Headers/Title Cards/Graphs/Tabs/Overview Tabs, plus this
  // marketplace's own `marketplace` + `fileSlots`. Each global header's
  // `mappedFrom` isn't stored on the header itself anymore (the same header
  // maps to a different sheet column per marketplace) — it's reconstructed
  // here from the active marketplace's fileSlots[].mappings before
  // resolveTemplate (which stays marketplace-agnostic) ever sees it.
  //
  // Every saved global header always shows here, mapped for this marketplace
  // or not — switching Market Place changes where the data comes from, never
  // what's shown (see CLAUDE.md). A header this marketplace hasn't mapped
  // anything to just renders blank for it, same as any other header with no
  // data yet; that's preferable to a column that silently disappears and
  // reappears as the user switches marketplaces.
  const config = useMemo(() => {
    if (!globalConfig || !activeMarketplace) return {};
    const fileSlots = activeMarketplace.config?.fileSlots || [];
    const mappedFromByHeaderId = new Map();
    for (const slot of fileSlots) {
      for (const m of slot.mappings || []) {
        mappedFromByHeaderId.set(m.headerId, { slot: slot.id, sheetHeader: m.sheetHeader });
      }
    }
    const headers = (globalConfig.headers || [])
      .map((h) => ({ ...h, mappedFrom: mappedFromByHeaderId.get(h.id) || null }));
    return {
      ...globalConfig,
      headers,
      marketplace: activeMarketplace.config?.marketplace || {},
      fileSlots,
    };
  }, [globalConfig, activeMarketplace]);

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
  // A header bound to the `sku` engine primitive (if the admin created one)
  // — used the same way as Order Id below, to seed the manual-mapper
  // fallback with the marketplace's own real mapping instead of only a
  // name guess.
  const skuHeader = useMemo(
    () => (config.headers || []).find((h) => h.primitive === 'sku') || null,
    [config],
  );
  // The full logic (normalized cross-file enrichment, then exact Order Id
  // + Transaction Id match/de-dupe) lives in mergeUploadsAcrossSlots — the
  // Sheet Debugger's "Merged" preview tab runs that exact same function
  // against whatever files are open there, so the two can never disagree.
  const canonicalRows = useMemo(
    () => mergeUploadsAcrossSlots(uploads, orderIdHeader, transactionIdHeader),
    [uploads, orderIdHeader, transactionIdHeader],
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
  const [viewMode, setViewMode] = useState('all');
  const [historyOpen, setHistoryOpen] = useState(false);

  // My Details column subset + the sidebar's Settings -> Save edit-mode
  // layout (tabs/title-cards/graphs/columns show+order) — one per-user
  // settings row, see lib/profitLoss/useDashboardSettings.js.
  const {
    loggedIn, myColumns, onMyColumnsChange,
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
        const first = wb.byTab[wb.sheetNames[0]] || { headerRow: [] };
        const platform = detectPlatform(first.headerRow, wb.fileName);
        const tab = pickBestTab(platform, wb.byTab, wb.sheetNames);
        const headerRow = wb.byTab[tab]?.headerRow ?? first.headerRow;
        const { ok, missing } = matchSlotHeaders(slotDef, headerRow);
        if (!ok) {
          addToast(`${file.name}: doesn't match "${slotDef.label}" — missing column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`, 'error');
          continue;
        }
        const rawRows = wb.byTab[tab]?.rows ?? [];
        // A best-effort {canonicalField: sheetHeader} mapping so a row still
        // gets placed even when the detected platform's own fixed mapper
        // can't do it (an unrecognized/'manual' marketplace, or a real
        // platform's Orders file when its mapper expects a Payments shape —
        // see mapRowsForPlatform's fallback). Name-guessed as a baseline
        // (lib/data/platforms/manual.js's GUESSES), then the marketplace's
        // own real Order Id / Sku header mappings win where they exist,
        // since those are authoritative, not a guess.
        const mapping = guessMapping(headerRow);
        if (orderIdHeader?.mappedFrom?.sheetHeader) mapping.orderId = orderIdHeader.mappedFrom.sheetHeader;
        if (skuHeader?.mappedFrom?.sheetHeader) mapping.sku = skuHeader.mappedFrom.sheetHeader;
        const rows = mapRowsForPlatform(platform, rawRows, { tag, mapping });
        added.push({ id: crypto.randomUUID(), slotId, fileName: file.name, platform, rows });
      }
      if (added.length) {
        setUploads((prev) => [...prev, ...added]);
        const mapped = added.reduce((s, a) => s + a.rows.length, 0);
        addToast(mapped ? `Loaded ${added.length} file${added.length === 1 ? '' : 's'} · ${mapped} rows` : 'File loaded but no rows matched — check the sheet', mapped ? 'success' : 'error');
      }
    } finally {
      setBusy(false);
    }
  }, [addToast, config, selectedBrand, orderIdHeader, skuHeader, loggedIn]);

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

  // The table's "Company" column header control — the same BrandPicker the
  // toolbar uses, shrunk down. Whatever brand is picked/created here is the
  // same `selectedBrand` the toolbar's own picker drives, so it's what the
  // *next* upload gets tagged with — every row of new data comes in under
  // one company, per how uploads are already tagged (see onUpload below).
  const companyControl = (
    <BrandPicker compact brands={effectiveBrands} value={selectedBrand} onChange={setSelectedBrand} onCreate={addBrand} />
  );

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
    const matchRawRow = showTransactions
      ? (r) => transactionKeyFor(r, orderIdHeader, transactionIdHeader)
      : showOverview && activeOverview?.fixedHeader
      ? (r) => String(readHeaderFromRow(activeOverview.fixedHeader, r) ?? '').trim()
      : (r) => r.sku;
    const removedRows = uploads.flatMap((u) => u.rows.filter((r) => selectedKeys.has(matchRawRow(r))));
    setUploads((prev) => prev
      .map((u) => ({ ...u, rows: u.rows.filter((r) => !selectedKeys.has(matchRawRow(r))) }))
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
  // One tab's export view — the table respects "My Details"/"All Details"
  // (the same viewMode/myColumns toggle the screen itself uses): only the
  // fields currently selected as My Details when that's the active view,
  // every header when it's All Details. Shared by the single-tab
  // Save-to-History payload (buildView, below) and the multi-tab PDF/Excel
  // export (doExport) — "what you're looking at is what gets saved/exported".
  const buildTabView = useCallback((tabDef, isOverview, source) => {
    const ov = isOverview ? (source.overviews?.[tabDef?.id] || null) : null;
    const overview = ov || { name: tabDef?.name, fixedHeader: null, headers: [], rows: [] };
    let defs = isOverview
      ? (overview.fixedHeader ? [overview.fixedHeader, ...overview.headers] : [])
      : (tabDef?.headerIds || []).map((id) => source.headers.find((h) => h.id === id)).filter(Boolean);
    if (!isOverview && viewMode === 'my' && defs.length) {
      defs = [defs[0], ...defs.slice(1).filter((h) => myColumns.includes(h.id))];
    }
    const rows = isOverview ? overview.rows : source.tableRows;
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
  }, [config, viewMode, myColumns]);

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
      const activeTabName = showTransactions ? 'Transactions' : (showOverview ? activeOverviewTab?.name : activeTab?.name) || 'Dashboard';
      await (kind === 'pdf'
        ? downloadMultiTabPdf({ label, activeTabName, tabs })
        : downloadMultiTabXlsx({ label, activeTabName, tabs }));
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

     
        <main className="w-full min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-10">
          <DashboardHeaderBar
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
          {hasData && canonicalRows.length > 0 && !showOverview && !showTransactions && resolved.tableRows.length === 0 && (
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
                <div>
                  <h2 className="text-lg font-bold text-foreground">Transactions</h2>
                  <p className="mt-0.5 text-sm text-muted">
                    One row per Order Id{transactionIdHeader ? ' + Transaction Id' : ''} — every mapped header at its own raw value, not summed across a SKU&rsquo;s whole history.
                  </p>
                </div>
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
                config={config}
                tab={activeOverviewTab}
                resolved={resolved}
                editMode={editMode}
                layout={layout}
                onSetTabSection={setTabSection}
                costBySku={skuCost?.map || {}}
                onCostChange={onCostChange}
                companyControl={companyControl}
                selectedKeys={selectedKeys}
                onToggleRow={onToggleRow}
                onToggleAll={onToggleAll}
                dirtyKeys={dirtySkuKeys}
              />
            ) : (
              <TabView
                config={config}
                tab={activeTab}
                resolved={resolved.tableRows === displayTableRows ? resolved : { ...resolved, tableRows: displayTableRows }}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                myColumns={myColumns}
                onMyColumnsChange={onMyColumnsChange}
                editMode={editMode}
                layout={layout}
                onSetTabSection={setTabSection}
                costBySku={skuCost?.map || {}}
                onCostChange={onCostChange}
                companyControl={companyControl}
                selectedKeys={selectedKeys}
                onToggleRow={onToggleRow}
                onToggleAll={onToggleAll}
                dirtyKeys={dirtySkuKeys}
                totalCount={canonicalRows.length}
              />
            )}
          </div>

          {/* Merged Extracted Common Headers Data Table */}
          {canonicalRows.length > 0 && (
            <MergedCommonHeadersTable canonicalRows={canonicalRows} config={config} uploads={uploads} />
          )}

          {/* Right below the upload toolbar — template builders can inspect
              exactly what any file (including one they haven't mapped yet)
              parses to without leaving the dashboard. Same gate as Template
              Settings; a regular seller never sees it. */}
          {canManageTemplates && (
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
