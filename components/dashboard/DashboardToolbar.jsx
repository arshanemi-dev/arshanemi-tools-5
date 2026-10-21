'use client';

import { FileDown, FileUp, Settings, Upload } from 'lucide-react';
import MarketplacePicker from './MarketplacePicker';
import BrandPicker from './BrandPicker';
import IconButton, { FileIconButton } from './IconButton';
import { ACCEPT } from '@/lib/sheet/readAnyFile';

// Row A (under the navbar): the green data-I/O bar. Setup is sequential —
// Market Place is always chosen (a live template auto-selects), then Brand
// (via the searchable/creatable BrandPicker, backed by the user's saved
// brand list); every file upload button stays disabled until a brand is
// picked or created, since that's what tags the upload as
// "MarketPlace_Brand" — its Account Name (see DashboardWorkspace.onUpload).
// The SKU Cost buttons (download the sheet of the fixed cost headers, upload
// it back filled in) need actual uploaded rows to act on, so they unlock
// separately once `hasData`. Then — right-aligned, signed-in users only —
// Position, which opens the Position Settings page (`onOpenPositions`):
// where a user arranges their own tabs, title cards, graphs and columns
// (components/positionSettings/). Upload buttons are generated from
// config.fileSlots so a template with 3 aux "Header N" slots renders exactly
// the reference's toolbar.
export default function DashboardToolbar({
  templates,
  activeTemplateId,
  onSelectTemplate,
  brands = [],
  brand,
  onBrandChange,
  onCreateBrand,
  fileSlots = [],
  onUpload,
  onUploadSkuCost,
  onDownloadSkuTemplate,
  hasData,
  busy,
  loggedIn = false,
  onOpenPositions = () => {},
}) {
  const uploadsReady = !!brand;
  return (
    <div className="border-b border-divider bg-background">
      <div className="flex w-full flex-wrap items-center gap-2 px-4 py-2.5 sm:px-6 lg:px-10">
        <MarketplacePicker templates={templates} activeId={activeTemplateId} onChange={onSelectTemplate} />
        <BrandPicker brands={brands} value={brand} onChange={onBrandChange} onCreate={onCreateBrand} />

        <span className="mx-1 h-6 w-px bg-divider" />

        {fileSlots.map((slot) => (
          <FileIconButton
            key={slot.id}
            icon={Upload}
            label={slot.label}
            title={uploadsReady ? `Upload ${slot.label} (${slot.accept || ACCEPT})` : 'Pick or create a brand first'}
            accept={slot.accept || ACCEPT}
            multiple={slot.multiple !== false}
            onFiles={(files) => onUpload(slot.id, files)}
            disabled={busy || !uploadsReady}
          />
        ))}

        <span className="mx-1 h-6 w-px bg-divider" />

        <FileIconButton
          icon={FileUp}
          label="SKU Cost"
          title={hasData ? 'Upload your filled-in SKU Cost sheet — COGS (Product Cost), Cost GST in, Final Product Cost, Other Expense (per order)' : 'Upload a settlement sheet first'}
          accept=".csv,.tsv,.txt,.xlsx,.xls"
          multiple={false}
          onFiles={(f) => onUploadSkuCost(f[0])}
          disabled={busy || !hasData}
          tone="outline"
        />
        <button
          type="button"
          onClick={onDownloadSkuTemplate}
          disabled={busy || !hasData}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-divider-light bg-background px-3 text-sm font-medium text-foreground transition-colors hover:border-divider disabled:opacity-45"
          title={hasData ? 'Download the SKU Cost sheet — your SKUs with the costs saved so far; fill it in and upload it back' : 'Upload a settlement sheet first'}
        >
          <FileDown size={15} className="shrink-0" />
          <span className="hidden sm:inline">SKU Cost</span>
        </button>

        {loggedIn && (
          <div className="ml-auto flex items-center gap-2">
            <IconButton
              icon={Settings}
              label="Position"
              title="Arrange your dashboard — tabs, title cards, graphs and columns"
              tone="outline"
              onClick={onOpenPositions}
            />
          </div>
        )}
      </div>
    </div>
  );
}
