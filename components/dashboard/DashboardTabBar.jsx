'use client';

import { Settings, Receipt } from 'lucide-react';
import ArrangeControl from './ArrangeControl';
import HiddenItemsChip from './HiddenItemsChip';
import { useArrangeableList } from '@/lib/profitLoss/useArrangeableList';
import { DEFAULT_OVERVIEW_ICON, DEFAULT_TAB_ICON, tabIconFor } from './tabIcons';

// Each Tab / Overview Tab's own icon, picked in Template Settings.
const tabIcon = (t) => tabIconFor(t.icon, DEFAULT_TAB_ICON);
const overviewIcon = (o) => tabIconFor(o.icon, DEFAULT_OVERVIEW_ICON);

const PILL = 'inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg text-[13.5px] font-medium transition-colors';
const pillTone = (active) => (active ? 'bg-footer text-white' : 'text-foreground/75 hover:bg-foreground/5 hover:text-foreground');

function TabPill({ active = false, icon: Icon, label, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-current={active ? 'page' : undefined} className={`${PILL} px-3 py-1.5 ${pillTone(active)}`}>
      {Icon && <Icon size={16} className="shrink-0" />}
      {label}
    </button>
  );
}

const Divider = () => <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-divider" />;

// Edit-mode replacement for a plain run of TabPills — each visible tab
// carries its own ArrangeControl (swap-with dropdown + hide), and a
// HiddenItemsChip (only rendered once something is actually hidden) is the
// way back for anything ×'d out.
function EditableTabs({ items, section, onSectionChange, activeKey, onSelect, iconFor }) {
  const { visible, hidden, allItems, hiddenIds, swapWith, hide, show } =
    useArrangeableList(items, section, onSectionChange);

  return (
    <>
      {visible.map((t) => {
        const Icon = iconFor(t);
        const active = activeKey === t.id;
        return (
          <span key={t.id} className={`${PILL} pr-1.5 ${pillTone(active)}`}>
            <button type="button" onClick={() => onSelect(t.id)} aria-current={active ? 'page' : undefined} className="inline-flex items-center gap-2 py-1.5 pl-3">
              {Icon && <Icon size={16} className="shrink-0" />}
              {t.name}
            </button>
            <ArrangeControl
              currentId={t.id}
              items={allItems}
              hiddenIds={hiddenIds}
              onSwapWith={(targetId) => swapWith(t.id, targetId)}
              onHide={() => hide(t.id)}
            />
          </span>
        );
      })}
      <HiddenItemsChip hidden={hidden} onShow={show} />
    </>
  );
}

// The dashboard's page switcher, right under the navbar (it replaced the
// left sidebar): the active template's visible Tabs → its Overview Tab(s),
// then — right-aligned, for master_admin / granted users — Template
// Settings. Active tab = dark filled pill. One line that scrolls sideways
// when the tabs don't fit; while arranging (edit mode) it wraps instead, as
// a scrolling line would clip each tab's swap / hide menu.
export default function DashboardTabBar({
  tabs = [],
  activeKey,
  onSelect,
  overviewTabs = [],
  showTemplateSettings = false,
  onOpenTemplateSettings,
  // Per-user "show/hide + reorder" edit mode — the Position Settings / Save
  // Position toggle that drives this lives in DashboardToolbar; this
  // component only needs to know whether it's active, to switch the tabs to
  // their arrange form.
  editMode = false,
  allTabs = [],
  tabsSection,
  onTabsSectionChange = () => {},
  allOverviewTabs = [],
  overviewTabsSection,
  onOverviewTabsSectionChange = () => {},
  // The always-available, non-configurable "one row per Order Id +
  // Transaction Id" view (see resolveTransactionRows) — only meaningful once
  // Order Id is mapped. Outside the arrangeable lists (edit mode never
  // touches it). Hidden for now — DashboardWorkspace doesn't pass these, so
  // the tab never renders.
  showTransactions = false,
  transactionsActive = false,
  onOpenTransactions,
}) {
  return (
    <div className="border-b border-divider bg-background">
      <nav
        aria-label="Dashboard pages"
        className={`flex w-full items-center gap-1 px-4 py-2 sm:px-6 lg:px-10 ${editMode ? 'flex-wrap' : 'overflow-x-auto'}`}
      >
        {editMode ? (
          <>
            <EditableTabs
              items={allTabs}
              section={tabsSection}
              onSectionChange={onTabsSectionChange}
              activeKey={activeKey}
              onSelect={onSelect}
              iconFor={tabIcon}
            />
            {allOverviewTabs.length > 0 && (
              <>
                <Divider />
                <EditableTabs
                  items={allOverviewTabs}
                  section={overviewTabsSection}
                  onSectionChange={onOverviewTabsSectionChange}
                  activeKey={activeKey}
                  onSelect={onSelect}
                  iconFor={overviewIcon}
                />
              </>
            )}
          </>
        ) : (
          <>
            {tabs.map((t) => (
              <TabPill key={t.id} active={activeKey === t.id} icon={tabIcon(t)} label={t.name} onClick={() => onSelect(t.id)} />
            ))}
            {overviewTabs.length > 0 && (
              <>
                <Divider />
                {overviewTabs.map((ov) => (
                  <TabPill key={ov.id} active={activeKey === ov.id} icon={overviewIcon(ov)} label={ov.name} onClick={() => onSelect(ov.id)} />
                ))}
              </>
            )}
          </>
        )}

        {showTransactions && (
          <>
            <Divider />
            <TabPill active={transactionsActive} icon={Receipt} label="Transactions" onClick={onOpenTransactions} />
          </>
        )}

        {showTemplateSettings && (
          <span className="ml-auto flex shrink-0 items-center pl-2">
            <TabPill icon={Settings} label="Template Settings" onClick={onOpenTemplateSettings} />
          </span>
        )}
      </nav>
    </div>
  );
}
