'use client';

import { FileSpreadsheet, FileText, RotateCcw, Settings, Trash2 } from 'lucide-react';
import ValueFilter from './ValueFilter';
import DateRangeFilter from './DateRangeFilter';
import AdsCostControl from './AdsCostControl';
import IconButton from './IconButton';

// Row B: the active page's name as the title (the open Tab / Overview Tab /
// Transactions — see DashboardWorkspace's activePageName) + Reset / Company
// filter / Date / My Details, then Delete (selected rows) + the output
// actions (Excel / PDF) on the far right. The My Details pill isn't rendered
// here — this bar only provides the empty `display: contents` slot
// (viewPillsSlotRef) that TabView / OverviewTab portal into, since that state
// lives with them. The table's page limit + Prev/Next sit in its own footer.
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
  viewPillsSlotRef,
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
  selectedCount = 0,
  onDeleteClick,
  onExportExcel,
  onExportPdf,
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
      {/* <h1 className="text-2xl font-bold tracking-tight text-foreground">.</h1> */}

      <div className="flex flex-wrap items-center gap-2">
        <ValueFilter label="Account Names" allLabel="All Account Names" options={companyOptions} value={company} onChange={onCompanyChange} />
        <DateRangeFilter value={dateRange} onChange={onDateChange} />
        {/* <IconButton icon={RotateCcw} label="Reset" title="Reset filters" tone="ghost" onClick={onReset} /> */}
        <div ref={viewPillsSlotRef} className="contents" />
        <IconButton icon={FileSpreadsheet} label="Excel" title="Export to Excel" onClick={onExportExcel} disabled={!hasData || actionsDisabled} />
        <AdsCostControl value={ads} onChange={onAdsChange} />
        <IconButton icon={FileText} label="PDF" title="Export to PDF" onClick={onExportPdf} disabled={!hasData || actionsDisabled} />
        {updating && <span className="animate-pulse text-xs font-medium text-muted">Updating…</span>}

        <span className="mx-1 hidden h-6 w-px bg-divider sm:block" />
  
        <IconButton
          icon={Trash2}
          label="Delete"
          title={selectedCount ? `Delete ${selectedCount} selected row${selectedCount === 1 ? '' : 's'}` : 'Select rows in the table to delete them'}
          tone="outline"
          badge={selectedCount || null}
          disabled={!selectedCount || actionsDisabled}
          onClick={onDeleteClick}
        />
      
      </div>
    </div>
  );
}
