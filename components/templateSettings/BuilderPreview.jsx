'use client';

import { useMemo, useState } from 'react';
import { Layers } from 'lucide-react';
import { resolveTemplate } from '@/lib/profitLoss/resolveTemplate';
import TabView from '@/components/dashboard/TabView';
import OverviewTab from '@/components/dashboard/OverviewTab';

// A small, deterministic set of fake orders — 3 SKUs × 14 days, a mix of
// delivered/return/rto/cancelled — run through the REAL resolveTemplate (and
// so the real P&L engine) so every default header, formula, title card and
// graph gets a plausible non-zero number. Not the seller's real data; same
// idea as GraphPreviewChart's seeded demo values, just at the row level.
function demoCanonicalRows() {
  const skus = ['SKU-001', 'SKU-002', 'SKU-003'];
  const statuses = ['delivered', 'delivered', 'delivered', 'return', 'rto', 'cancelled', 'delivered'];
  const rows = [];
  let id = 0;
  for (let d = 0; d < 14; d += 1) {
    const date = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
    skus.forEach((sku, si) => {
      const status = statuses[(d + si) % statuses.length];
      const gross = 200 + ((d * 17 + si * 31) % 300);
      const settlement = status === 'delivered' ? Math.round(gross * 0.82) : status === 'return' ? -Math.round(gross * 0.2) : 0;
      rows.push({
        rowId: `demo_${id++}`,
        sku, qty: 1, status, orderDate: date, platform: 'flipkart',
        grossSale: gross, settlement,
        settlementDate: status === 'delivered' ? date : null,
        fees: { commission: Math.round(gross * 0.08) },
        taxes: { tcs: Math.round(gross * 0.01), tds: 0, gstOnFees: 0 },
        meta: {},
      });
    });
  }
  return rows;
}

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

// The right-hand "2nd half" of the builder — a live render of the dashboard
// (same TabView / OverviewTab / KpiCardRow / GraphStrip / DetailsTable the
// real /profit-loss page uses) driven straight off the draft config, so
// adding a header, a title card, a graph or a tab shows up immediately.
export default function BuilderPreview({ config }) {
  const canonicalRows = useMemo(() => demoCanonicalRows(), []);
  const resolved = useMemo(() => {
    try {
      return resolveTemplate(config, { canonicalRows, ads: { mode: 'percent', value: 5 } });
    } catch {
      return null;
    }
  }, [config, canonicalRows]);

  const tabs = useMemo(() => [...(config.tabs || [])].sort(byOrder), [config.tabs]);
  const overviewTabs = useMemo(() => [...(config.overviewTabs || [])].sort(byOrder), [config.overviewTabs]);
  const slots = useMemo(
    () => [
      ...tabs.map((t) => ({ id: t.id, name: t.name, kind: 'tab' })),
      ...overviewTabs.map((o) => ({ id: o.id, name: o.name, kind: 'overview' })),
    ],
    [tabs, overviewTabs],
  );

  const [activeId, setActiveId] = useState(null);
  const active = slots.find((s) => s.id === activeId) || slots[0] || null;

  const [viewMode, setViewMode] = useState('all');
  const [myColumns, setMyColumns] = useState([]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-divider bg-background px-4 py-2.5">
        <span className="text-[13px] font-bold text-foreground">Preview</span>
        <span className="text-[10.5px] text-subtle">demo data — updates live as you edit</span>
      </div>

      {!resolved ? (
        <div className="flex flex-1 items-center justify-center p-10 text-center text-sm text-neg">
          Preview failed — fix the template errors below and it will come back.
        </div>
      ) : !slots.length ? (
        <div className="flex flex-1 items-center justify-center p-10 text-center text-sm text-muted">
          Add a Tab or an Overview Tab to see a live preview here.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 border-b border-divider px-4 py-2">
            {slots.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveId(s.id)}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  active?.id === s.id ? 'bg-action text-white' : 'bg-card text-muted hover:text-foreground'
                }`}
              >
                {s.kind === 'overview' && <Layers size={11} />}
                {s.name || 'Untitled'}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {active?.kind === 'overview' ? (
              <OverviewTab config={config} tab={overviewTabs.find((o) => o.id === active.id)} resolved={resolved} />
            ) : (
              <TabView
                config={config}
                tab={tabs.find((t) => t.id === active?.id)}
                resolved={resolved}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                myColumns={myColumns}
                onMyColumnsChange={setMyColumns}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
