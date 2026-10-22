'use client';

import { Settings, Receipt } from 'lucide-react';
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

// The dashboard's page switcher, right under the navbar (it replaced the
// left sidebar): the tab strip — `strip`, the visible Tabs and Overview Tabs
// as ONE list, in the user's own order (Position Settings; an Overview Tab
// is any id in `overviewIds` and gets its own icon) — then, right-aligned
// for master_admin / granted users, Template Settings. Active tab = dark
// filled pill. One line that scrolls sideways when the tabs don't fit.
export default function DashboardTabBar({
  strip = [],
  overviewIds = new Set(),
  activeKey,
  onSelect,
  showTemplateSettings = false,
  onOpenTemplateSettings,
  // The always-available, non-configurable "one row per Order Id +
  // Transaction Id" view (see resolveTransactionRows) — only meaningful once
  // Order Id is mapped. Not part of the arranged strip. Hidden for now —
  // DashboardWorkspace doesn't pass these, so the tab never renders.
  showTransactions = false,
  transactionsActive = false,
  onOpenTransactions,
}) {
  return (
    <div className="border-b border-divider bg-background">
      <nav aria-label="Dashboard pages" className="flex w-full items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6 lg:px-10">
        {strip.map((t) => (
          <TabPill key={t.id} active={activeKey === t.id} icon={overviewIds.has(t.id) ? overviewIcon(t) : tabIcon(t)} label={t.name} onClick={() => onSelect(t.id)} />
        ))}

        {showTransactions && (
          <>
            <Divider />
            <TabPill active={transactionsActive} icon={Receipt} label="Transactions" onClick={onOpenTransactions} />
          </>
        )}

        {showTemplateSettings && (
          <span className="ml-auto flex shrink-0 items-center pl-2">
            <TabPill icon={Settings} label="Template" onClick={onOpenTemplateSettings} />
          </span>
        )}
      </nav>
    </div>
  );
}
