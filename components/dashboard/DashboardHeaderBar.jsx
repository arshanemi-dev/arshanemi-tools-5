'use client';

import { FileSpreadsheet, FileText, RotateCcw, Settings } from 'lucide-react';
import ValueFilter from './ValueFilter';
import DateRangeFilter from './DateRangeFilter';
import AdsCostControl from './AdsCostControl';
import RowLimitControl from './RowLimitControl';
import IconButton from './IconButton';

// Row B: "Dashboard" title + Reset / row-limit / Company filter / Date, then
// the output actions (Excel / PDF) on the far right — matching the reference
// header row. No Apply button — every change here debounces into effect on
// its own (see DashboardWorkspace's pending -> applied effect); `updating`
// shows a brief "Updating…" hint while that debounce is in flight. Save /
// History are hidden for now (props still flow down from DashboardWorkspace
// so they're a one-line change to bring back). Excel/PDF always export every
// uploaded row regardless of the row-limit or date filter shown here — see
// DashboardWorkspace's doExport.
export default function DashboardHeaderBar({
  onReset,
  showSetting,
  onOpenSetting,
  rowLimit,
  onRowLimitChange,
  companyOptions = [],
  company = 'all',
  onCompanyChange,
  dateRange,
  onDateChange,
  ads,
  onAdsChange,
  updating,
  hasData,
  onExportExcel,
  onExportPdf,
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>

      <div className="flex flex-wrap items-center gap-2">
        <IconButton icon={RotateCcw} label="Reset" title="Reset filters" tone="ghost" onClick={onReset} />
        <RowLimitControl value={rowLimit} onChange={onRowLimitChange} />
        <ValueFilter label="Companies" allLabel="All Companies" options={companyOptions} value={company} onChange={onCompanyChange} />
        <DateRangeFilter value={dateRange} onChange={onDateChange} />
        <AdsCostControl value={ads} onChange={onAdsChange} />
        {updating && <span className="animate-pulse text-xs font-medium text-muted">Updating…</span>}

        <span className="mx-1 hidden h-6 w-px bg-divider sm:block" />

        <IconButton icon={FileSpreadsheet} label="Excel" title="Export to Excel" onClick={onExportExcel} disabled={!hasData} />
        <IconButton icon={FileText} label="PDF" title="Export to PDF" onClick={onExportPdf} disabled={!hasData} />
      </div>
    </div>
  );
}
