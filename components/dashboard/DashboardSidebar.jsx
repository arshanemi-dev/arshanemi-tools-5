'use client';

import { useMemo, useState } from 'react';
import {
  Search, Settings, Undo2, X, Layers, Receipt,
  LayoutDashboard, ShoppingCart, TrendingUp, LineChart, Package, Map as MapIcon, ClipboardCheck,
} from 'lucide-react';
import ArrangeControl from './ArrangeControl';
import HiddenItemsChip from './HiddenItemsChip';
import { useArrangeableList } from '@/lib/profitLoss/useArrangeableList';

const ICONS = {
  LayoutDashboard, ShoppingCart, Undo2, TrendingUp, LineChart, Package, Map: MapIcon, ClipboardCheck,
};

function NavRow({ active, icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] font-medium transition-colors ${
        active ? 'bg-footer text-white' : 'text-foreground/75 hover:bg-foreground/5 hover:text-foreground'
      }`}
    >
      {Icon && <Icon size={16} className="shrink-0" />}
      <span className="truncate">{label}</span>
    </button>
  );
}

// Edit-mode replacement for a plain NavRow list — each visible item carries
// its own ArrangeControl (swap-with dropdown + hide) instead of a separate
// checklist dropdown, and a HiddenItemsChip (only rendered once something is
// actually hidden) is the way back for anything ×'d out.
function EditableNavList({ items, section, onSectionChange, activeKey, onSelect, iconFor }) {
  const { visible, hidden, allItems, hiddenIds, swapWith, hide, show } =
    useArrangeableList(items, section, onSectionChange);

  return (
    <div className="flex flex-col gap-0.5">
      {visible.map((t) => {
        const Icon = iconFor ? iconFor(t) : Layers;
        const active = activeKey === t.id;
        return (
          <div
            key={t.id}
            className={`flex items-center gap-0.5 rounded-lg pl-1 pr-1.5 transition-colors ${
              active ? 'bg-footer text-white' : 'text-foreground/75 hover:bg-foreground/5 hover:text-foreground'
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(t.id)}
              className="flex flex-1 items-center gap-2.5 truncate rounded-lg px-2 py-2 text-left text-[13.5px] font-medium"
            >
              {Icon && <Icon size={16} className="shrink-0" />}
              <span className="truncate">{t.name}</span>
            </button>
            <ArrangeControl
              currentId={t.id}
              items={allItems}
              hiddenIds={hiddenIds}
              onSwapWith={(targetId) => swapWith(t.id, targetId)}
              onHide={() => hide(t.id)}
            />
          </div>
        );
      })}
      <div className="px-2 pt-1">
        <HiddenItemsChip hidden={hidden} onShow={show} />
      </div>
    </div>
  );
}

// The reference dashboard's left sidebar: a folder search + Reset + gear, then
// the nav list = the active template's visible tabs → its Overview tab(s) →
// (for master_admin / granted users) Template Settings. Active row = dark
// filled pill. Off-canvas drawer below lg.
export default function DashboardSidebar({
  tabs = [],
  activeKey,
  onSelect,
  overviewTabs = [],
  showTemplateSettings = false,
  onOpenTemplateSettings,
  onReset,
  mobileOpen = false,
  onClose = () => {},
  // Per-user "show/hide + reorder" edit mode — the Position Settings / Save
  // Position toggle that drives this now lives in DashboardToolbar (right
  // side of the upload-files bar); this component only needs to know
  // whether it's active, to switch the tab list to its arrange form.
  editMode = false,
  allTabs = [],
  tabsSection,
  onTabsSectionChange = () => {},
  allOverviewTabs = [],
  overviewTabsSection,
  onOverviewTabsSectionChange = () => {},
  // The always-available, non-configurable "one row per Order Id +
  // Transaction Id" view (see resolveTransactionRows) — only shown once
  // Order Id is actually mapped, since there's nothing to key rows by
  // otherwise. Lives outside the arrangeable tabs/overview lists (edit mode
  // never touches it), same spot Template Settings sits in.
  showTransactions = false,
  transactionsActive = false,
  onOpenTransactions,
}) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? tabs.filter((t) => t.name.toLowerCase().includes(s)) : tabs;
  }, [q, tabs]);
  const filteredOverviews = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? overviewTabs.filter((o) => (o.name || '').toLowerCase().includes(s)) : overviewTabs;
  }, [q, overviewTabs]);

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity lg:hidden ${mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-60 flex-col overflow-y-auto border-r border-divider bg-background py-4 shadow-xl transition-transform duration-300
        lg:static lg:z-auto lg:w-56 lg:flex-shrink-0 lg:translate-x-0 lg:shadow-none
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <button onClick={onClose} aria-label="Close menu" className="mb-1 mr-3 self-end rounded-lg p-1.5 text-foreground/60 hover:bg-foreground/5 lg:hidden">
          <X size={18} />
        </button>

        <div className="px-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search Folder…"
              className="w-full rounded-lg border border-divider bg-card py-1.5 pl-8 pr-2 text-[12.5px] focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        {editMode ? (
          // Edit mode: each tab carries its own ArrangeControl right where
          // it's listed — no separate dropdown/list split.
          <div className="mt-3 flex flex-col gap-3 px-2">
            <EditableNavList
              items={allTabs}
              section={tabsSection}
              onSectionChange={onTabsSectionChange}
              activeKey={activeKey}
              onSelect={onSelect}
              iconFor={(t) => ICONS[t.icon] || Layers}
            />
            {allOverviewTabs.length > 0 && (
              <>
                <div className="border-t border-divider" />
                <EditableNavList
                  items={allOverviewTabs}
                  section={overviewTabsSection}
                  onSectionChange={onOverviewTabsSectionChange}
                  activeKey={activeKey}
                  onSelect={onSelect}
                  iconFor={() => Layers}
                />
              </>
            )}
          </div>
        ) : (
          <nav className="mt-3 flex flex-col gap-0.5 px-2">
            {filtered.map((t) => (
              <NavRow
                key={t.id}
                active={activeKey === t.id}
                icon={ICONS[t.icon] || Layers}
                label={t.name}
                onClick={() => onSelect(t.id)}
              />
            ))}

            {filteredOverviews.length > 0 && (
              <>
                <div className="my-1 border-t border-divider" />
                {filteredOverviews.map((ov) => (
                  <NavRow key={ov.id} active={activeKey === ov.id} icon={Layers} label={ov.name} onClick={() => onSelect(ov.id)} />
                ))}
              </>
            )}
          </nav>
        )}

        {showTransactions && (
          <nav className="mt-3 flex flex-col gap-0.5 px-2">
            <div className="mb-1 border-t border-divider" />
            <NavRow active={transactionsActive} icon={Receipt} label="Transactions" onClick={onOpenTransactions} />
          </nav>
        )}

        {showTemplateSettings && (
          <nav className="mt-3 flex flex-col gap-0.5 px-2">
            <div className="mb-1 border-t border-divider" />
            <NavRow icon={Settings} label="Template Settings" onClick={onOpenTemplateSettings} />
          </nav>
        )}
      </aside>
    </>
  );
}
