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
import { emptySection } from '@/lib/profitLoss/layoutSections';
import { columnsModel, columnsSaved, marketplaceItems, overviewItems, sectionList, shownIds, stripSectionOf, tabItems, withDrafts, withStrip } from '@/lib/profitLoss/positionDraft';
import { partItems, partList } from '@/lib/profitLoss/tabParts';
import TabContentsPanel from './TabContentsPanel';
import TickOrderList, { listWords } from './TickOrderList';

const MARKET_WORDS = listWords('market place', 'market places', 'Market place order', 'Take off the list');
const TAB_WORDS = listWords('tab', 'tabs', 'Tab strip order', 'Take off the tab strip');
const STRIP_GROUPS = [{ id: 'tabs', name: 'Tabs' }, { id: 'overviews', name: 'Overview Tabs' }];
const PARTS = ['titleCards', 'graphs'];

// /profit-loss/position-settings — a signed-in user arranges their own
// dashboard here (the dashboard's Position button opens it): the Market
// Places the toolbar's picker offers, the tab strip — Tabs and Overview Tabs
// as one list, in any mix — and on each tab its Title Cards, Graphs and
// Columns (TabContentsPanel). Every list works the way the Columns one does
// (TickOrderList — My Details' two lists): tick what shows, put the ticked
// ones in order — only ever the template's own items for that place.
//
// It saves and resets in scopes (positionDraft.js withDrafts): Market Places
// + Tabs together, and each tab's contents one tab at a time — each with its
// own Reset (back to the template's arrangement — an unsaved change, Save
// keeps it) and Save (just that scope; the others stay as they are, saved or
// not). The header's Save all saves every scope with changes in one go;
// Reset all puts everything back and saves that at once. Every save goes to
// the same settings row the dashboard reads (useDashboardSettings
// saveArrangement). Leaving with unsaved changes asks first.
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

function SubPart({ title, children }) {
  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-xl border border-divider p-3">
      <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

// One scope's Reset + Save. `what` names it in the buttons' tooltips.
function ScopeActions({ what, dirty, problem, saving, onReset, onSave }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {dirty && <span className="text-[12px] font-medium text-link">Unsaved</span>}
      <IconButton icon={Undo2} label="Reset" title={`Reset ${what}`} tone="outline" onClick={onReset} disabled={saving} />
      <IconButton icon={Save} label="Save" title={problem || `Save ${what}`} tone="action" onClick={onSave} disabled={saving || !dirty || !!problem} />
    </div>
  );
}

const Problem = ({ children }) => <p className="rounded-lg bg-neg/10 px-3 py-2 text-[13px] font-medium text-neg">{children}</p>;
const Centered = ({ children }) => <div className="flex min-h-[60vh] items-center justify-center px-4">{children}</div>;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const without = (ids) => (p) => Object.fromEntries(Object.entries(p).filter(([id]) => !ids.includes(id)));

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

  // The edits, per scope, on top of the saved `layout`.
  const [draftTop, setDraftTop] = useState({}); // { marketplaces?, strip? }
  const [draftTabs, setDraftTabs] = useState({}); // { [tabId]: { titleCards?, graphs? } }
  const [draftCols, setDraftCols] = useState({}); // { [tabId]: { ticked: [ids], order: [ids] } }
  const [selectedId, setSelectedId] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const current = useMemo(() => withDrafts(layout, draftTop, draftTabs), [layout, draftTop, draftTabs]);

  const markets = useMemo(() => marketplaceItems(templates), [templates]);
  const marketIds = useMemo(() => markets.map((m) => m.id), [markets]);
  // The tab strip: Tabs and Overview Tabs as one list (stripSectionOf).
  const tabs = useMemo(() => tabItems(config), [config]);
  const overviews = useMemo(() => overviewItems(config), [config]);
  const strip = useMemo(
    () => [...tabs.map((t) => ({ ...t, groupId: 'tabs' })), ...overviews.map((o) => ({ ...o, groupId: 'overviews' }))],
    [tabs, overviews],
  );
  const tabById = new Map([...(config.tabs || []), ...(config.overviewTabs || [])].map((t) => [t.id, t]));
  const isOverview = (id) => overviews.some((o) => o.id === id);
  const modelFor = (tab, overview) => columnsModel(tab, config, current, myColumnsFor(tab.id, tab.headerIds || [], !overview), overview);

  // ── what is unsaved, scope by scope (compared as the lists show it) ──
  const stripSection = stripSectionOf(current, tabs, overviews);
  const topDirty = !same(sectionList(markets, current.marketplaces), sectionList(markets, layout.marketplaces))
    || !same(sectionList(strip, stripSection), sectionList(strip, stripSectionOf(layout, tabs, overviews)));
  const tabDirty = (id) => {
    const tab = tabById.get(id);
    if (!tab) return false;
    const partsMoved = PARTS.some((kind) => {
      const items = partItems(tab, config, kind);
      return !same(partList(items, current.perTab?.[id]?.[kind]), partList(items, layout.perTab?.[id]?.[kind]));
    });
    const e = draftCols[id];
    if (partsMoved || !e) return partsMoved;
    const m = modelFor(tab, isOverview(id));
    return !same([...e.ticked].sort(), [...m.shownIds].sort()) || !same(e.order, m.orderIds);
  };
  const dirtyTabIds = [...new Set([...Object.keys(draftTabs), ...Object.keys(draftCols)])].filter(tabDirty);
  const dirty = topDirty || dirtyTabIds.length > 0;

  // ── what stops a scope's save ──
  const marketsShown = shownIds(markets, current.marketplaces);
  const stripShown = shownIds(strip, stripSection);
  const onStrip = new Set(stripShown);
  const topProblem = markets.length && !marketsShown.length
    ? 'Keep at least one market place.'
    : !onStrip.size ? 'Keep at least one tab on the tab strip.' : '';
  // With none ticked a tab shows its default columns — unless it has none.
  const tabProblem = (id) => {
    const e = draftCols[id];
    const tab = tabById.get(id);
    if (!e || !tab || e.ticked.length) return '';
    return modelFor(tab, isOverview(id)).defaultIds.length ? `Tick at least one column on ${tab.name}.` : '';
  };
  const allProblem = (topDirty && topProblem) || dirtyTabIds.map(tabProblem).find(Boolean) || '';

  // Same as the dashboard: the saved row brought up to the live version
  // first — never while something here is being edited.
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

  // The tab row under the tab card: the strip's order, then any taken off it.
  const pickerTabs = [...stripShown, ...strip.map((t) => t.id).filter((id) => !onStrip.has(id))]
    .map((id) => strip.find((t) => t.id === id))
    .map((t) => ({ ...t, overview: isOverview(t.id), onStrip: onStrip.has(t.id) }));
  const activeId = pickerTabs.some((t) => t.id === selectedId) ? selectedId : pickerTabs[0]?.id ?? null;
  const activeTab = tabById.get(activeId) || null;
  const activeOverview = activeTab ? isOverview(activeTab.id) : false;

  const model = activeTab ? modelFor(activeTab, activeOverview) : null;
  const edit = activeTab ? draftCols[activeTab.id] : null;
  const columns = model && {
    model,
    ticked: new Set(edit ? edit.ticked : model.shownIds),
    order: edit ? edit.order : model.orderIds,
    onTicked: (set) => setDraftCols((p) => ({ ...p, [activeTab.id]: { order: p[activeTab.id]?.order ?? model.orderIds, ticked: [...set] } })),
    onOrder: (ids) => setDraftCols((p) => ({ ...p, [activeTab.id]: { ticked: p[activeTab.id]?.ticked ?? model.shownIds, order: ids } })),
  };

  const setMarkets = (next) => setDraftTop((p) => ({ ...p, marketplaces: next }));
  const setStrip = (next) => setDraftTop((p) => ({ ...p, strip: next }));
  const setTabPart = (kind, next) => setDraftTabs((p) => ({ ...p, [activeId]: { ...p[activeId], [kind]: next } }));

  // Reset = the template's own arrangement for that scope, as an unsaved
  // change — its Save keeps it. A tab's columns go back to the headers the
  // template picked for it, in its order.
  const resetTop = () => setDraftTop({ marketplaces: emptySection(), strip: emptySection() });
  const resetTab = (id) => {
    const tab = tabById.get(id);
    if (!tab) return;
    setDraftTabs((p) => ({ ...p, [id]: { titleCards: emptySection(), graphs: emptySection() } }));
    const m = modelFor(tab, isOverview(id));
    if (m.headers.length) setDraftCols((p) => ({ ...p, [id]: { ticked: [...m.defaultIds], order: [...m.allIds] } }));
  };

  // Save = the saved arrangement with just these scopes' edits put in; the
  // other scopes' edits stay where they are, unsaved.
  const commit = async ({ top = false, tabIds = [] }) => {
    let next = layout;
    if (top) next = withStrip({ ...next, marketplaces: current.marketplaces }, stripSection);
    const ticks = {};
    for (const id of tabIds) {
      const tab = tabById.get(id);
      if (!tab) continue;
      const own = { ...next.perTab?.[id], ...draftTabs[id] };
      const e = draftCols[id];
      if (e) {
        const m = modelFor(tab, isOverview(id));
        const saved = columnsSaved(tab, own.headers, m.allIds, e.order, e.ticked);
        own.headers = saved.section;
        ticks[id] = { ticks: saved.ticks, base: saved.base };
      }
      next = { ...next, perTab: { ...next.perTab, [id]: own } };
    }
    if (await saveArrangement({ layout: next, ticks })) {
      if (top) setDraftTop({});
      setDraftTabs(without(tabIds));
      setDraftCols(without(tabIds));
    }
  };
  const clearDrafts = () => { setDraftTop({}); setDraftTabs({}); setDraftCols({}); };

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

  const activeProblem = activeTab ? tabProblem(activeTab.id) : '';

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 sm:px-6 lg:px-10">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-foreground">Position Settings</h1>
          {/* <p className="text-[13px] text-muted">Arrange your own dashboard — its market places, the tab strip, and on each tab its title cards, graphs and columns. Only you see it.</p> */}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty && <span className="text-[12px] font-medium text-link">Unsaved changes</span>}
          <IconButton icon={Undo2} label="Reset all" title="Put everything back to the template's own arrangement, and save it" tone="outline" onClick={() => setConfirmReset(true)} disabled={savingLayout} />
          <IconButton icon={Save} label="Save all" title={allProblem || 'Save every change on this page'} tone="action" onClick={() => commit({ top: topDirty, tabIds: dirtyTabIds })} disabled={savingLayout || !dirty || !!allProblem} />
        </div>
      </header>

      <Card
        title="Market Places & Tabs"
        right={<ScopeActions what="the market places and tabs" dirty={topDirty} problem={topProblem} saving={savingLayout} onReset={resetTop} onSave={() => commit({ top: true })} />}
      >
        {topDirty && topProblem && <Problem>{topProblem}</Problem>}
        <SubPart title="Market Places">
          <TickOrderList items={markets} section={current.marketplaces} onChange={setMarkets} title="Market Places" words={MARKET_WORDS} />
        </SubPart>
        <SubPart title="Tabs">
          <TickOrderList items={strip} section={stripSection} onChange={setStrip} groups={overviews.length ? STRIP_GROUPS : null} title="Tabs" words={TAB_WORDS} />
        </SubPart>
      </Card>

      <Card
        title="Select Tabs and arrange Title Cards and Headers (Tabs Wise)"
        hint="Pick a tab, then put its title cards, graphs and columns in the order you want."
        right={activeTab && (
          <ScopeActions what={activeTab.name} dirty={dirtyTabIds.includes(activeTab.id)} problem={activeProblem} saving={savingLayout} onReset={() => resetTab(activeTab.id)} onSave={() => commit({ tabIds: [activeTab.id] })} />
        )}
      >
        {activeProblem && <Problem>{activeProblem}</Problem>}
        <TabContentsPanel
          config={config}
          layout={current}
          tabs={pickerTabs}
          dirtyIds={new Set(dirtyTabIds)}
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
        description="Your own arrangement — market places, tab order, and every tab's title cards, graphs and columns — goes back to what the template sets. It is saved straight away."
        confirmLabel="Reset"
        loadingLabel="Resetting…"
        loading={savingLayout}
        onConfirm={async () => { if (await resetLayout()) clearDrafts(); setConfirmReset(false); }}
        onCancel={() => { if (!savingLayout) setConfirmReset(false); }}
      />
    </div>
  );
}
