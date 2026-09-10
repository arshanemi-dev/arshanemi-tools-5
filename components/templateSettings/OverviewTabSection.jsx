'use client';

import HeaderPickerStrip from './HeaderPickerStrip';
import SectionHead from './SectionHead';

// image 2 · Overview Tab — the "Header Wise Overview" entry pinned after the
// tabs in the dashboard sidebar. One wide table over the chosen headers.
export default function OverviewTabSection({ draft }) {
  const { config, updateOverview } = draft;
  const ov = config.overviewTab || { enabled: false, name: 'Overview', headerIds: [] };
  const headerOpts = (config.headers || []).map((h) => ({ id: h.id, name: h.name }));

  return (
    <div id="section-overview" className="scroll-mt-24">
      <SectionHead title="Overview Tab" desc="A cross-tab, header-wise summary — shown after the tabs in the sidebar." />
      <div className="space-y-3 rounded-xl border border-divider bg-background p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={ov.name || 'Overview'}
            onChange={(e) => updateOverview({ name: e.target.value })}
            placeholder="Enter Overview Tab name"
            className="min-w-[12rem] flex-1 rounded-lg border border-divider bg-background px-3 py-1.5 text-sm font-medium focus:border-accent focus:outline-none"
          />
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={!!ov.enabled} onChange={(e) => updateOverview({ enabled: e.target.checked })} className="accent-[var(--color-action)]" />
            Show Overview in sidebar
          </label>
        </div>
        <div className="rounded-lg border border-divider bg-card p-3">
          <div className="mb-2 text-[13px] font-semibold text-foreground">Header Wise Overview</div>
          <HeaderPickerStrip label="Header" options={headerOpts} selectedIds={ov.headerIds || []} onChange={(headerIds) => updateOverview({ headerIds })} />
        </div>
      </div>
    </div>
  );
}
