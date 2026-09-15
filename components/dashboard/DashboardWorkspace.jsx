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
import { rangeForPreset } from '@/lib/profitLoss/dateRanges';
import { resolveTemplate, readHeaderFromRow } from '@/lib/profitLoss/resolveTemplate';
import { downloadTemplateXlsx, downloadTemplatePdf } from '@/lib/profitLoss/exportTemplate';
import { useDashboardSettings } from '@/lib/profitLoss/useDashboardSettings';
import { applyLayout, emptySection } from '@/lib/profitLoss/layoutSections';
import { RESERVED_HEADER_IDS } from '@/data/templateSchema';
import { useToast } from '@/components/admin/Toast';

import DashboardSidebar from './DashboardSidebar';
import DashboardToolbar from './DashboardToolbar';
import DashboardHeaderBar from './DashboardHeaderBar';
import BrandPicker from './BrandPicker';
import TabView from './TabView';
import OverviewTab from './OverviewTab';
import HistoryDrawer from './HistoryDrawer';
import NoMarketplaces from './NoMarketplaces';
import NoTemplateSidebar from './NoTemplateSidebar';
import SheetDebugger from '@/components/templateSettings/SheetDebugger';

const DEFAULT_RANGE = { preset: '7d', ...rangeForPreset('7d') };
const DEFAULT_ADS = { mode: 'percent', value: 0 };
const DEFAULT_ROW_LIMIT = 100;
const emptyResolved = { headers: [], tableRows: [], titleCardValues: {}, graphSeries: {}, overviews: {}, aggregate: {}, companyOptions: [], rowCount: 0, platforms: [] };

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
  const config = useMemo(() => {
    if (!globalConfig || !activeMarketplace) return {};
    const fileSlots = activeMarketplace.config?.fileSlots || [];
    const mappedFromByHeaderId = new Map();
    for (const slot of fileSlots) {
      for (const m of slot.mappings || []) {
        mappedFromByHeaderId.set(m.headerId, { slot: slot.id, sheetHeader: m.sheetHeader });
      }
    }
    const headers = (globalConfig.headers || []).map((h) => ({
      ...h,
      mappedFrom: mappedFromByHeaderId.get(h.id) || null,
    }));
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
  // (null for a SKU Cost upload, which isn't a marketplace file slot) lets
  // the debugger check the file's headers against that exact slot's saved
  // sample + mapping, the same check a real upload runs.
  const [debugFile, setDebugFile] = useState(null);
  const [debugSlotId, setDebugSlotId] = useState(null);
  const debugSlot = useMemo(
    () => (config.fileSlots || []).find((s) => s.id === debugSlotId) || null,
    [config, debugSlotId],
  );

  // Upload dedup: keyed off the two reserved global headers (Order Id +
  // Transaction Id), not the platform mapper's own canonical `orderId` —
  // re-uploading an overlapping settlement export shouldn't double-count a
  // row. An Order Id can legitimately repeat across several line items of
  // one order, so it alone never proves a duplicate; only an identical
  // Order Id + Transaction Id pair (both mapped and both present) does —
  // anything short of that (Transaction Id missing/unmapped) is always kept.
  const orderIdHeader = useMemo(
    () => (config.headers || []).find((h) => h.id === RESERVED_HEADER_IDS.orderId) || null,
    [config],
  );
  const transactionIdHeader = useMemo(
    () => (config.headers || []).find((h) => h.id === RESERVED_HEADER_IDS.transactionId) || null,
    [config],
  );
  const canonicalRows = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const u of uploads) {
      for (const r of u.rows) {
        const orderVal = orderIdHeader ? readHeaderFromRow(orderIdHeader, r) : null;
        const txnVal = transactionIdHeader ? readHeaderFromRow(transactionIdHeader, r) : null;
        const orderKey = orderVal != null && String(orderVal).trim() !== '' ? String(orderVal).trim() : null;
        const txnKey = txnVal != null && String(txnVal).trim() !== '' ? String(txnVal).trim() : null;
        if (orderKey && txnKey) {
          const dupKey = `${orderKey}::${txnKey}`;
          if (seen.has(dupKey)) continue;
          seen.add(dupKey);
        }
        out.push(r);
      }
    }
    return out;
  }, [uploads, orderIdHeader, transactionIdHeader]);

  // ── filters (pending vs applied) ────────────────────────────────────────
  // rowLimit + dateRange are both "getting data" limits, not scoping filters
  // like company/platform — Download PDF/Excel bypasses both of them (see
  // fullResolved below) but still respects company/platform.
  const [pending, setPending] = useState({ dateRange: DEFAULT_RANGE, rowLimit: DEFAULT_ROW_LIMIT, company: 'all', platform: 'all', ads: DEFAULT_ADS });
  const [applied, setApplied] = useState({ dateRange: DEFAULT_RANGE, rowLimit: DEFAULT_ROW_LIMIT, company: 'all', platform: 'all', ads: DEFAULT_ADS });
  const dirty = JSON.stringify(pending) !== JSON.stringify(applied);

  // No "Apply" button — every change above debounces into effect on its own
  // after a short pause, so picking a date/company or typing a row-limit/ads
  // value doesn't recompute the whole dashboard on every keystroke.
  // resetFilters (below) sets `applied` directly for an instant reset,
  // bypassing this.
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
    onSkuCostsChange,
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
    if (visibleTabs.some((t) => t.id === preferredTabId)) return preferredTabId;
    if (visibleOverviewTabs.some((o) => o.id === preferredTabId)) return preferredTabId;
    return visibleTabs[0]?.id ?? visibleOverviewTabs[0]?.id ?? null;
  }, [preferredTabId, visibleTabs, visibleOverviewTabs]);

  // The "smart limit" — only the N most-recently-ordered rows (default 100,
  // set via the header bar's RowLimitControl) feed the live dashboard, so a
  // huge sheet doesn't recompute every KPI/graph/table off thousands of rows
  // on every Apply. Undated rows sort last (never silently dropped, just
  // deprioritized). Download PDF/Excel bypasses this entirely — see
  // `fullResolved` below.
  const limitedRows = useMemo(() => {
    const limit = applied.rowLimit || DEFAULT_ROW_LIMIT;
    if (canonicalRows.length <= limit) return canonicalRows;
    return [...canonicalRows]
      .sort((a, b) => (b.orderDate || '').localeCompare(a.orderDate || ''))
      .slice(0, limit);
  }, [canonicalRows, applied.rowLimit]);

  // ── resolve ─────────────────────────────────────────────────────────────
  // Always resolved from the config — even with zero rows uploaded — so the
  // sidebar's tabs, title cards, graphs and table headers are visible (in
  // their zero/empty state) the moment a marketplace template is selected,
  // not only after the first file lands.
  const resolved = useMemo(() => {
    if (!config.headers?.length) return emptyResolved;
    try {
      return resolveTemplate(config, {
        canonicalRows: limitedRows,
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
  }, [config, limitedRows, skuCost, applied]);

  // The complete, unlimited dataset — every uploaded row, no date bound —
  // resolved once so Download PDF/Excel can pull "all data" regardless of
  // the live view's row-limit/date-range. Still respects an intentional
  // Company/Platform scope, since those are a deliberate choice, not a
  // performance limit. Only computed lazily inside doExport (not on every
  // keystroke) would be nicer, but the dashboard's own uploads are already
  // capped to what a browser can hold in memory, so resolving it here is
  // cheap enough to just keep current.
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

  const hasData = uploads.length > 0;

  // "All Companies" always lists every saved brand as "MarketPlace_Brand" for
  // the active marketplace — not just the ones with uploaded rows yet — plus
  // any company tag already present in the data (belt-and-braces in case a
  // row was tagged with a brand no longer in the saved list).
  const companyOptions = useMemo(() => {
    const marketplaceName = config.marketplace?.name || 'Marketplace';
    const fromBrands = brands.map((b) => `${marketplaceName}_${b}`);
    return [...new Set([...fromBrands, ...(resolved.companyOptions || [])])].sort();
  }, [brands, config, resolved.companyOptions]);

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
      const tag = { brand: selectedBrand, company: `${config.marketplace?.name || 'Marketplace'}_${selectedBrand}` };
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
        const rows = mapRowsForPlatform(platform, rawRows, { tag });
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
  }, [addToast, config, selectedBrand]);

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
  }, [skuCost, onSkuCostsChange]);

  // The table's "Company" column header control — the same BrandPicker the
  // toolbar uses, shrunk down. Whatever brand is picked/created here is the
  // same `selectedBrand` the toolbar's own picker drives, so it's what the
  // *next* upload gets tagged with — every row of new data comes in under
  // one company, per how uploads are already tagged (see onUpload below).
  const companyControl = (
    <BrandPicker compact brands={brands} value={selectedBrand} onChange={setSelectedBrand} onCreate={addBrand} />
  );

  const resetFilters = () => {
    const fresh = { dateRange: DEFAULT_RANGE, rowLimit: DEFAULT_ROW_LIMIT, company: 'all', platform: 'all', ads: DEFAULT_ADS };
    setPending(fresh);
    setApplied(fresh);
  };

  const openTemplateSettings = () => { window.location.href = '/profit-loss/template-settings'; };

  const activeOverview = resolved.overviews?.[activeTabId] || null;
  const showOverview = !!activeOverview;
  const activeTab = visibleTabs.find((t) => t.id === activeTabId) || null;
  const activeOverviewTab = (config.overviewTabs || []).find((o) => o.id === activeTabId) || null;

  // ── build the "current tab" view for export + save ──────────────────────
  // Takes which resolved snapshot to read from — `resolved` (the live,
  // row-limited/date-filtered view) by default, or `fullResolved` (every
  // uploaded row, no date bound) when Download PDF/Excel calls it.
  const buildView = useCallback((source = resolved) => {
    const ov = source.overviews?.[activeTabId] || null;
    const isOverview = !!ov;
    const overview = ov || { name: 'Overview', fixedHeader: null, headers: [], rows: [] };
    const defs = isOverview
      ? (overview.fixedHeader ? [overview.fixedHeader, ...overview.headers] : [])
      : (activeTab?.headerIds || []).map((id) => source.headers.find((h) => h.id === id)).filter(Boolean);
    const rows = isOverview ? overview.rows : source.tableRows;
    const cardIds = isOverview ? (activeOverviewTab?.titleCardIds || []) : (activeTab?.titleCardIds || []);
    const cards = cardIds.map((id) => {
      const c = (config.titleCards || []).find((x) => x.id === id);
      const v = source.titleCardValues[id] || {};
      return { name: c?.name || id, mainDisplay: v.main?.display, subDisplay: v.sub?.display };
    });
    return {
      label: config.marketplace?.name || 'Dashboard',
      tabName: isOverview ? (overview.name || 'Overview') : (activeTab?.name || ''),
      cards,
      table: {
        columns: defs.map((d) => d.name),
        rows: rows.map((r) => defs.map((d) => r.cells[d.id]?.display ?? '')),
      },
    };
  }, [activeTabId, activeTab, activeOverviewTab, config, resolved]);

  // Excel/PDF always pull "all data" — every uploaded row, no date bound —
  // regardless of the live view's row-limit/date-filter (see fullResolved).
  const doExport = async (kind) => {
    const view = buildView(fullResolved);
    if (!view.table.columns.length) { addToast('Nothing to export on this tab', 'error'); return; }
    try {
      await (kind === 'pdf' ? downloadTemplatePdf(view) : downloadTemplateXlsx(view));
    } catch {
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
      summary: Object.fromEntries((activeTab?.titleCardIds || []).map((id) => {
        const c = (config.titleCards || []).find((x) => x.id === id);
        return [c?.name || id, resolved.titleCardValues[id]?.main?.raw ?? null];
      })),
      skuRows: resolved.tableRows.map((r) => {
        const o = {};
        for (const h of resolved.headers) { if (r.cells[h.id]) o[h.name] = r.cells[h.id].raw; }
        return o;
      }),
      sourceFiles: uploads.map((u) => ({ kind: u.slotId, platform: u.platform, name: u.fileName, sizeBytes: 0, rowCount: u.rows.length, contentBase64: null })),
    };
  }, [buildView, applied, resolved, canonicalRows, activeTab, config, uploads]);

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
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <DashboardToolbar
          templates={templates}
          activeTemplateId={activeTemplateId}
          onSelectTemplate={setActiveTemplateId}
          brands={brands}
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

        {/* Right below the upload toolbar — template builders can inspect
            exactly what any file (including one they haven't mapped yet)
            parses to without leaving the dashboard. Same gate as Template
            Settings; a regular seller never sees it. */}
        {canManageTemplates && (
          <div className="max-h-[60vh] shrink-0 overflow-y-auto border-b border-divider bg-surface">
            <SheetDebugger externalFile={debugFile} showPicker={false} slot={debugSlot} headers={config.headers || []} />
          </div>
        )}

        <main className="w-full min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-10">
          <DashboardHeaderBar
            onReset={resetFilters}
            showSetting={canManageTemplates}
            onOpenSetting={openTemplateSettings}
            rowLimit={pending.rowLimit}
            onRowLimitChange={(n) => setPending((s) => ({ ...s, rowLimit: n }))}
            companyOptions={companyOptions}
            company={pending.company}
            onCompanyChange={(company) => setPending((s) => ({ ...s, company }))}
            dateRange={pending.dateRange}
            onDateChange={(dr) => setPending((s) => ({ ...s, dateRange: dr }))}
            ads={pending.ads}
            onAdsChange={(ads) => setPending((s) => ({ ...s, ads }))}
            updating={dirty}
            hasData={hasData}
            onExportExcel={() => doExport('xlsx')}
            onExportPdf={() => doExport('pdf')}
            onOpenHistory={() => setHistoryOpen(true)}
            saveProps={{ buildPayload: buildSavePayload, rowCount: canonicalRows.length, disabled: busy }}
          />

          <div className="mt-6 space-y-5">
            {/* Even with nothing uploaded yet, the active tab's title cards /
                graphs / table headers render from the template config in
                their zero/empty state — only the rows are empty. */}
            {showOverview ? (
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
              />
            ) : (
              <TabView
                config={config}
                tab={activeTab}
                resolved={resolved}
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
              />
            )}
          </div>
        </main>
      </div>

      <HistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} onOpenRun={() => {}} />
    </div>
  );
}
