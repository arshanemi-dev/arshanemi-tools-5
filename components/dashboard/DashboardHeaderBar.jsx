'use client';

import { Check, Clock, FileSpreadsheet, FileText } from 'lucide-react';
import PlatformFilter from './PlatformFilter';
import DateRangeFilter from './DateRangeFilter';
import AdsCostControl from './AdsCostControl';
import IconButton from './IconButton';
import SaveRunButton from './SaveRunButton';

// Row B: "Dashboard" title + every remaining control on one line — filters,
// Apply, then output actions (Excel / PDF / Save / History). Icon-first.
export default function DashboardHeaderBar({
  platform,
  availablePlatforms,
  onPlatformChange,
  dateRange,
  onDateChange,
  ads,
  onAdsChange,
  onApply,
  dirty,
  hasData,
  readOnly,
  onExportExcel,
  onExportPdf,
  onOpenHistory,
  saveProps,
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>

      <div className="flex flex-wrap items-center gap-2">
        <PlatformFilter value={platform} available={availablePlatforms} onChange={onPlatformChange} />
        <DateRangeFilter value={dateRange} onChange={onDateChange} />
        <AdsCostControl value={ads} onChange={onAdsChange} />
        <IconButton
          icon={Check}
          label="Apply"
          title="Recompute with the selected date range, platform and ad spend"
          tone="action"
          active={false}
          onClick={onApply}
        />

        <span className="mx-1 hidden h-6 w-px bg-divider sm:block" />

        <IconButton icon={FileSpreadsheet} label="Excel" title="Export dashboard to Excel" onClick={onExportExcel} disabled={!hasData} />
        <IconButton icon={FileText} label="PDF" title="Export dashboard to PDF" onClick={onExportPdf} disabled={!hasData} />
        {!readOnly && hasData && <SaveRunButton compact {...saveProps} />}
        <IconButton icon={Clock} label="History" title="Open saved runs" onClick={onOpenHistory} />
      </div>
    </div>
  );
}
