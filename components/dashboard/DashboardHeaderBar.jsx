'use client';

import { Check, Clock, FileSpreadsheet, FileText, RotateCcw, Settings } from 'lucide-react';
import ValueFilter from './ValueFilter';
import DateRangeFilter from './DateRangeFilter';
import AdsCostControl from './AdsCostControl';
import IconButton from './IconButton';
import SaveRunButton from './SaveRunButton';

// Row B: "Dashboard" title + Reset / Setting / Company filter / Date / Apply,
// then the output actions (Excel / PDF / Save / History) on the far right —
// matching the reference header row.
export default function DashboardHeaderBar({
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
  onApply,
  dirty,
  hasData,
  onExportExcel,
  onExportPdf,
  onOpenHistory,
  saveProps,
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>

      <div className="flex flex-wrap items-center gap-2">
        <IconButton icon={RotateCcw} label="Reset" title="Reset filters" tone="ghost" onClick={onReset} />
       
        <ValueFilter label="Companies" allLabel="All Companies" options={companyOptions} value={company} onChange={onCompanyChange} />
        <DateRangeFilter value={dateRange} onChange={onDateChange} />
        <AdsCostControl value={ads} onChange={onAdsChange} />
        <IconButton
          icon={Check}
          label="Apply"
          title="Recompute with the selected filters"
          tone="action"
          active={dirty}
          onClick={onApply}
        />

        <span className="mx-1 hidden h-6 w-px bg-divider sm:block" />

        <IconButton icon={FileSpreadsheet} label="Excel" title="Export to Excel" onClick={onExportExcel} disabled={!hasData} />
        <IconButton icon={FileText} label="PDF" title="Export to PDF" onClick={onExportPdf} disabled={!hasData} />
        {hasData && saveProps && <SaveRunButton compact {...saveProps} />}
        <IconButton icon={Clock} label="History" title="Open saved runs" onClick={onOpenHistory} />
      </div>
    </div>
  );
}
