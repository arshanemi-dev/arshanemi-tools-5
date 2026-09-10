'use client';

import { FileDown, FileUp, Upload } from 'lucide-react';
import MarketplacePicker from './MarketplacePicker';
import ValueFilter from './ValueFilter';
import { FileIconButton } from './IconButton';
import { ACCEPT } from '@/lib/sheet/readAnyFile';

// Row A (under the navbar): the green data-I/O bar. Market Place picker +
// Brand filter + one upload button per template file slot + SKU cost
// download/upload. Buttons are generated from config.fileSlots so a template
// with 3 aux "Header N" slots renders exactly the reference's toolbar.
export default function DashboardToolbar({
  templates,
  activeTemplateId,
  onSelectTemplate,
  brandOptions = [],
  brand = 'all',
  onBrandChange,
  fileSlots = [],
  onUpload,
  onUploadSkuCost,
  onDownloadSkuTemplate,
  busy,
}) {
  return (
    <div className="border-b border-divider bg-background">
      <div className="flex w-full flex-wrap items-center gap-2 px-4 py-2.5 sm:px-6 lg:px-10">
        <MarketplacePicker templates={templates} activeId={activeTemplateId} onChange={onSelectTemplate} />
        <ValueFilter label="Brand" allLabel="Select Brand" options={brandOptions} value={brand} onChange={onBrandChange} />

        <span className="mx-1 h-6 w-px bg-divider" />

        {fileSlots.map((slot) => (
          <FileIconButton
            key={slot.id}
            icon={Upload}
            label={slot.label}
            title={`Upload ${slot.label} (${slot.accept || ACCEPT})`}
            accept={slot.accept || ACCEPT}
            multiple={slot.multiple !== false}
            onFiles={(files) => onUpload(slot.id, files)}
            disabled={busy}
          />
        ))}

        <span className="mx-1 h-6 w-px bg-divider" />

        <FileIconButton
          icon={FileUp}
          label="Upload SKU Cost"
          title="Upload your SKU → cost sheet"
          accept=".csv,.tsv,.txt,.xlsx,.xls"
          multiple={false}
          onFiles={(f) => onUploadSkuCost(f[0])}
          disabled={busy}
          tone="outline"
        />
        <button
          type="button"
          onClick={onDownloadSkuTemplate}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-divider-light bg-background px-3 text-sm font-medium text-foreground transition-colors hover:border-divider"
          title="Download a blank SKU cost sheet, pre-filled with your SKUs"
        >
          <FileDown size={15} className="shrink-0" />
          <span className="hidden sm:inline">Download SKU Cost</span>
        </button>
      </div>
    </div>
  );
}
