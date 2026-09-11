'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { isLoggedIn } from '@/lib/tokenStore';
import { getSettings, putSettings } from '@/lib/profitLoss/apiClient';
import { listLiveTemplates } from '@/lib/profitLoss/templatesApi';
import { readAnyFile } from '@/lib/sheet/readAnyFile';
import { parseSkuCostSheet } from '@/lib/sheet/parseWorkbook';
import { downloadSkuCostTemplate } from '@/lib/sheet/skuCostTemplate';
import { detectPlatform } from '@/data/platforms/detect';
import { mapRowsForPlatform, pickBestTab } from '@/data/platforms/index';
import { rangeForPreset } from '@/lib/profitLoss/dateRanges';
import { resolveTemplate } from '@/lib/profitLoss/resolveTemplate';
import { downloadTemplateXlsx, downloadTemplatePdf } from '@/lib/profitLoss/exportTemplate';
import { DEFAULT_TEMPLATE } from '@/data/defaultTemplate';
import { useToast } from '@/components/admin/Toast';

import DashboardSidebar from './DashboardSidebar';
import DashboardToolbar from './DashboardToolbar';
import DashboardHeaderBar from './DashboardHeaderBar';
import TabView from './TabView';
import OverviewTab from './OverviewTab';
import SheetDropCard from './SheetDropCard';
import HistoryDrawer from './HistoryDrawer';

const DEFAULT_RANGE = { preset: '6m', ...rangeForPreset('6m') };
const DEFAULT_ADS = { mode: 'percent', value: 0 };
const emptyResolved = { headers: [], tableRows: [], titleCardValues: {}, graphSeries: {}, overviews: {}, aggregate: {}, companyOptions: [], brandOptions: [], rowCount: 0, platforms: [] };

export default function DashboardWorkspace({ canManageTemplates = false, onMenuClick, mobileNavOpen = false, onCloseMobileNav = () => {} }) {
  const { addToast } = useToast();

  // ── templates ───────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState([DEFAULT_TEMPLATE]);
  const [activeTemplateId, setActiveTemplateId] = useState(DEFAULT_TEMPLATE.id);

  useEffect(() => {
    listLiveTemplates().then(({ ok, data }) => {
      if (!ok || !Array.isArray(data?.templates) || !data.templates.length) return;
      setTemplates([DEFAULT_TEMPLATE, ...data.templates]);
    });
  }, []);

  const config = useMemo(
    () => (templates.find((t) => t.id === activeTemplateId) || DEFAULT_TEMPLATE).config,
    [templates, activeTemplateId],
  );

  // Every tab that exists shows (no separate visibility toggle).
  const visibleTabs = useMemo(
    () => [...(config.tabs || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [config],
  );

  // Overview tabs each have their own globally-unique id, so they slot into
  // the same activeTabId as a regular Tab — no magic '__overview__' string.
  // Every one that exists shows (no separate visibility toggle).
  const visibleOverviewTabs = useMemo(
    () => [...(config.overviewTabs || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [config],
  );

  // The tab the user last picked; the *actual* active tab is derived from it so
  // switching templates can't leave a dangling id (no setState-in-effect).
  const [preferredTabId, setPreferredTabId] = useState(null);
  const activeTabId = useMemo(() => {
    if (visibleTabs.some((t) => t.id === preferredTabId)) return preferredTabId;
    if (visibleOverviewTabs.some((o) => o.id === preferredTabId)) return preferredTabId;
    return visibleTabs[0]?.id ?? visibleOverviewTabs[0]?.id ?? null;
  }, [preferredTabId, visibleTabs, visibleOverviewTabs]);

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
  const [pending, setPending] = useState({ dateRange: DEFAULT_RANGE, company: 'all', brand: 'all', platform: 'all', ads: DEFAULT_ADS });
  const [applied, setApplied] = useState({ dateRange: DEFAULT_RANGE, company: 'all', brand: 'all', platform: 'all', ads: DEFAULT_ADS });
  const dirty = JSON.stringify(pending) !== JSON.stringify(applied);

  // ── view ────────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState('all');
  const [myColumns, setMyColumns] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) return;
    getSettings().then(({ ok, data }) => {
      if (!ok) return;
      if (Array.isArray(data.headers)) setMyColumns(data.headers);
      const p = data.preferences || {};
      if (p.adsMode) setPending((s) => ({ ...s, ads: { mode: p.adsMode, value: p.adsValue ?? 0 } }));
      if (p.defaultDatePreset) setPending((s) => ({ ...s, dateRange: { preset: p.defaultDatePreset, ...rangeForPreset(p.defaultDatePreset) } }));
    });
  }, []);

  const putTimer = useRef(null);
  const onMyColumnsChange = (next) => {
    setMyColumns(next);
    if (!isLoggedIn()) return;
    clearTimeout(putTimer.current);
    putTimer.current = setTimeout(() => {
      putSettings({
        headers: next,
        preferences: { adsMode: pending.ads.mode, adsValue: pending.ads.value, defaultDatePreset: pending.dateRange.preset },
      });
    }, 800);
  };

  // ── resolve ─────────────────────────────────────────────────────────────
  const resolved = useMemo(() => {
    if (!canonicalRows.length) return emptyResolved;
    try {
      return resolveTemplate(config, {
        canonicalRows,
        skuCostMap: skuCost?.map || {},
        ads: applied.ads,
        dateFrom: applied.dateRange.from,
        dateTo: applied.dateRange.to,
        platform: applied.platform,
        company: applied.company,
        brand: applied.brand,
      });
    } catch (err) {
      console.error('resolveTemplate failed:', err);
      return emptyResolved;
    }
  }, [config, canonicalRows, skuCost, applied]);

  const hasData = uploads.length > 0;

  // ── ingest ──────────────────────────────────────────────────────────────
  const onUpload = useCallback(async (slotId, files) => {
    setBusy(true);
    try {
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
        const rawRows = wb.byTab[tab]?.rows ?? [];
        const rows = mapRowsForPlatform(platform, rawRows, {});
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
  }, [addToast]);

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
    const fresh = { dateRange: DEFAULT_RANGE, company: 'all', brand: 'all', platform: 'all', ads: DEFAULT_ADS };
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

  return (
    <div className="flex min-h-0 flex-1">
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
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <DashboardToolbar
          templates={templates}
          activeTemplateId={activeTemplateId}
          onSelectTemplate={setActiveTemplateId}
          brandOptions={resolved.brandOptions}
          brand={pending.brand}
          onBrandChange={(brand) => setPending((s) => ({ ...s, brand }))}
          fileSlots={config.fileSlots || []}
          onUpload={onUpload}
          onUploadSkuCost={onUploadSkuCost}
          onDownloadSkuTemplate={onDownloadSkuTemplate}
          busy={busy}
        />

        <main className="w-full min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-10">
          <DashboardHeaderBar
            onReset={resetFilters}
            showSetting={canManageTemplates}
            onOpenSetting={openTemplateSettings}
            companyOptions={resolved.companyOptions}
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

          <div className="mt-6">
            {busy && !hasData ? (
              <div className="flex justify-center py-16 text-muted"><Loader2 className="animate-spin" size={28} /></div>
            ) : !hasData ? (
              <SheetDropCard />
            ) : showOverview ? (
              <OverviewTab config={config} tab={activeOverviewTab} resolved={resolved} />
            ) : (
              <TabView
                config={config}
                tab={activeTab}
                resolved={resolved}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                myColumns={myColumns}
                onMyColumnsChange={onMyColumnsChange}
              />
            )}
          </div>
        </main>
      </div>

      <HistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} onOpenRun={() => {}} />
    </div>
  );
}
