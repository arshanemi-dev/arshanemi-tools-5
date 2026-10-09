'use client';

import { FileSpreadsheet, FileText, Menu, RotateCcw, Settings, Trash2 } from 'lucide-react';
import ValueFilter from './ValueFilter';
import DateRangeFilter from './DateRangeFilter';
import AdsCostControl from './AdsCostControl';
import IconButton from './IconButton';

// Row B: the active page's name as the title (the open Tab / Overview Tab /
// Transactions — see DashboardWorkspace's activePageName) + Reset / the
// table's page limit + row counts / Company filter / Date / My Details, then
// Delete (selected rows) + the output actions (Excel / PDF) on the far
// right. The page limit/counts and the My Details pill aren't rendered
// here — this bar only provides the two empty `display: contents`
// slots (pagerSlotRef / viewPillsSlotRef) that the active table and TabView
// / OverviewTab portal into, since that state lives with them.
//
// No Apply button — every change here debounces into effect on its own (see
// DashboardWorkspace's pending -> applied effect); `updating` shows a brief
// "Updating…" hint while that debounce is in flight. Save / History are
// hidden for now (props still flow down from DashboardWorkspace so they're a
// one-line change to bring back). Excel/PDF always export every uploaded row
// regardless of the date filter shown here — see DashboardWorkspace's
// doExport. `onMenuClick` is only passed when NEXT_PUBLIC_IS_Header_Hide
// removed the topbar (and its hamburger) — see ProfitLossShell.
export default function DashboardHeaderBar({
  title = 'Dashboard',
  pagerSlotRef,
  viewPillsSlotRef,
  onMenuClick,
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
  selectedCount = 0,
  onDeleteClick,
  onExportExcel,
  onExportPdf,
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Open menu"
            className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-card-hover hover:text-foreground lg:hidden"
          >
            <Menu size={20} />
          </button>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ValueFilter label="Account Names" allLabel="All Account Names" options={companyOptions} value={company} onChange={onCompanyChange} />
        <DateRangeFilter value={dateRange} onChange={onDateChange} />
        {/* <IconButton icon={RotateCcw} label="Reset" title="Reset filters" tone="ghost" onClick={onReset} /> */}
        <div ref={pagerSlotRef} className="contents" />
        <div ref={viewPillsSlotRef} className="contents" />
        <IconButton icon={FileSpreadsheet} label="Excel" title="Export to Excel" onClick={onExportExcel} disabled={!hasData} />
        <AdsCostControl value={ads} onChange={onAdsChange} />
        <IconButton icon={FileText} label="PDF" title="Export to PDF" onClick={onExportPdf} disabled={!hasData} />
        {updating && <span className="animate-pulse text-xs font-medium text-muted">Updating…</span>}

        <span className="mx-1 hidden h-6 w-px bg-divider sm:block" />
  
        <IconButton
          icon={Trash2}
          label="Delete"
          title={selectedCount ? `Delete ${selectedCount} selected row${selectedCount === 1 ? '' : 's'}` : 'Select rows in the table to delete them'}
          tone="outline"
          badge={selectedCount || null}
          disabled={!selectedCount}
          onClick={onDeleteClick}
        />
      
      </div>
    </div>
  );
}
