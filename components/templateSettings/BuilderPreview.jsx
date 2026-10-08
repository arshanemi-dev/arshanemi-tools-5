'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { resolveTemplate } from '@/lib/profitLoss/resolveTemplate';
import { RESERVED_HEADER_IDS } from '@/data/templateSchema';
import { normHeader } from '@/data/platforms/canonical';
import TabView from '@/components/dashboard/TabView';
import OverviewTab from '@/components/dashboard/OverviewTab';
import { HL_BOX, PreviewHighlightContext } from '@/components/dashboard/previewHighlight';
import { DEFAULT_OVERVIEW_ICON, DEFAULT_TAB_ICON, tabIconFor } from '@/components/dashboard/tabIcons';
import { overviewLevelIds } from '@/lib/profitLoss/overviewTree';

// A small, deterministic set of fake orders — 3 SKUs × 14 days, a mix of
// delivered/return/rto/cancelled, under two demo brands — run through the
// REAL resolveTemplate (and so the real P&L engine) so every default header,
// formula, title card and graph gets a plausible non-zero number. Not the
// seller's real data; same idea as GraphPreviewChart's seeded demo values,
// just at the row level.
const DEMO_BRANDS = ['Aura', 'Nova'];
const SKU_NAMES = new Set(['sku', 'skuname', 'skucode', 'vendorsku']);

// Mapped (non-engine) headers have no value in fake rows, so an Overview
// hierarchy built on them (Company → Sku → Order Id, …) would preview as
// one "(Blank)" node. Seed each with a few deterministic values instead —
// a unique id per row for Order/Transaction Id, 2–4 repeating labels for a
// text header, a small number for a number header. Sku / Company / Brand
// are left to readHeaderFromRow's own fallbacks (row.sku / upload tag).
function demoMeta(headers, i) {
  const meta = {};
  headers.forEach((h, hi) => {
    if (h.primitive || h.type === 'formula') return;
    const norm = normHeader(h.name);
    if (SKU_NAMES.has(norm) || norm.startsWith('company') || norm.startsWith('brand')) return;
    if (h.id === RESERVED_HEADER_IDS.orderId) { meta[h.id] = `OD-${1001 + i}`; return; }
    if (h.id === RESERVED_HEADER_IDS.transactionId) { meta[h.id] = `TX-${5001 + i}`; return; }
    if (h.type === 'number') { meta[h.id] = 10 + ((i * 7 + hi * 13) % 90); return; }
    const variants = 2 + (hi % 3);
    meta[h.id] = `${h.name} ${String.fromCharCode(65 + ((Math.floor(i / (hi % 4 + 1)) + hi) % variants))}`;
  });
  return meta;
}

function demoCanonicalRows(headers) {
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
      const brand = DEMO_BRANDS[(si + d) % 2];
      const i = id++;
      rows.push({
        rowId: `demo_${i}`,
        sku, qty: 1, status, orderDate: date, platform: 'flipkart',
        brand, company: `Flipkart_${brand}`,
        grossSale: gross, settlement,
        settlementDate: status === 'delivered' ? date : null,
        fees: { commission: Math.round(gross * 0.08) },
        taxes: { tcs: Math.round(gross * 0.01), tds: 0, gstOnFees: 0 },
        meta: demoMeta(headers, i),
      });
    });
  }
  return rows;
}

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

// Which preview slots (Tab / Overview Tab ids) actually show the selected
// builder item, best match first. A regular Tab's table lists every global
// header, so any Tab shows any header — but Tabs that pick it themselves,
// then Overview Tabs using it as a level or column, come first.
function slotsShowing(hl, tabs, overviewTabs) {
  if (!hl?.id) return [];
  const has = (list, id) => (list || []).includes(id);
  switch (hl.kind) {
    case 'tab':
      return tabs.some((t) => t.id === hl.id) ? [hl.id] : [];
    case 'overview':
      return overviewTabs.some((o) => o.id === hl.id) ? [hl.id] : [];
    case 'titleCard':
      return [...tabs, ...overviewTabs].filter((t) => has(t.titleCardIds, hl.id)).map((t) => t.id);
    case 'graph':
      return [...tabs, ...overviewTabs].filter((t) => has(t.graphIds, hl.id)).map((t) => t.id);
    case 'header': {
      const own = tabs.filter((t) => has(t.headerIds, hl.id)).map((t) => t.id);
      const ov = overviewTabs
        .filter((o) => overviewLevelIds(o).includes(hl.id) || has(o.headerIds, hl.id))
        .map((o) => o.id);
      return [...new Set([...own, ...ov, ...tabs.map((t) => t.id)])];
    }
    default:
      return [];
  }
}

const KIND_LIST = { titleCard: 'titleCards', graph: 'graphs', header: 'headers' };

// The right-hand "2nd half" of the builder — a live render of the dashboard
// (same TabView / OverviewTab / KpiCardRow / GraphStrip / DetailsTable the
// real /profit-loss page uses) driven straight off the draft config, so
// adding a header, a title card, a graph or a tab shows up immediately.
//
// `highlight` = the item currently selected in the builder ({ kind, id },
// see TemplateBuilder). The preview jumps to a tab that shows it (staying
// put if the current one already does), outlines it — card, graph, table
// column, hierarchy level, or the whole tab — and scrolls it into view. An
// item that isn't placed on any tab yet gets a note saying so instead.
export default function BuilderPreview({ config, highlight = null }) {
  const headers = config.headers;
  const canonicalRows = useMemo(() => demoCanonicalRows(headers || []), [headers]);
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
      ...tabs.map((t) => ({ id: t.id, name: t.name, kind: 'tab', Icon: tabIconFor(t.icon, DEFAULT_TAB_ICON) })),
      ...overviewTabs.map((o) => ({ id: o.id, name: o.name, kind: 'overview', Icon: tabIconFor(o.icon, DEFAULT_OVERVIEW_ICON) })),
    ],
    [tabs, overviewTabs],
  );

  const [activeId, setActiveId] = useState(null);
  const active = slots.find((s) => s.id === activeId) || slots[0] || null;
  const showing = slotsShowing(highlight, tabs, overviewTabs);

  // Follow a NEW selection to a tab that shows it — adjusted while
  // rendering (keyed off the selection), so a later manual pill click still
  // sticks until something else is selected.
  const hlKey = highlight?.id ? `${highlight.kind}:${highlight.id}` : '';
  const [seenHl, setSeenHl] = useState('');
  if (hlKey !== seenHl) {
    setSeenHl(hlKey);
    if (showing.length && !showing.includes(active?.id)) setActiveId(showing[0]);
  }

  const bodyRef = useRef(null);
  useEffect(() => {
    if (!hlKey) return;
    bodyRef.current
      ?.querySelector('[data-preview-hl]')
      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [hlKey, active?.id]);

  const [myColumns, setMyColumns] = useState([]);

  const slotLit = (id) => !!highlight && (highlight.kind === 'tab' || highlight.kind === 'overview') && highlight.id === id;
  const unplaced = highlight?.id && KIND_LIST[highlight.kind] && !showing.length
    ? (config[KIND_LIST[highlight.kind]] || []).find((it) => it.id === highlight.id)
    : null;

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
                } ${slotLit(s.id) ? HL_BOX : ''}`}
              >
                <s.Icon size={11} className="shrink-0" />
                {s.name || 'Untitled'}
              </button>
            ))}
          </div>
          {unplaced && (
            <div className="flex items-center gap-1.5 border-b border-divider bg-accent/10 px-4 py-2 text-[12px] text-foreground">
              <Info size={13} className="shrink-0 text-accent" />
              <span>
                <b>{unplaced.name || 'This item'}</b> isn&rsquo;t on any Tab or Overview Tab yet — add it to one to see it here.
              </span>
            </div>
          )}
          <PreviewHighlightContext.Provider value={highlight?.id ? highlight : null}>
            <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className={`rounded-xl ${slotLit(active?.id) ? `${HL_BOX} p-2` : ''}`}>
                {active?.kind === 'overview' ? (
                  <OverviewTab key={active.id} config={config} tab={overviewTabs.find((o) => o.id === active.id)} resolved={resolved} />
                ) : (
                  <TabView
                    config={config}
                    tab={tabs.find((t) => t.id === active?.id)}
                    resolved={resolved}
                    myColumns={myColumns}
                    onMyColumnsChange={setMyColumns}
                  />
                )}
              </div>
            </div>
          </PreviewHighlightContext.Provider>
        </>
      )}
    </div>
  );
}
