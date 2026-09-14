'use client';

import { FileDown, FileUp, Save, Settings, Undo2, Upload } from 'lucide-react';
import MarketplacePicker from './MarketplacePicker';
import BrandPicker from './BrandPicker';
import IconButton, { FileIconButton } from './IconButton';
import { ACCEPT } from '@/lib/sheet/readAnyFile';

// Row A (under the navbar): the green data-I/O bar. Setup is sequential —
// Market Place is always chosen (a live template auto-selects), then Brand
// (via the searchable/creatable BrandPicker, backed by the user's saved
// brand list); every file upload button stays disabled until a brand is
// picked or created, since that's what tags the upload as
// "MarketPlace_Brand" (see DashboardWorkspace.onUpload). The SKU Cost buttons
// need actual uploaded rows to act on, so they unlock separately once
// `hasData`. Then — right-aligned, signed-in users only — the
// dashboard-personalization toggle (Position Settings -> Save Position, plus
// Reset Position while active). Upload buttons are generated from
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
  editMode = false,
  onEnterEditMode = () => {},
  onSaveLayout = () => {},
  onResetLayout = () => {},
  savingLayout = false,
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
          label="Upload SKU Cost"
          title={hasData ? 'Upload your SKU → cost sheet' : 'Upload a settlement sheet first'}
          accept=".csv,.tsv,.txt,.xlsx,.xls"
          multiple={false}
          onFiles={(f) => onUploadSkuCost(f[0])}
          disabled={busy || !hasData}
          tone="outline"
        />
        <button
          type="button"
          onClick={onDownloadSkuTemplate}
          disabled={!hasData}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-divider-light bg-background px-3 text-sm font-medium text-foreground transition-colors hover:border-divider disabled:opacity-45"
          title={hasData ? 'Download a blank SKU cost sheet, pre-filled with your SKUs' : 'Upload a settlement sheet first'}
        >
          <FileDown size={15} className="shrink-0" />
          <span className="hidden sm:inline">Download SKU Cost</span>
        </button>

        {loggedIn && (
          <div className="ml-auto flex items-center gap-2">
            {editMode && (
              <IconButton
                icon={Undo2}
                label="Reset Position"
                title="Reset your dashboard back to the marketplace's default arrangement"
                tone="outline"
                onClick={onResetLayout}
                disabled={savingLayout}
              />
            )}
            <IconButton
              icon={editMode ? Save : Settings}
              label={editMode ? 'Save Position' : 'Position Settings'}
              title={editMode ? 'Save your dashboard layout' : 'Customize your dashboard layout'}
              tone={editMode ? 'action' : 'outline'}
              onClick={editMode ? onSaveLayout : onEnterEditMode}
              disabled={savingLayout}
            />
          </div>
        )}
      </div>
    </div>
  );
}
