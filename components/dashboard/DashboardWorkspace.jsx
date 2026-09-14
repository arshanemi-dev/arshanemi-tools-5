'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { listLiveTemplates } from '@/lib/profitLoss/templatesApi';
import { readAnyFile } from '@/lib/sheet/readAnyFile';
import { parseSkuCostSheet } from '@/lib/sheet/parseWorkbook';
import { downloadSkuCostTemplate } from '@/lib/sheet/skuCostTemplate';
import { matchSlotHeaders } from '@/lib/sheet/matchSlotHeaders';
import { detectPlatform } from '@/data/platforms/detect';
import { mapRowsForPlatform, pickBestTab } from '@/data/platforms/index';
import { rangeForPreset } from '@/lib/profitLoss/dateRanges';
import { resolveTemplate } from '@/lib/profitLoss/resolveTemplate';
import { downloadTemplateXlsx, downloadTemplatePdf } from '@/lib/profitLoss/exportTemplate';
import { useDashboardSettings } from '@/lib/profitLoss/useDashboardSettings';
import { applyLayout, emptySection } from '@/lib/profitLoss/layoutSections';
import { useToast } from '@/components/admin/Toast';

import DashboardSidebar from './DashboardSidebar';
import DashboardToolbar from './DashboardToolbar';
import DashboardHeaderBar from './DashboardHeaderBar';
import TabView from './TabView';
import OverviewTab from './OverviewTab';
import HistoryDrawer from './HistoryDrawer';
import NoMarketplaces from './NoMarketplaces';
import NoTemplateSidebar from './NoTemplateSidebar';

const DEFAULT_RANGE = { preset: '6m', ...rangeForPreset('6m') };
const DEFAULT_ADS = { mode: 'percent', value: 0 };
const emptyResolved = { headers: [], tableRows: [], titleCardValues: {}, graphSeries: {}, overviews: {}, aggregate: {}, companyOptions: [], rowCount: 0, platforms: [] };

export default function DashboardWorkspace({ canManageTemplates = false, onMenuClick, mobileNavOpen = false, onCloseMobileNav = () => {} }) {
  const { addToast } = useToast();

  // ── templates ───────────────────────────────────────────────────────────
  // Starts empty and stays empty unless a real marketplace template is
  // published — no built-in fallback config, so a fresh install with nothing
  // configured shows "No marketplaces" instead of a fake dashboard.
  const [templates, setTemplates] = useState([]);
  const [templatesReady, setTemplatesReady] = useState(false);
  const [activeTemplateId, setActiveTemplateId] = useState(null);

  useEffect(() => {
    listLiveTemplates()
      .then(({ ok, data }) => {
        const live = ok && Array.isArray(data?.templates) ? data.templates : [];
        if (live.length) {
          setTemplates(live);
          setActiveTemplateId(live[0].id);
        }
      })
      .finally(() => setTemplatesReady(true));
  }, []);

  const config = useMemo(
    () => (templates.find((t) => t.id === activeTemplateId) || templates[0])?.config ?? {},
    [templates, activeTemplateId],
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

  const canonicalRows = useMemo(() => {
    const byId = new Map();
    for (const u of uploads) for (const r of u.rows) byId.set(r.rowId, r);
    return [...byId.values()];
  }, [uploads]);

  // ── filters (pending vs applied) ────────────────────────────────────────
  const [pending, setPending] = useState({ dateRange: DEFAULT_RANGE, company: 'all', platform: 'all', ads: DEFAULT_ADS });
  const [applied, setApplied] = useState({ dateRange: DEFAULT_RANGE, company: 'all', platform: 'all', ads: DEFAULT_ADS });
  const dirty = JSON.stringify(pending) !== JSON.stringify(applied);

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
    editMode, setEditMode, saveLayout, savingLayout,
  } = useDashboardSettings({
    ads: pending.ads,
    dateRange: pending.dateRange,
    addToast,
    onLoadedPreferences: (p) => {
      if (p.adsMode) setPending((s) => ({ ...s, ads: { mode: p.adsMode, value: p.adsValue ?? 0 } }));
      if (p.defaultDatePreset) setPending((s) => ({ ...s, dateRange: { preset: p.defaultDatePreset, ...rangeForPreset(p.defaultDatePreset) } }));
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

  // ── resolve ─────────────────────────────────────────────────────────────
  // Always resolved from the config — even with zero rows uploaded — so the
  // sidebar's tabs, title cards, graphs and table headers are visible (in
  // their zero/empty state) the moment a marketplace template is selected,
  // not only after the first file lands.
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
      const tag = { brand: selectedBrand, company: `${config.marketplace?.name || 'Marketplace'}_${selectedBrand}` };
      const added = [];
      for (const file of files) {
        let wb;
        try {
          wb = await readAnyFile(file);
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

  // ── build the "current tab" view for export + save ──────────────────────
  const buildView = useCallback(() => {
    const overview = activeOverview || { name: 'Overview', fixedHeader: null, headers: [], rows: [] };
    const defs = showOverview
      ? (overview.fixedHeader ? [overview.fixedHeader, ...overview.headers] : [])
      : (activeTab?.headerIds || []).map((id) => resolved.headers.find((h) => h.id === id)).filter(Boolean);
    const rows = showOverview ? overview.rows : resolved.tableRows;
    const cardIds = showOverview ? (activeOverviewTab?.titleCardIds || []) : (activeTab?.titleCardIds || []);
    const cards = cardIds.map((id) => {
      const c = (config.titleCards || []).find((x) => x.id === id);
      const v = resolved.titleCardValues[id] || {};
      return { name: c?.name || id, mainDisplay: v.main?.display, subDisplay: v.sub?.display };
    });
    return {
      label: config.marketplace?.name || 'Dashboard',
      tabName: showOverview ? (overview.name || 'Overview') : (activeTab?.name || ''),
      cards,
      table: {
        columns: defs.map((d) => d.name),
        rows: rows.map((r) => defs.map((d) => r.cells[d.id]?.display ?? '')),
      },
    };
  }, [showOverview, activeOverview, activeOverviewTab, config, activeTab, resolved]);

  const doExport = async (kind) => {
    const view = buildView();
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
        <NoTemplateSidebar />
        <NoMarketplaces />
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
            onApply={() => setApplied({ ...pending })}
            dirty={dirty}
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
              />
            )}
          </div>
        </main>
      </div>

      <HistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} onOpenRun={() => {}} />
    </div>
  );
}
