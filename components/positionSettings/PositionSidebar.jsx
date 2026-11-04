'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';

// Position Settings' left rail — the same look as Template Settings'
// BuilderSidebar: one shortcut per section of the page, and the main column
// shows only the one picked. `sections` = [{ key, label, icon, dirty? }];
// the one with `tabs: true` is an accordion listing every Tab / Overview Tab
// (`tabs` = [{ id, name, overview, onStrip }]) with its own search box —
// picking one opens that section on that tab. `dirtyTabIds` puts a dot on a
// tab with unsaved changes.
function Dot() {
  return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-link" title="Unsaved changes" />;
}

function SectionRow({ section, active, open, onClick, count }) {
  const Icon = section.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-1.5 border-b border-divider px-3.5 py-2.5 text-left text-[12.5px] font-bold hover:bg-card-hover ${
        active ? 'bg-accent/10 text-foreground' : 'text-foreground'
      }`}
    >
      {section.tabs && (open ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}
      {Icon && <Icon size={13} />}
      <span className="min-w-0 flex-1 truncate">{section.label}</span>
      {count != null && <span className="text-[11px] font-normal text-subtle">· {count}</span>}
      {section.dirty && <Dot />}
    </button>
  );
}

function TabList({ tabs, selectedId, active, dirtyTabIds, onPick }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? tabs.filter((t) => String(t.name || '').toLowerCase().includes(s)) : tabs;
  }, [q, tabs]);

  return (
    <div className="border-b border-divider px-2 py-2">
      <div className="relative mb-1.5">
        <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="w-full rounded-md border border-divider bg-background py-1 pl-6 pr-2 text-[11.5px] focus:border-accent focus:outline-none"
        />
      </div>
      <ul className="space-y-0.5">
        {filtered.length === 0 && <li className="px-2 py-1.5 text-center text-[11px] text-subtle">{tabs.length ? 'No match.' : 'None yet.'}</li>}
        {filtered.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onPick(t.id)}
              className={`flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-[12px] transition-colors ${
                active && selectedId === t.id ? 'bg-accent/10 font-semibold text-foreground' : 'text-muted hover:bg-card-hover'
              }`}
            >
              <span className={`min-w-0 flex-1 truncate ${t.onStrip ? '' : 'opacity-60'}`}>
                {t.name || 'Untitled'}
                {t.overview && <span className="ml-1 text-[10px] uppercase text-subtle">overview</span>}
              </span>
              {dirtyTabIds.has(t.id) && <Dot />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PositionSidebar({
  sections, openKey, onOpen, tabs = [], selectedTabId, onSelectTab, dirtyTabIds = new Set(),
  mobileOpen = false, onCloseMobile = () => {},
}) {
  const [tabsOpen, setTabsOpen] = useState(true);

  return (
    <>
      <div
        onClick={onCloseMobile}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity lg:hidden ${mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-64 flex-col overflow-y-auto border-r border-divider bg-background shadow-xl transition-transform duration-300
        lg:static lg:z-auto lg:w-64 lg:flex-shrink-0 lg:translate-x-0 lg:shadow-none
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-divider px-3 py-2.5">
          <span className="text-[13px] font-bold text-foreground">Position Settings</span>
          <button onClick={onCloseMobile} aria-label="Close" className="rounded p-1 text-subtle hover:bg-card-hover lg:hidden">
            <X size={16} />
          </button>
        </div>

        {sections.map((s) => (
          <div key={s.key}>
            <SectionRow
              section={s}
              active={openKey === s.key}
              open={s.tabs && tabsOpen}
              count={s.tabs ? tabs.length : null}
              onClick={() => {
                if (s.tabs) setTabsOpen((o) => (openKey === s.key ? !o : true));
                onOpen(s.key);
              }}
            />
            {s.tabs && tabsOpen && (
              <TabList
                tabs={tabs}
                selectedId={selectedTabId}
                active={openKey === s.key}
                dirtyTabIds={dirtyTabIds}
                onPick={(id) => { onSelectTab(id); onOpen(s.key); }}
              />
            )}
          </div>
        ))}
      </aside>
    </>
  );
}
