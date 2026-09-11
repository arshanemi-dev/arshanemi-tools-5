'use client';

import { useMemo, useState } from 'react';
import {
  Check, ChevronDown, ChevronRight, Loader2, Pencil, Plus, Search, Settings, Store, Trash2, X,
} from 'lucide-react';
import {
  makeFileSlot, makeGraph, makeHeader, makeOverviewTab, makeTab, makeTitleCard,
} from '@/data/templateSchema';

// One left rail for the whole builder (image 2). The top block lists every
// marketplace (add / rename / delete / switch). Below it, for the active
// marketplace, one collapsible group per section lists its entities — files,
// headers, title cards, tabs, graphs — each with its own search box and
// inline rename / delete, plus an "add" on the group header. `overview` and
// `version` are read-only jump rows.
//
// The Settings toggle at the top puts every group into reorder mode: each row
// becomes a dropdown you can swap another item into (picking one swaps the
// two positions — a poor man's drag-and-drop). Tabs reorder by swapping their
// `order` field (that's what the live dashboard actually sorts by); every
// other group swaps its raw array position (cosmetic — those lists don't
// have an inherent order, tab/title-card/header/graph *display* order inside
// a Tab is its own reorderable strip via HeaderPickerStrip). While reorder
// mode is on, each group's "+Add" button turns into a "Save" (done) button.

const GROUPS = [
   {
    key: 'header', label: 'Header', anchor: 'section-header',
    listKey: 'headers', nameField: 'name', addLabel: 'Add New Header',
    make: (n) => makeHeader({ name: `Header ${n}`, type: 'number', source: 'manual' }),
    canDelete: (it) => it.source !== 'default',
    meta: (it) => (it.source === 'default' ? 'default' : it.source === 'extracted' ? 'sheet' : ''),
  },
   {
    key: 'graph', label: 'Graph', anchor: 'section-graph',
    listKey: 'graphs', nameField: 'name', addLabel: 'Add Graph',
    make: (n) => makeGraph(`Graph ${n}`, 'line'),
  },
  {
    key: 'file', label: 'Files', anchor: 'section-market-place',
    listKey: 'fileSlots', nameField: 'label', addLabel: 'Add File',
    make: (n) => makeFileSlot(`File ${n}`, 'aux'),
  },
 
  {
    key: 'titleCard', label: 'Title Card', anchor: 'section-title-card',
    listKey: 'titleCards', nameField: 'name', addLabel: 'Add Title Card',
    make: (n) => makeTitleCard(`Title Card ${n}`),
  },
  {
    key: 'tab', label: 'Tab', anchor: 'section-tab',
    listKey: 'tabs', nameField: 'name', addLabel: 'Add New Tab',
    make: (n) => makeTab(`Tab ${n}`, n - 1),
    orderField: 'order',
    sortBy: (a, b) => (a.order ?? 0) - (b.order ?? 0),
  },
  {
    key: 'overview', label: 'Overview Tab', anchor: 'section-overview',
    listKey: 'overviewTabs', nameField: 'name', addLabel: 'Add Overview Tab',
    make: (n) => makeOverviewTab(`Overview ${n}`, n - 1),
    orderField: 'order',
    sortBy: (a, b) => (a.order ?? 0) - (b.order ?? 0),
  },
];

function RowShell({ selected, onOpen, meta, name, onRename, onDelete, canDelete = true }) {
  return (
    <div
      className={`group/item flex items-center gap-1 rounded-md px-2 py-1 text-[12px] transition-colors ${
        selected ? 'bg-accent/10 font-semibold text-foreground' : 'text-muted hover:bg-card-hover'
      }`}
    >
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 truncate text-left">
        {name || 'Untitled'}
        {meta ? <span className="ml-1 text-[10px] uppercase text-subtle">{meta}</span> : null}
      </button>
      {onRename && (
        <button type="button" onClick={onRename} title="Rename" className="shrink-0 rounded p-0.5 text-subtle opacity-0 hover:text-foreground group-hover/item:opacity-100">
          <Pencil size={11} />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          disabled={!canDelete}
          onClick={onDelete}
          title={canDelete ? 'Delete' : 'Default — can’t delete'}
          className="shrink-0 rounded p-0.5 text-subtle opacity-0 hover:text-neg group-hover/item:opacity-100 disabled:opacity-0"
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  );
}

function SearchBox({ value, onChange }) {
  return (
    <div className="relative mb-1.5">
      <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-subtle" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search…"
        className="w-full rounded-md border border-divider bg-background py-1 pl-6 pr-2 text-[11.5px] focus:border-accent focus:outline-none"
      />
    </div>
  );
}

// ── Marketplaces (top block) — templates list ─────────────────────────────
function MarketplacesBlock({ templates, activeId, onSwitch, onAdd, onRename, onDelete, open, onToggle }) {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState('');
  const loading = templates === null;
  const list = useMemo(() => templates || [], [templates]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? list.filter((t) => (t.marketplaceName || '').toLowerCase().includes(s)) : list;
  }, [q, list]);
  // An empty list has nothing to collapse and needs its add button reachable.
  const expanded = open || list.length === 0;

  return (
    <div className="border-b border-divider bg-card/40">
      <div className="flex items-center gap-1 px-2 py-2">
        <button type="button" onClick={onToggle} className="flex flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[12.5px] font-bold text-foreground hover:bg-card-hover">
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <Store size={13} /> Market Place
          <span className="text-[11px] font-normal text-subtle">· {list.length}</span>
        </button>
        <button type="button" onClick={onAdd} title="Add New Market Place" className="rounded-md p-1 text-action hover:bg-action-soft">
          <Plus size={13} />
        </button>
      </div>

      {expanded && (
      <div className="px-2 pb-2">
        {loading ? (
          <div className="flex justify-center py-3 text-subtle"><Loader2 size={14} className="animate-spin" /></div>
        ) : list.length === 0 ? (
          <button
            type="button"
            onClick={onAdd}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-divider-light px-2.5 py-2 text-[12px] font-semibold text-action hover:bg-action-soft"
          >
            <Plus size={13} /> Add New Market Place
          </button>
        ) : (
          <>
            <SearchBox value={q} onChange={setQ} />
            <ul className="space-y-0.5">
              {filtered.length === 0 && <li className="px-2 py-1.5 text-center text-[11px] text-subtle">No match.</li>}
              {filtered.map((t) =>
                editing === t.id ? (
                  <li key={t.id}>
                    <input
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onBlur={() => { if (editText.trim()) onRename(t.id, editText.trim()); setEditing(null); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { if (editText.trim()) onRename(t.id, editText.trim()); setEditing(null); }
                        if (e.key === 'Escape') setEditing(null);
                      }}
                      className="w-full rounded-md border border-accent bg-background px-2 py-1 text-[12px] focus:outline-none"
                    />
                  </li>
                ) : (
                  <li key={t.id}>
                    <RowShell
                      selected={t.id === activeId}
                      name={t.marketplaceName}
                      meta={t.isLive ? 'live' : ''}
                      onOpen={() => onSwitch(t.id)}
                      onRename={() => { setEditing(t.id); setEditText(t.marketplaceName || ''); }}
                      onDelete={() => onDelete(t.id)}
                    />
                  </li>
                ),
              )}
            </ul>
          </>
        )}
      </div>
      )}
    </div>
  );
}

// ── One config-driven section group (accordion — one open at a time) ──────
function GroupBlock({ group, draft, selectedId, onSelect, open, onToggle, reorderMode, onExitReorder }) {
  const { config, addItem, patchItem, removeItem, patchConfig } = draft;
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState('');
  const selectionKey = group.selectionKey || group.key;

  const items = useMemo(() => {
    let list = (config[group.listKey] || []).filter(group.filter || (() => true));
    if (group.sortBy) list = [...list].sort(group.sortBy);
    return list;
  }, [config, group.listKey, group.filter, group.sortBy]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? items.filter((it) => String(it[group.nameField] || '').toLowerCase().includes(s)) : items;
  }, [q, items, group.nameField]);

  const add = () => {
    if (!open) onToggle();
    const it = group.make(items.length + 1);
    addItem(group.listKey, it);
    onSelect(selectionKey, it.id, group.anchor);
  };
  const commitRename = (id) => {
    if (editText.trim()) patchItem(group.listKey, id, { [group.nameField]: editText.trim() });
    setEditing(null);
  };
  const del = (id) => {
    removeItem(group.listKey, id);
    if (selectedId === id) onSelect(selectionKey, null, group.anchor);
  };
  const swap = (id, otherId) => {
    if (!otherId || otherId === id) return;
    if (group.orderField) {
      const a = items.find((x) => x.id === id);
      const b = items.find((x) => x.id === otherId);
      if (!a || !b) return;
      const field = group.orderField;
      patchItem(group.listKey, a.id, { [field]: b[field] });
      patchItem(group.listKey, b.id, { [field]: a[field] });
    } else {
      const list = config[group.listKey] || [];
      const ia = list.findIndex((x) => x.id === id);
      const ib = list.findIndex((x) => x.id === otherId);
      if (ia === -1 || ib === -1) return;
      const next = [...list];
      [next[ia], next[ib]] = [next[ib], next[ia]];
      patchConfig({ [group.listKey]: next });
    }
  };

  return (
    <div className="border-b border-divider">
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button type="button" onClick={onToggle} className="flex flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[12.5px] font-bold text-foreground hover:bg-card-hover">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {group.label}
          <span className="text-[11px] font-normal text-subtle">· {items.length}</span>
        </button>
        {reorderMode ? (
          <button type="button" onClick={onExitReorder} title="Done reordering" className="rounded-md p-1 text-action hover:bg-action-soft">
            <Check size={13} />
          </button>
        ) : !group.noAdd && (
          <button type="button" onClick={add} title={group.addLabel} className="rounded-md p-1 text-action hover:bg-action-soft">
            <Plus size={13} />
          </button>
        )}
      </div>

      {open && (
        <div className="px-2 pb-2">
          {reorderMode ? (
            <ul className="space-y-1">
              {items.length === 0 && <li className="px-2 py-1.5 text-center text-[11px] text-subtle">None yet.</li>}
              {items.map((it) => (
                <li key={it.id}>
                  <select
                    value={it.id}
                    onChange={(e) => swap(it.id, e.target.value)}
                    className="w-full rounded-md border border-divider bg-background px-2 py-1 text-[12px] focus:border-accent focus:outline-none"
                  >
                    {items.map((opt) => <option key={opt.id} value={opt.id}>{opt[group.nameField] || 'Untitled'}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <SearchBox value={q} onChange={setQ} />
              <ul className="space-y-0.5">
                {filtered.length === 0 && (
                  <li className="px-2 py-1.5 text-center text-[11px] text-subtle">{items.length ? 'No match.' : 'None yet.'}</li>
                )}
                {filtered.map((it) =>
                  editing === it.id ? (
                    <li key={it.id}>
                      <input
                        autoFocus
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onBlur={() => commitRename(it.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename(it.id);
                          if (e.key === 'Escape') setEditing(null);
                        }}
                        className="w-full rounded-md border border-accent bg-background px-2 py-1 text-[12px] focus:outline-none"
                      />
                    </li>
                  ) : (
                    <li key={it.id}>
                      <RowShell
                        selected={selectedId === it.id}
                        name={it[group.nameField]}
                        meta={group.meta?.(it)}
                        canDelete={group.canDelete ? group.canDelete(it) : true}
                        onOpen={() => onSelect(selectionKey, it.id, group.anchor)}
                        onRename={() => { setEditing(it.id); setEditText(it[group.nameField] || ''); }}
                        onDelete={() => del(it.id)}
                      />
                    </li>
                  ),
                )}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StaticRow({ label, count, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-1.5 border-b border-divider px-3.5 py-2 text-left text-[12.5px] font-bold hover:bg-card-hover ${
        active ? 'bg-accent/10 text-foreground' : 'text-foreground'
      }`}
    >
      {label}
      {count != null && <span className="text-[11px] font-normal text-subtle">· {count}</span>}
    </button>
  );
}

export default function BuilderSidebar({
  draft, selection, onSelect,
  templates, activeTemplateId, onSwitchTemplate, onAddMarketplace, onRenameMarketplace, onDeleteMarketplace,
  mobileOpen = false, onCloseMobile = () => {},
}) {
  const hasActive = !!activeTemplateId;
  const jumpOnly = (anchor) => onSelect('__jump__', null, anchor);

  // Accordion — one section open at a time; all collapsed by default.
  const [openKey, setOpenKey] = useState(null);
  const toggle = (key, anchor) => {
    const willOpen = openKey !== key;
    setOpenKey(willOpen ? key : null);
    if (willOpen && anchor) {
      requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };

  // Settings toggle — reorder mode for every group at once (see GROUPS comment).
  const [reorderMode, setReorderMode] = useState(false);

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
          <span className="text-[13px] font-bold text-foreground">Builder</span>
          <div className="flex items-center gap-1.5">
            {hasActive && (
              reorderMode ? (
                <button
                  type="button"
                  onClick={() => setReorderMode(false)}
                  className="inline-flex items-center gap-1 rounded-full bg-action px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-action-hover"
                >
                  <Check size={12} /> Save
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setReorderMode(true)}
                  title="Reorder lists"
                  className="inline-flex items-center gap-1 rounded-full border border-divider px-2.5 py-1 text-[11.5px] font-medium text-subtle hover:bg-card-hover hover:text-foreground"
                >
                  <Settings size={13} /> Settings
                </button>
              )
            )}
            <button onClick={onCloseMobile} aria-label="Close" className="rounded p-1 text-subtle hover:bg-card-hover lg:hidden">
              <X size={16} />
            </button>
          </div>
        </div>

        <MarketplacesBlock
          templates={templates}
          activeId={activeTemplateId}
          onSwitch={onSwitchTemplate}
          onAdd={onAddMarketplace}
          onRename={onRenameMarketplace}
          onDelete={onDeleteMarketplace}
          open={openKey === 'marketPlace'}
          onToggle={() => toggle('marketPlace')}
        />

        {hasActive && (
          <>
            {GROUPS.map((g) => (
              <GroupBlock
                key={g.key}
                group={g}
                draft={draft}
                selectedId={selection[g.selectionKey || g.key]}
                onSelect={onSelect}
                open={openKey === g.key}
                onToggle={() => toggle(g.key, g.anchor)}
                reorderMode={reorderMode}
                onExitReorder={() => setReorderMode(false)}
              />
            ))}
            <StaticRow
              label="Version Page"
              count={draft.versions?.length ?? 0}
              onClick={() => jumpOnly('section-version')}
            />
          </>
        )}
      </aside>
    </>
  );
}
