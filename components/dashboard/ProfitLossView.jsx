'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Clock, Loader2, X } from 'lucide-react';
import { isLoggedIn } from '@/lib/tokenStore';
import { getSettings, putSettings } from '@/lib/profitLoss/apiClient';
import { parseSkuCostSheet } from '@/lib/sheet/parseWorkbook';
import { readAnyFile } from '@/lib/sheet/readAnyFile';
import { downloadSkuCostTemplate } from '@/lib/sheet/skuCostTemplate';
import { downloadDashboardXlsx, downloadDashboardPdf } from '@/lib/profitLoss/exportDashboard';
import { detectPlatform } from '@/data/platforms/detect';
import { mapRowsForPlatform, pickBestTab } from '@/data/platforms/index';
import { guessMapping } from '@/data/platforms/manual';
import { computeProfitLoss } from '@/lib/profitLoss/engine';
import { rangeForPreset } from '@/lib/profitLoss/dateRanges';
import { SKU_COLUMNS, DEFAULT_MY_COLUMNS, emptySummary } from '@/data/platforms/canonical';
import { observeWorkbook } from '@/store/sheetSettingsSlice';
import { useToast } from '@/components/admin/Toast';

import DashboardToolbar from './DashboardToolbar';
import DashboardHeaderBar from './DashboardHeaderBar';
import KpiCardRow from './KpiCardRow';
import DetailsViewPills from './DetailsViewPills';
import DetailsTable from './DetailsTable';
import RawRowsTable from './RawRowsTable';
import SheetDropCard from './SheetDropCard';
import HistoryDrawer from './HistoryDrawer';
import SheetSettingsPanel from './SheetSettingsPanel';
import PlatformBadge from './PlatformBadge';

const DEFAULT_RANGE = { preset: '6m', ...rangeForPreset('6m') };
const DEFAULT_ADS = { mode: 'percent', value: 0 };
const MAX_INLINE_BYTES = 1_500_000;
const META_LABELS = { __platform: 'Platform', __file: 'File', __sheet: 'Sheet' };

export default function ProfitLossView() {
  const { addToast } = useToast();
  const dispatch = useDispatch();
  const byPlatform = useSelector((s) => s.sheetSettings.byPlatform);

  // ── uploads (raw) ────────────────────────────────────────────────────────
  // { id, kind, fileName, sizeBytes, platform, sheetNames, byTab, allHeaders, contentBase64 }
  const [uploads, setUploads] = useState([]);
  const [skuCost, setSkuCost] = useState(null); // { map, count, fileName }
  const [marketplace, setMarketplace] = useState('');
  const [detectedId, setDetectedId] = useState(null);
  const [busy, setBusy] = useState(false);

  // ── filters (pending vs applied) ─────────────────────────────────────────
  const [pending, setPending] = useState({ dateRange: DEFAULT_RANGE, platform: 'all', ads: DEFAULT_ADS });
  const [applied, setApplied] = useState({ dateRange: DEFAULT_RANGE, platform: 'all', ads: DEFAULT_ADS });
  const dirty = JSON.stringify(pending) !== JSON.stringify(applied);

  // ── view ────────────────────────────────────────────────────────────────
  const [tableView, setTableView] = useState('summary'); // 'summary' | 'raw'
  const [viewMode, setViewMode] = useState('all');
  const [myColumns, setMyColumns] = useState(DEFAULT_MY_COLUMNS);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsFocus, setSettingsFocus] = useState(null);
  const [openedRun, setOpenedRun] = useState(null);

  // ── saved-settings hydrate (signed-in) ─────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn()) return;
    getSettings().then(({ ok, data }) => {
      if (!ok) return;
      if (Array.isArray(data.headers) && data.headers.length) setMyColumns(data.headers);
      const p = data.preferences || {};
      if (p.adsMode) setPending((s) => ({ ...s, ads: { mode: p.adsMode, value: p.adsValue ?? 0 } }));
      if (p.defaultDatePreset) {
        setPending((s) => ({ ...s, dateRange: { preset: p.defaultDatePreset, ...rangeForPreset(p.defaultDatePreset) } }));
      }
      if (p.defaultPlatform) setMarketplace(p.defaultPlatform);
    });
  }, []);

  // ── canonical rows: re-mapped whenever an upload OR the sheet settings
  //    (selected tabs / column mapping) change ──────────────────────────────
  const canonicalRows = useMemo(() => {
    const byId = new Map();
    for (const u of uploads) {
      const cfg = byPlatform[u.platform] || {};
      const selected = (cfg.tabs || []).filter((t) => u.byTab[t]);
      const tabs = selected.length ? selected : [pickBestTab(u.platform, u.byTab, u.sheetNames)];
      const rawRows = tabs.flatMap((t) => u.byTab[t]?.rows ?? []);
      const mapping = u.platform === 'manual' ? guessMapping(u.allHeaders) : undefined;
      const canon = mapRowsForPlatform(u.platform, rawRows, { headerMap: cfg.headerMap || {}, mapping });
      for (const r of canon) byId.set(r.rowId, r);
    }
    return [...byId.values()];
  }, [uploads, byPlatform]);

  const availablePlatforms = useMemo(
    () => [...new Set(canonicalRows.map((r) => r.platform))],
    [canonicalRows],
  );

  // Raw view — EVERY row of EVERY tab of EVERY uploaded file, EVERY original
  // header, nothing aggregated or dropped. Meta columns keep it traceable
  // across a combined multi-file / multi-tab load.
  const rawTable = useMemo(() => {
    const order = ['__platform', '__file', '__sheet'];
    const seen = new Set(order);
    const meta = {};
    const rows = [];
    for (const u of uploads) {
      for (const tab of u.sheetNames) {
        const t = u.byTab[tab];
        if (!t) continue;
        for (const h of t.headerRow) {
          if (!h) continue;
          if (!seen.has(h)) { seen.add(h); order.push(h); }
          if (!meta[h] && t.headerMeta?.[h]) meta[h] = t.headerMeta[h]; // group / info from the sheet
        }
        for (const r of t.rows) {
          rows.push({ __platform: u.platform, __file: u.fileName, __sheet: tab, ...r });
        }
      }
    }
    return { headers: order, rows, meta };
  }, [uploads]);

  const computed = useMemo(() => {
    if (openedRun) {
      return {
        summary: openedRun.summary || emptySummary(),
        skuRows: openedRun.skuRows || [],
        rowCount: openedRun.rowCount || 0,
        platforms: openedRun.platforms || [],
      };
    }
    if (canonicalRows.length === 0) {
      return { summary: emptySummary(), skuRows: [], rowCount: 0, platforms: [] };
    }
    return computeProfitLoss(canonicalRows, {
      skuCostMap: skuCost?.map || {},
      ads: applied.ads,
      dateFrom: applied.dateRange.from,
      dateTo: applied.dateRange.to,
      platform: applied.platform,
    });
  }, [openedRun, canonicalRows, skuCost, applied]);

  const hasData = !!openedRun || uploads.length > 0 || canonicalRows.length > 0;
  const columnKeys = viewMode === 'my' ? myColumns : SKU_COLUMNS.filter((c) => !c.sticky).map((c) => c.key);

  // ── ingest ────────────────────────────────────────────────────────────
  const ingest = useCallback(
    async (files, kind) => {
      setBusy(true);
      try {
        const added = [];
        let needsMapping = false;
        for (const file of files) {
          let wb;
          try {
            wb = await readAnyFile(file);
          } catch (err) {
            addToast(`${file.name}: ${err?.message || 'could not be read'}`, 'error');
            continue;
          }
          if (!wb.sheetNames.length) {
            addToast(`No readable table found in ${file.name}`, 'error');
            continue;
          }

          const first = wb.byTab[wb.sheetNames[0]] || { headerRow: [] };
          let platformId = detectPlatform(first.headerRow, wb.fileName);
          if (platformId === 'manual' && marketplace) platformId = marketplace;

          dispatch(observeWorkbook({ platformId, tabs: wb.sheetNames, headers: wb.allHeaders }));

          const cfg = byPlatform[platformId] || {};
          const selected = (cfg.tabs || []).filter((t) => wb.byTab[t]);
          const tabs = selected.length ? selected : [pickBestTab(platformId, wb.byTab, wb.sheetNames)];
          const rawRows = tabs.flatMap((t) => wb.byTab[t]?.rows ?? []);
          const mapping = platformId === 'manual' ? guessMapping(wb.allHeaders) : undefined;
          const probe = mapRowsForPlatform(platformId, rawRows, { headerMap: cfg.headerMap || {}, mapping });

          const buf = await file.arrayBuffer();
          added.push({
            id: crypto.randomUUID(),
            kind,
            fileName: file.name,
            sizeBytes: file.size,
            platform: platformId,
            sheetNames: wb.sheetNames,
            byTab: wb.byTab,
            allHeaders: wb.allHeaders,
            mapped: probe.length,
            contentBase64: buf.byteLength <= MAX_INLINE_BYTES ? toBase64(buf) : null,
          });
          setDetectedId(platformId);

          // The file is readable but its columns don't line up with this
          // marketplace's P&L layout yet — keep the data (raw view + Sheet
          // Settings dropdowns) and nudge the user to map it.
          if (probe.length === 0) {
            needsMapping = true;
            setSettingsFocus(platformId);
          } else if (wb.sheetNames.length > 1 && !(cfg.tabs && cfg.tabs.length)) {
            setSettingsFocus(platformId);
            setSettingsOpen(true);
          }
        }
        if (added.length) {
          setUploads((prev) => [...prev, ...added]);
          setOpenedRun(null);
          const rows = added.reduce((s, a) => s + a.mapped, 0);
          if (rows === 0) {
            addToast('File loaded — columns don’t match yet. Map them in Sheet Settings.', 'error');
            setTableView('raw');
            setSettingsOpen(true);
          } else {
            addToast(`Loaded ${added.length} file${added.length === 1 ? '' : 's'}`);
            if (needsMapping) setSettingsOpen(true);
          }
        }
      } catch {
        addToast('That file could not be parsed — is it a valid CSV / Excel / PDF export?', 'error');
      } finally {
        setBusy(false);
      }
    },
    [marketplace, byPlatform, dispatch, addToast],
  );

  const onUploadSkuCost = useCallback(
    async (file) => {
      if (!file) return;
      setBusy(true);
      try {
        const { map, count } = await parseSkuCostSheet(file);
        if (count === 0) {
          addToast('No SKU/Cost columns found in that sheet', 'error');
          return;
        }
        setSkuCost({ map, count, fileName: file.name });
        setOpenedRun(null);
        addToast(`Loaded costs for ${count} SKUs`);
      } finally {
        setBusy(false);
      }
    },
    [addToast],
  );

  const onDownloadSkuTemplate = useCallback(() => {
    downloadSkuCostTemplate(canonicalRows.map((r) => r.sku));
  }, [canonicalRows]);

  // ── My Details persistence (signed-in only) ──────────────────────────
  const putTimer = useRef(null);
  const onMyColumnsChange = (next) => {
    setMyColumns(next);
    if (!isLoggedIn()) return;
    clearTimeout(putTimer.current);
    putTimer.current = setTimeout(() => {
      putSettings({
        headers: next,
        preferences: {
          adsMode: pending.ads.mode,
          adsValue: pending.ads.value,
          defaultDatePreset: pending.dateRange.preset,
          defaultPlatform: marketplace,
        },
      });
    }, 800);
  };

  const cols = SKU_COLUMNS.filter((c) => c.sticky || columnKeys.includes(c.key));
  const label = labelFor(computed.platforms, applied.dateRange);

  const buildSavePayload = () => ({
    label,
    platforms: computed.platforms,
    dateFrom: applied.dateRange.from,
    dateTo: applied.dateRange.to,
    adsMode: applied.ads.mode,
    adsValue: applied.ads.value,
    rowCount: computed.rowCount,
    summary: computed.summary,
    skuRows: computed.skuRows,
    sourceFiles: [
      ...uploads.map((u) => ({
        kind: u.kind,
        platform: u.platform,
        name: u.fileName,
        sizeBytes: u.sizeBytes,
        rowCount: Object.values(u.byTab).reduce((s, t) => s + t.rows.length, 0),
        contentBase64: u.contentBase64,
      })),
      ...(skuCost
        ? [{ kind: 'skuCost', platform: null, name: skuCost.fileName, sizeBytes: 0, rowCount: skuCost.count, contentBase64: null }]
        : []),
    ],
  });

  return (
    <>
      <DashboardToolbar
        marketplace={marketplace}
        detectedId={detectedId}
        onMarketplaceChange={setMarketplace}
        onOpenSettings={() => {
          setSettingsFocus(detectedId || marketplace || 'flipkart');
          setSettingsOpen(true);
        }}
        onUploadPayment={(f) => ingest(f, 'payment')}
        onUploadOrder={(f) => ingest(f, 'order')}
        onUploadSkuCost={onUploadSkuCost}
        onDownloadSkuTemplate={onDownloadSkuTemplate}
        busy={busy}
      />

      <main className="w-full px-4 py-6 sm:px-6 lg:px-10">
        <DashboardHeaderBar
          platform={pending.platform}
          availablePlatforms={availablePlatforms}
          onPlatformChange={(p) => setPending((s) => ({ ...s, platform: p }))}
          dateRange={pending.dateRange}
          onDateChange={(dr) => setPending((s) => ({ ...s, dateRange: dr }))}
          ads={pending.ads}
          onAdsChange={(ads) => setPending((s) => ({ ...s, ads }))}
          onApply={() => setApplied({ ...pending })}
          dirty={dirty}
          hasData={hasData}
          readOnly={!!openedRun}
          onExportExcel={() => downloadDashboardXlsx({ summary: computed.summary, skuRows: computed.skuRows, columns: cols, label, rawHeaders: rawTable.headers, rawRows: rawTable.rows, metaLabels: META_LABELS })}
          onExportPdf={() => downloadDashboardPdf({ summary: computed.summary, skuRows: computed.skuRows, columns: cols, label })}
          onOpenHistory={() => setHistoryOpen(true)}
          saveProps={{ buildPayload: buildSavePayload, rowCount: computed.rowCount, disabled: busy }}
        />

        {openedRun && (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-accent/40 bg-accent/5 px-4 py-2.5 text-sm">
            <span className="flex items-center gap-2 text-foreground">
              <Clock size={15} className="text-accent" />
              Viewing a saved run{openedRun.label ? ` — ${openedRun.label}` : ''} (read-only)
            </span>
            <button
              onClick={() => setOpenedRun(null)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-muted hover:bg-card-hover"
            >
              <X size={14} /> Exit
            </button>
          </div>
        )}

        {busy && !hasData ? (
          <div className="mt-6 flex justify-center py-16 text-muted">
            <Loader2 className="animate-spin" size={28} />
          </div>
        ) : !hasData ? (
          <div className="mt-6">
            <SheetDropCard />
          </div>
        ) : (
          <>
            <div className="mt-5">
              <KpiCardRow summary={computed.summary} />
            </div>

            {uploads.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-subtle">
                <span>Loaded:</span>
                {uploads.map((u) => (
                  <span key={u.id} className="inline-flex items-center gap-1.5 rounded-full border border-divider-light bg-background px-2 py-1">
                    <PlatformBadge id={u.platform} size="xs" />
                    <span className="text-muted">{u.fileName}</span>
                    {u.mapped === 0 && (
                      <button
                        onClick={() => { setSettingsFocus(u.platform); setSettingsOpen(true); }}
                        className="rounded bg-neg/10 px-1.5 text-[10px] font-semibold text-neg hover:underline"
                        title="Columns didn’t match — map them in Sheet Settings"
                      >
                        raw only · map
                      </button>
                    )}
                    {u.sheetNames.length > 1 && (
                      <button
                        onClick={() => { setSettingsFocus(u.platform); setSettingsOpen(true); }}
                        className="text-action hover:underline"
                        title="Choose which tabs to read"
                      >
                        {(byPlatform[u.platform]?.tabs || []).filter((t) => u.byTab[t]).length || 'auto'} tab
                      </button>
                    )}
                    <button onClick={() => setUploads((prev) => prev.filter((x) => x.id !== u.id))} className="text-subtle hover:text-neg">
                      <X size={11} />
                    </button>
                  </span>
                ))}
                {skuCost ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-divider-light bg-background px-2 py-1 text-muted">
                    SKU cost · {skuCost.count} SKUs
                    <button onClick={() => setSkuCost(null)} className="text-subtle hover:text-neg">
                      <X size={11} />
                    </button>
                  </span>
                ) : (
                  canonicalRows.length > 0 && (
                    <span className="text-neg">No SKU costs — Product Cost / COGS / Profit-Loss need them.</span>
                  )
                )}
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              {/* Summary (per-SKU) vs Raw rows (every line, every header) */}
              <div className="inline-flex rounded-full border border-divider-light bg-background p-0.5 text-sm">
                {[
                  ['summary', 'Summary'],
                  ['raw', `Raw rows${rawTable.rows.length ? ` · ${rawTable.rows.length.toLocaleString()}` : ''}`],
                ].map(([id, txt]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTableView(id)}
                    className={`rounded-full px-3 py-1 font-medium transition-colors ${
                      tableView === id ? 'bg-action text-white' : 'text-muted hover:text-foreground'
                    }`}
                  >
                    {txt}
                  </button>
                ))}
              </div>

              {tableView === 'summary' && (
                <DetailsViewPills
                  mode={viewMode}
                  onModeChange={setViewMode}
                  myColumns={myColumns}
                  onMyColumnsChange={onMyColumnsChange}
                />
              )}
            </div>

            <div className="mt-3">
              {tableView === 'summary' ? (
                <DetailsTable rows={computed.skuRows} columnKeys={columnKeys} />
              ) : rawTable.rows.length ? (
                <RawRowsTable headers={rawTable.headers} rows={rawTable.rows} metaLabels={META_LABELS} headerMeta={rawTable.meta} />
              ) : (
                <div className="rounded-xl border border-divider bg-background px-4 py-10 text-center text-sm text-muted">
                  Raw rows show every line of every uploaded sheet — open a saved run or upload a sheet.
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <HistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} onOpenRun={setOpenedRun} />
      <SheetSettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        focusPlatform={settingsFocus}
      />
    </>
  );
}

function labelFor(platforms, range) {
  const names = platforms.map((p) => p[0].toUpperCase() + p.slice(1)).join(', ') || 'All';
  const when = range.from && range.to ? `${range.from} → ${range.to}` : (range.preset || '').toUpperCase();
  return `${names} · ${when}`;
}

function toBase64(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
