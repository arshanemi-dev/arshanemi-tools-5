'use client';

import { FileDown, FileUp, Settings2, Upload } from 'lucide-react';
import MarketplacePicker from './MarketplacePicker';
import IconButton, { FileIconButton } from './IconButton';

// Row A (directly under the navbar): data in/out. Icon-first, one line.
export default function DashboardToolbar({
  marketplace,
  detectedId,
  onMarketplaceChange,
  onOpenSettings,
  onUploadPayment,
  onUploadOrder,
  onUploadSkuCost,
  onDownloadSkuTemplate,
  busy,
}) {
  return (
    <div className="border-b border-divider bg-background">
      <div className="flex w-full flex-wrap items-center gap-2 px-4 py-2.5 sm:px-6 lg:px-10">
        <MarketplacePicker value={marketplace} detectedId={detectedId} onChange={onMarketplaceChange} />

        <IconButton icon={Settings2} label="Sheet Settings" title="Choose which Excel tabs to read + map columns" onClick={onOpenSettings} />

        <span className="mx-1 h-6 w-px bg-divider" />

        <FileIconButton icon={Upload} label="Payment Sheet" title="Upload marketplace payment / settlement sheet" onFiles={onUploadPayment} disabled={busy} />
        <FileIconButton icon={Upload} label="Order Sheet" title="Upload marketplace order sheet (optional)" onFiles={onUploadOrder} disabled={busy} />
        <IconButton icon={FileDown} label="SKU Cost Template" title="Download a blank SKU cost sheet (pre-filled with your SKUs)" onClick={onDownloadSkuTemplate} />
        <FileIconButton icon={FileUp} label="SKU Cost" title="Upload your SKU → cost sheet" multiple={false} onFiles={(f) => onUploadSkuCost(f[0])} disabled={busy} tone="outline" />
      </div>
    </div>
  );
}
