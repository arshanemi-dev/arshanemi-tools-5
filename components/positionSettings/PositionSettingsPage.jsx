'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, LogIn, PanelsTopLeft, Save, Undo2 } from 'lucide-react';
import { useToast } from '@/components/admin/Toast';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import HeaderPickerStrip from '@/components/templateSettings/HeaderPickerStrip';
import MarketplacePicker from '@/components/dashboard/MarketplacePicker';
import TemplatesLoadError from '@/components/dashboard/TemplatesLoadError';
import IconButton from '@/components/dashboard/IconButton';
import { useLiveTemplates } from '@/lib/profitLoss/useLiveTemplates';
import { useDashboardSettings } from '@/lib/profitLoss/useDashboardSettings';
import { effectiveConfig } from '@/lib/profitLoss/effectiveConfig';
import { columnsModel, columnsSaved, overviewItems, sectionShowing, shownIds, tabItems } from '@/lib/profitLoss/positionDraft';
import TabContentsPanel from './TabContentsPanel';

// /profit-loss/position-settings — a signed-in user arranges their own
// dashboard here (the dashboard's Position button opens it): the order of
// the Tabs and Overview Tabs on the tab strip, and on each tab its Title
// Cards, Graphs and Columns (TabContentsPanel). Every list is moved the way
// Template Settings' lists are; × takes an item off, Add brings it back —
// only ever the template's own items for that place.
// Nothing is kept until Save Position, which saves it all at once to the
// same settings row the dashboard reads (useDashboardSettings
// saveArrangement; positionDraft.js turns the lists into its sections).
// Reset Position puts everything back to the template's own arrangement
// and saves that at once. Leaving with unsaved changes asks first.
// `?m=` = the marketplace the dashboard had open — which key column a tab
// starts with depends on it; the picker beside Save can change it.
function Card({ title, hint, children }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-divider bg-background p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-[12px] text-muted">{hint}</p>
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

  const [marketplaceId, setMarketplaceId] = useState(() => params.get('m'));
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
  useEffect(() => {
    if (settingsLoaded && templatesCurrent && marketplace && !dirty) reconcile(config);
  }, [settingsLoaded, templatesCurrent, marketplace, config, reconcile, dirty]);

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

  const tabs = useMemo(() => tabItems(config), [config]);
  const overviews = useMemo(() => overviewItems(config), [config]);
  const tabsShown = shownIds(tabs, current.tabs);
  const overviewsShown = shownIds(overviews, current.overviewTabs);
  const stripIds = new Set([...tabsShown, ...overviewsShown]);
  const tabById = new Map([...(config.tabs || []), ...(config.overviewTabs || [])].map((t) => [t.id, t]));
  const isOverview = (id) => overviews.some((o) => o.id === id);
  // The tab row on the right: the strip's order, then any taken off it.
  const pickerTabs = [
    ...[...tabsShown, ...tabs.map((t) => t.id).filter((id) => !tabsShown.includes(id))].map((id) => tabs.find((t) => t.id === id)),
    ...[...overviewsShown, ...overviews.map((o) => o.id).filter((id) => !overviewsShown.includes(id))].map((id) => overviews.find((o) => o.id === id)),
  ].map((t) => ({ ...t, overview: isOverview(t.id), onStrip: stripIds.has(t.id) }));
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

  const setTop = (key, visibleIds, allIds) => setDraftLayout((p) => {
    const base = p ?? layout;
    return { ...base, [key]: sectionShowing(base[key], allIds, visibleIds) };
  });
  const setTabPart = (kind, visibleIds, allIds) => setDraftLayout((p) => {
    const base = p ?? layout;
    const own = base.perTab?.[activeId] || {};
    return { ...base, perTab: { ...base.perTab, [activeId]: { ...own, [kind]: sectionShowing(own[kind], allIds, visibleIds) } } };
  });

  // What stops a save: no tab left on the strip, or a tab with no column.
  const emptyTabs = Object.entries(draftCols).filter(([id, e]) => tabById.has(id) && !e.ticked.length).map(([id]) => tabById.get(id).name);
  const problem = !stripIds.size
    ? 'Keep at least one tab on the tab strip.'
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
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-10">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-foreground">Position Settings</h1>
          <p className="text-[13px] text-muted">Arrange your own dashboard — the tab strip, and on each tab its title cards, graphs and columns. Only you see it.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {templates.length > 1 && <MarketplacePicker templates={templates} activeId={marketplace?.id} onChange={setMarketplaceId} />}
          {dirty && <span className="text-[12px] font-medium text-link">Unsaved changes</span>}
          <IconButton icon={Undo2} label="Reset Position" title="Put everything back to the template's own arrangement, and save it" tone="outline" onClick={() => setConfirmReset(true)} disabled={savingLayout} />
          <IconButton icon={Save} label="Save Position" title={problem || 'Save your dashboard layout'} tone="action" onClick={save} disabled={savingLayout || !dirty || !!problem} />
        </div>
      </header>
      {problem && <p className="rounded-lg bg-neg/10 px-3 py-2 text-[13px] font-medium text-neg">{problem}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Tabs" hint="The tab strip, first one first. × takes a tab off it, Add brings it back.">
          <HeaderPickerStrip label="Tab" options={tabs} selectedIds={tabsShown} onChange={(ids) => setTop('tabs', ids, tabs.map((t) => t.id))} />
        </Card>
        <Card title="Overview Tabs" hint="They come after the tabs, in this order.">
          {overviews.length
            ? <HeaderPickerStrip label="Overview Tab" options={overviews} selectedIds={overviewsShown} onChange={(ids) => setTop('overviewTabs', ids, overviews.map((o) => o.id))} />
            : <p className="text-[13px] text-muted">This template has no overview tabs.</p>}
        </Card>
      </div>

      <Card title="Arrange a tab" hint="Pick a tab, then put its title cards, graphs and columns in the order you want.">
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
