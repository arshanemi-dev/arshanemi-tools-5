'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, LogIn, PanelsTopLeft, Save, Undo2 } from 'lucide-react';
import { useToast } from '@/components/admin/Toast';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import TemplatesLoadError from '@/components/dashboard/TemplatesLoadError';
import IconButton from '@/components/dashboard/IconButton';
import { useLiveTemplates } from '@/lib/profitLoss/useLiveTemplates';
import { useDashboardSettings } from '@/lib/profitLoss/useDashboardSettings';
import { effectiveConfig } from '@/lib/profitLoss/effectiveConfig';
import { columnsModel, columnsSaved, marketplaceItems, overviewItems, shownIds, stripSectionOf, tabItems, withStrip } from '@/lib/profitLoss/positionDraft';
import TabContentsPanel from './TabContentsPanel';
import TickOrderList, { listWords } from './TickOrderList';

const MARKET_WORDS = listWords('market place', 'market places', 'Market place order', 'Take off the list');
const TAB_WORDS = listWords('tab', 'tabs', 'Tab strip order', 'Take off the tab strip');
const STRIP_GROUPS = [{ id: 'tabs', name: 'Tabs' }, { id: 'overviews', name: 'Overview Tabs' }];

// /profit-loss/position-settings — a signed-in user arranges their own
// dashboard here (the dashboard's Position button opens it): the Market
// Places the toolbar's picker offers, the tab strip — Tabs and Overview Tabs
// as one list, in any mix — and on each tab its Title Cards, Graphs and
// Columns (TabContentsPanel). Every list works the way the Columns one does
// (TickOrderList — My Details' two lists): tick what shows, put the ticked
// ones in order — only ever the template's own items for that place.
// Nothing is kept until Save Position, which saves it all at once to the
// same settings row the dashboard reads (useDashboardSettings
// saveArrangement; positionDraft.js turns the lists into its sections).
// Reset Position puts everything back to the template's own arrangement
// and saves that at once. Leaving with unsaved changes asks first.
// `?m=` = the marketplace the dashboard had open. Every header is listed
// whichever it is (effectiveConfig) — it only picks the key column of a tab
// with no headers of its own, so there's no picker for it here.
function Card({ title, hint, right = null, children }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-divider bg-background p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {/* <p className="text-[12px] text-muted">{hint}</p> */}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

const Centered = ({ children }) => <div className="flex min-h-[60vh] items-center justify-center px-4">{children}</div>;

export default function PositionSettingsPage() {
  const { addToast } = useToast();
  const params = useSearchParams();
  const { templates, globalConfig, headerGroups, templatesReady, templatesCurrent, templatesError, retryTemplates } = useLiveTemplates({ addToast });
  const { loggedIn, settingsLoaded, reconcile, layout, myColumnsFor, saveArrangement, resetLayout, savingLayout } = useDashboardSettings({ addToast });

  const marketplaceId = params.get('m');
  const marketplace = templates.find((t) => t.id === marketplaceId) || templates[0] || null;
  const config = useMemo(
    () => effectiveConfig(globalConfig, marketplace?.config || (marketplace ? {} : null), headerGroups),
    [globalConfig, marketplace, headerGroups],
  );

  // The copy being edited: null / {} = as saved.
  const [draftLayout, setDraftLayout] = useState(null);
  const [draftCols, setDraftCols] = useState({}); // { [tabId]: { ticked: [ids], order: [ids] } }
  const [selectedId, setSelectedId] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const current = draftLayout ?? layout;
  const dirty = draftLayout !== null || Object.keys(draftCols).length > 0;

  // Same as the dashboard: the saved row brought up to the live version
  // first — never while something here is being edited.
  const markets = useMemo(() => marketplaceItems(templates), [templates]);
  const marketIds = useMemo(() => markets.map((m) => m.id), [markets]);
  useEffect(() => {
    if (settingsLoaded && templatesCurrent && marketplace && !dirty) reconcile(config, marketIds);
  }, [settingsLoaded, templatesCurrent, marketplace, config, marketIds, reconcile, dirty]);

  // Unsaved changes: a reload / close asks, and so does a link out of the page.
  useEffect(() => {
    if (!dirty) return undefined;
    const onUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    const onLink = (e) => {
      const a = e.target.closest?.('a[href]');
      if (a && !window.confirm('Leave without saving your new positions?')) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('click', onLink, true);
    return () => { window.removeEventListener('beforeunload', onUnload); document.removeEventListener('click', onLink, true); };
  }, [dirty]);

  const marketsShown = shownIds(markets, current.marketplaces);
  // The tab strip: Tabs and Overview Tabs as one list (stripSectionOf).
  const tabs = useMemo(() => tabItems(config), [config]);
  const overviews = useMemo(() => overviewItems(config), [config]);
  const strip = useMemo(
    () => [...tabs.map((t) => ({ ...t, groupId: 'tabs' })), ...overviews.map((o) => ({ ...o, groupId: 'overviews' }))],
    [tabs, overviews],
  );
  const stripSection = stripSectionOf(current, tabs, overviews);
  const stripShown = shownIds(strip, stripSection);
  const onStrip = new Set(stripShown);
  const tabById = new Map([...(config.tabs || []), ...(config.overviewTabs || [])].map((t) => [t.id, t]));
  const isOverview = (id) => overviews.some((o) => o.id === id);
  // The tab row under "Arrange a tab": the strip's order, then any taken off it.
  const pickerTabs = [...stripShown, ...strip.map((t) => t.id).filter((id) => !onStrip.has(id))]
    .map((id) => strip.find((t) => t.id === id))
    .map((t) => ({ ...t, overview: isOverview(t.id), onStrip: onStrip.has(t.id) }));
  const activeId = pickerTabs.some((t) => t.id === selectedId) ? selectedId : pickerTabs[0]?.id ?? null;
  const activeTab = tabById.get(activeId) || null;
  const activeOverview = activeTab ? isOverview(activeTab.id) : false;

  const modelFor = (tab, overview) => columnsModel(tab, config, current, myColumnsFor(tab.id, tab.headerIds || [], !overview), overview);
  const model = activeTab ? modelFor(activeTab, activeOverview) : null;
  const edit = activeTab ? draftCols[activeTab.id] : null;
  const columns = model && {
    model,
    ticked: new Set(edit ? edit.ticked : model.shownIds),
    order: edit ? edit.order : model.orderIds,
    onTicked: (set) => setDraftCols((p) => ({ ...p, [activeTab.id]: { order: p[activeTab.id]?.order ?? model.orderIds, ticked: [...set] } })),
    onOrder: (ids) => setDraftCols((p) => ({ ...p, [activeTab.id]: { ticked: p[activeTab.id]?.ticked ?? model.shownIds, order: ids } })),
  };

  const setMarkets = (next) => setDraftLayout((p) => ({ ...(p ?? layout), marketplaces: next }));
  const setStrip = (next) => setDraftLayout((p) => withStrip(p ?? layout, next));
  const setTabPart = (kind, next) => setDraftLayout((p) => {
    const base = p ?? layout;
    return { ...base, perTab: { ...base.perTab, [activeId]: { ...base.perTab?.[activeId], [kind]: next } } };
  });

  // What stops a save: no market place or no tab left, or a tab with no column.
  const emptyTabs = Object.entries(draftCols).filter(([id, e]) => tabById.has(id) && !e.ticked.length).map(([id]) => tabById.get(id).name);
  const problem = markets.length && !marketsShown.length
    ? 'Keep at least one market place.'
    : !onStrip.size ? 'Keep at least one tab on the tab strip.'
      : emptyTabs.length ? `Tick at least one column on ${emptyTabs.join(', ')}.` : '';

  const save = async () => {
    if (problem) return;
    let next = current;
    const ticks = {};
    for (const [tabId, e] of Object.entries(draftCols)) {
      const tab = tabById.get(tabId);
      if (!tab) continue;
      const m = modelFor(tab, isOverview(tabId));
      const saved = columnsSaved(tab, next.perTab?.[tabId]?.headers, m.allIds, e.order, e.ticked);
      next = { ...next, perTab: { ...next.perTab, [tabId]: { ...next.perTab?.[tabId], headers: saved.section } } };
      ticks[tabId] = { ticks: saved.ticks, base: saved.base };
    }
    if (await saveArrangement({ layout: next, ticks })) { setDraftLayout(null); setDraftCols({}); }
  };

  // Loading first: the server can't tell who is signed in, and nothing has
  // loaded on either side yet — so both draw the same spinner.
  if (templatesError) return <TemplatesLoadError message={templatesError} onRetry={retryTemplates} />;
  if (!templatesReady) return <Centered><Loader2 className="animate-spin text-muted" size={28} /></Centered>;
  if (!loggedIn) {
    return (
      <Centered>
        <div className="max-w-sm rounded-2xl border border-divider bg-background p-8 text-center">
          <PanelsTopLeft className="mx-auto text-accent" size={28} />
          <h1 className="mt-3 text-lg font-bold text-foreground">Sign in to arrange your dashboard</h1>
          <p className="mt-1 text-sm text-muted">Positions are saved to your account, so this page needs you signed in.</p>
          <Link href="/login?next=/profit-loss/position-settings" className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action-hover">
            <LogIn size={15} /> Sign in
          </Link>
        </div>
      </Centered>
    );
  }
  if (!settingsLoaded) return <Centered><Loader2 className="animate-spin text-muted" size={28} /></Centered>;
  if (!templates.length) return <Centered><p className="text-sm text-muted">No marketplaces yet — there is nothing to arrange.</p></Centered>;

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 sm:px-6 lg:px-10">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-foreground">Position Settings</h1>
          {/* <p className="text-[13px] text-muted">Arrange your own dashboard — its market places, the tab strip, and on each tab its title cards, graphs and columns. Only you see it.</p> */}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty && <span className="text-[12px] font-medium text-link">Unsaved changes</span>}
          <IconButton icon={Undo2} label="Reset Position" title="Put everything back to the template's own arrangement, and save it" tone="outline" onClick={() => setConfirmReset(true)} disabled={savingLayout} />
          <IconButton icon={Save} label="Save Position" title={problem || 'Save your dashboard layout'} tone="action" onClick={save} disabled={savingLayout || !dirty || !!problem} />
        </div>
      </header>
      {problem && <p className="rounded-lg bg-neg/10 px-3 py-2 text-[13px] font-medium text-neg">{problem}</p>}

      <Card title="Market Places" hint="Tick the market places the toolbar offers, then put them in order — the dashboard opens on the first.">
        <TickOrderList items={markets} section={current.marketplaces} onChange={setMarkets} title="Market Places" words={MARKET_WORDS} />
      </Card>
      <Card title="Tabs" hint="Tick the tabs and overview tabs the tab strip shows, then put them in order — together, in any mix.">
        <TickOrderList items={strip} section={stripSection} onChange={setStrip} groups={overviews.length ? STRIP_GROUPS : null} title="Tabs" words={TAB_WORDS} />
      </Card>

      <Card
        title="Select Tabs and arrange Title Cards and Headers (Tabs Wise)"
        hint="Pick a tab, then put its title cards, graphs and columns in the order you want."
      >
        <TabContentsPanel
          config={config}
          layout={current}
          tabs={pickerTabs}
          selectedId={activeId}
          onSelect={setSelectedId}
          tab={activeTab}
          overview={activeOverview}
          onSection={setTabPart}
          columns={columns}
        />
      </Card>

      <ConfirmDialog
        open={confirmReset}
        title="Reset your dashboard?"
        description="Your own arrangement — tab order, removed items, column order and columns, on every tab — goes back to what the template sets. It is saved straight away."
        confirmLabel="Reset"
        loadingLabel="Resetting…"
        loading={savingLayout}
        onConfirm={async () => { if (await resetLayout()) { setDraftLayout(null); setDraftCols({}); } setConfirmReset(false); }}
        onCancel={() => { if (!savingLayout) setConfirmReset(false); }}
      />
    </div>
  );
}
