'use client';

import { FileSpreadsheet, FileText, RotateCcw, Settings } from 'lucide-react';
import ValueFilter from './ValueFilter';
import DateRangeFilter from './DateRangeFilter';
import AdsCostControl from './AdsCostControl';
import IconButton from './IconButton';

// The dashboard's filters and actions, as one inline group — DashboardToolbar
// shows it at the end of its row, after the Market Place / upload controls
// (on every tab): the Account Names filter, Date, Excel, Ads and PDF. Saved
// rows are deleted in Position Settings › Orders, not here. The table's page
// limit + Prev/Next sit in its own footer.
//
// No Apply button — every change here debounces into effect on its own (see
// DashboardWorkspace's pending -> applied effect); `updating` shows a brief
// "Updating…" hint while that debounce is in flight. Save / History are
// hidden for now (props still flow down from DashboardWorkspace so they're a
// one-line change to bring back). Excel/PDF always export every uploaded row
// regardless of the date filter shown here — see DashboardWorkspace's
// doExport.
export default function DashboardHeaderBar({
  title = 'Dashboard',
  onReset,
  showSetting,
  onOpenSetting,
  companyOptions = [],
  company = 'all',
  onCompanyChange,
  dateRange,
  onDateChange,
  ads,
  onAdsChange,
  updating,
  hasData,
  actionsDisabled = false,
  onExportExcel,
  onExportPdf,
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {/* <h1 className="text-2xl font-bold tracking-tight text-foreground">.</h1> */}
      <ValueFilter label="Account Names" allLabel="All Account Names" options={companyOptions} value={company} onChange={onCompanyChange} />
      <DateRangeFilter value={dateRange} onChange={onDateChange} />
      {/* <IconButton icon={RotateCcw} label="Reset" title="Reset filters" tone="ghost" onClick={onReset} /> */}
      <IconButton icon={FileSpreadsheet} label="Excel" title="Download this tab to Excel — an Overview tab gets a sheet per level (only the columns shown)" onClick={onExportExcel} disabled={!hasData || actionsDisabled} />
      <AdsCostControl value={ads} onChange={onAdsChange} />
      <IconButton icon={FileText} label="PDF" title="Download this tab to PDF (only the columns shown)" onClick={onExportPdf} disabled={!hasData || actionsDisabled} />
      {updating && <span className="animate-pulse text-xs font-medium text-muted">Updating…</span>}
    </div>
  );
}
