'use client';

import { useMemo, useState } from 'react';
import {
  Search, RotateCcw, Settings, X, Layers,
  LayoutDashboard, ShoppingCart, Undo2, TrendingUp, LineChart, Package, Map as MapIcon, ClipboardCheck,
} from 'lucide-react';

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

        <div className="flex items-center gap-1.5 px-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search Folder…"
              className="w-full rounded-lg border border-divider bg-card py-1.5 pl-8 pr-2 text-[12.5px] focus:border-accent focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={onReset}
            className="rounded-lg border border-divider px-2 py-1.5 text-[12px] font-medium text-muted hover:bg-card-hover"
            title="Reset filters + tab"
          >
            <RotateCcw size={13} />
          </button>
          {showTemplateSettings && (
            <button
              type="button"
              onClick={onOpenTemplateSettings}
              className="rounded-lg border border-divider px-2 py-1.5 text-muted hover:bg-card-hover"
              title="Template Settings"
            >
              <Settings size={14} />
            </button>
          )}
        </div>

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

          {showTemplateSettings && (
            <>
              <div className="my-1 border-t border-divider" />
              <NavRow icon={Settings} label="Template Settings" onClick={onOpenTemplateSettings} />
            </>
          )}
        </nav>
      </aside>
    </>
  );
}
