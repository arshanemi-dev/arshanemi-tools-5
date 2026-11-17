'use client';

import { useState } from 'react';
import { Check, ChevronDown, Lock, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import Popover from '@/components/dashboard/Popover';
import SearchChecklist from '@/components/dashboard/SearchChecklist';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { useToast } from '@/components/admin/Toast';
import { GENERAL_GROUP_ID, groupCounts, groupIdOf } from '@/lib/profitLoss/headerGroups';

const NAME_MAX = 80;
const KIND_ICON = { general: Lock };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// A multi-select chip — a tick box inside, on = its headers are in the table.
export function Chip({ active, mixed = false, onClick, icon: Icon, children, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={mixed ? 'mixed' : active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${
        active ? 'border-action bg-action text-white' : 'border-divider-light bg-background text-foreground hover:bg-card-hover'
      }`}
    >
      <span className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border ${active ? 'border-white bg-white text-action' : 'border-divider-light bg-background'}`}>
        {active && <Check size={10} strokeWidth={3} />}
        {!active && mixed && <span className="h-0.5 w-2 rounded bg-action" />}
      </span>
      {Icon && <Icon size={12} />}
      {children}
      <span className={`tabular-nums ${active ? 'text-white/80' : 'text-subtle'}`}>{count}</span>
    </button>
  );
}

// A group name box (Add / Rename) — Enter or ✓ saves, Escape or × cancels.
function NameBox({ initial = '', placeholder, onSave, onCancel }) {
  const [text, setText] = useState(initial);
  return (
    <span className="inline-flex items-center gap-1">
      <input
        autoFocus
        value={text}
        maxLength={NAME_MAX}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onSave(text); if (e.key === 'Escape') onCancel(); }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-40 rounded-full border border-accent bg-background px-3 py-1 text-[12px] text-foreground focus:outline-none"
      />
      <button type="button" onClick={() => onSave(text)} disabled={!text.trim()} title="Save" className="rounded p-1 text-action hover:bg-action-soft disabled:opacity-30"><Check size={13} /></button>
      <button type="button" onClick={onCancel} title="Cancel" className="rounded p-1 text-subtle hover:bg-card-hover hover:text-foreground"><X size={13} /></button>
    </span>
  );
}

// A group name problem, or '' — empty, too long, or already taken.
function nameProblemOf(groups, name, exceptId = null) {
  const clean = String(name || '').trim().replace(/\s+/g, ' ');
  if (!clean) return 'Give the group a name';
  if (clean.length > NAME_MAX) return `A group name can be at most ${NAME_MAX} characters`;
  if (groups.some((x) => x.id !== exceptId && x.name.toLowerCase() === clean.toLowerCase())) return `There is already a group called “${clean}”`;
  return '';
}

// "Categories" — one line above the Our Header table (HeaderSection): the
// header groups as multi-select chips (`selectedIds`, `onToggle(id)`,
// `onAll(on)`), all ticked by default — the table shows the ticked groups'
// headers, one "Our Headers (<group>)" column each — plus Add Group.
// Every header is in one group: the built-in General (locked) or one made
// here. Assign / Rename / Delete live in the toolbar (GroupManageControls).
// `g` = useHeaderGroups(); `headers` = the Our Headers in the editor.
export default function HeaderGroupsRow({ g, headers = [], selectedIds = [], onToggle, onAll }) {
  const { addToast } = useToast();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const counts = groupCounts(g.headerGroups, headers);
  const selected = new Set(selectedIds);
  const allOn = g.groups.length > 0 && g.groups.every((x) => selected.has(x.id));
  const someOn = g.groups.some((x) => selected.has(x.id));

  const add = async (name) => {
    const problem = nameProblemOf(g.groups, name);
    if (problem) { addToast(problem, 'error'); return; }
    setBusy(true);
    try { if (await g.create(name.trim())) setAdding(false); } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 px-4">
      <span className="w-24 shrink-0 text-[12.5px] font-semibold text-foreground">Categories</span>
      <Chip active={allOn} mixed={!allOn && someOn} onClick={() => onAll(!allOn)} count={headers.length}>All</Chip>
      {g.groups.map((x) => (
        <Chip key={x.id} active={selected.has(x.id)} onClick={() => onToggle(x.id)} icon={KIND_ICON[x.kind]} count={counts[x.id] || 0}>
          {x.name}
        </Chip>
      ))}
      {adding ? (
        <NameBox placeholder="Group name" onSave={add} onCancel={() => setAdding(false)} />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-divider-light px-3 py-1 text-[12px] font-medium text-action hover:bg-action-soft">
          <Plus size={12} /> Add Group
        </button>
      )}
      {busy && <Loader2 size={13} className="animate-spin text-subtle" />}
    </div>
  );
}

// The toolbar's group controls (after Mapped): pick a group, then Assign
// headers (tick its members — ticking one moves it here out of its old
// group, unticking one sends it back to General), and Rename / Delete for
// the admin's own groups. Every change is part of the Global Settings draft
// — Save New Version keeps it.
export function GroupManageControls({ g, headers = [] }) {
  const { addToast } = useToast();
  const [manageId, setManageId] = useState(GENERAL_GROUP_ID);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);

  const counts = groupCounts(g.headerGroups, headers);
  const active = g.groups.find((x) => x.id === manageId) || g.groups[0] || null;
  const inGroup = (id) => headers.filter((h) => groupIdOf(g.headerGroups, h.id) === id);
  const run = async (fn) => { setBusy(true); try { return await fn(); } finally { setBusy(false); } };
  if (!active) return null;

  const rename = async (name) => {
    const problem = nameProblemOf(g.groups, name, active.id);
    if (problem) { addToast(problem, 'error'); return; }
    if (await run(() => g.rename(active.id, name.trim()))) setRenaming(false);
  };
  const remove = async () => {
    if (await run(() => g.remove(active.id))) setManageId(GENERAL_GROUP_ID);
    setDeleting(false);
  };

  // The tick list's Save: ticked ones move into the group, unticked members
  // back to General (in General itself an untick changes nothing).
  const isGeneral = active.id === GENERAL_GROUP_ID;
  const assign = async (values) => {
    const members = inGroup(active.id).map((h) => h.id);
    const keep = new Set(values);
    const before = new Set(members);
    const added = values.filter((id) => !before.has(id));
    const removed = isGeneral ? [] : members.filter((id) => !keep.has(id));
    const backName = g.groups.find((x) => x.id === GENERAL_GROUP_ID)?.name || 'General';
    if (!added.length && !removed.length) return;
    const ok = await run(async () => (await g.assign(added, active.id)) && (await g.assign(removed, GENERAL_GROUP_ID)));
    if (ok) {
      addToast([
        added.length && `${plural(added.length, 'header')} moved to “${active.name}”`,
        removed.length && `${plural(removed.length, 'header')} moved to “${backName}”`,
      ].filter(Boolean).join(' · ') + ' — Save New Version to keep it');
    }
  };

  return (
    <>
      {renaming ? (
        <NameBox initial={active.name} placeholder="Group name" onSave={rename} onCancel={() => setRenaming(false)} />
      ) : (
        <select
          value={active.id}
          onChange={(e) => setManageId(e.target.value)}
          disabled={busy}
          aria-label="Group to assign headers to"
          title="The group Assign headers / Rename / Delete act on"
          className="rounded-full border border-divider-light bg-background px-2.5 py-1.5 text-[13px] font-medium text-foreground focus:border-accent focus:outline-none"
        >
          {g.groups.map((x) => <option key={x.id} value={x.id}>{x.name} ({counts[x.id] || 0})</option>)}
        </select>
      )}
      <Popover
        align="left"
        trigger={(open) => (
          <span className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-action px-3 py-1.5 text-[13px] font-semibold text-action hover:bg-action-soft ${busy ? 'pointer-events-none opacity-50' : ''}`}>
            Assign headers <ChevronDown size={12} className={open ? 'rotate-180' : ''} />
          </span>
        )}
      >
        {(close) => (
          <SearchChecklist
            label="headers"
            options={headers.map((h) => {
              const other = groupIdOf(g.headerGroups, h.id);
              return { value: h.id, label: h.name || 'Untitled', count: other === active.id ? null : g.groups.find((x) => x.id === other)?.name || null };
            })}
            initial={inGroup(active.id).map((h) => h.id)}
            onSubmit={assign}
            onClose={close}
            okLabel="Save"
            allowEmpty
            narrowOnSearch={false}
            placeholder="Search headers…"
            emptyText="No headers yet."
          />
        )}
      </Popover>
      {active.kind === 'custom' && !renaming && (
        <>
          <button type="button" onClick={() => setRenaming(true)} title={`Rename group “${active.name}”`} aria-label={`Rename group ${active.name}`} className="rounded-full border border-divider-light p-1.5 text-foreground hover:bg-card-hover"><Pencil size={13} /></button>
          <button type="button" onClick={() => setDeleting(true)} title={`Delete group “${active.name}”`} aria-label={`Delete group ${active.name}`} className="rounded-full border border-neg/40 p-1.5 text-neg hover:bg-neg/10"><Trash2 size={13} /></button>
        </>
      )}
      {busy && <Loader2 size={13} className="animate-spin text-subtle" />}

      <ConfirmDialog
        open={deleting}
        title={`Delete group “${active.name}”?`}
        description={!(counts[active.id] || 0) ? 'It has no headers.'
          : `Its ${plural(counts[active.id], 'header')} go${counts[active.id] === 1 ? 'es' : ''} back to General. Shown and hidden headers stay as they are.`}
        loading={busy}
        onConfirm={remove}
        onCancel={() => setDeleting(false)}
      />
    </>
  );
}
