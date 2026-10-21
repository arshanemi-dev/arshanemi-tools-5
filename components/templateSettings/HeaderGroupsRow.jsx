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

function Chip({ active, onClick, icon: Icon, children, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${
        active ? 'border-action bg-action text-white' : 'border-divider-light bg-background text-foreground hover:bg-card-hover'
      }`}
    >
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

// "Our Groups" — the row above the Our Header table (HeaderSection). Groups
// sort the headers: every header is in one group — the built-in General,
// where every header starts (locked: can't be renamed or deleted), or one
// made here (Add, then Rename / Delete on the picked group). Picking a group
// filters the table to it (`activeId` / `onActive`, null = All); "Assign
// headers" ticks which headers belong to it — ticking one moves it here out
// of its old group, unticking one sends it back to General (a header leaves
// General only by being put in another group). Whether a header shows on
// the dashboard is NOT its group — that's its own Show / Hide switch in the
// table. `g` = useHeaderGroups(); `headers` = the Our Headers in the editor.
// Every change is part of the Global Settings draft — Save New Version keeps it.
export default function HeaderGroupsRow({ g, headers = [], activeId, onActive }) {
  const { addToast } = useToast();
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);

  const counts = groupCounts(g.headerGroups, headers);
  const active = g.groups.find((x) => x.id === activeId) || null;
  const inGroup = (id) => headers.filter((h) => groupIdOf(g.headerGroups, h.id) === id);

  const nameProblem = (name, exceptId = null) => {
    const clean = String(name || '').trim().replace(/\s+/g, ' ');
    if (!clean) return 'Give the group a name';
    if (clean.length > NAME_MAX) return `A group name can be at most ${NAME_MAX} characters`;
    if (g.groups.some((x) => x.id !== exceptId && x.name.toLowerCase() === clean.toLowerCase())) return `There is already a group called “${clean}”`;
    return '';
  };
  const run = async (fn) => { setBusy(true); try { return await fn(); } finally { setBusy(false); } };

  const add = async (name) => {
    const problem = nameProblem(name);
    if (problem) { addToast(problem, 'error'); return; }
    if (await run(() => g.create(name.trim()))) setAdding(false);
  };
  const rename = async (name) => {
    const problem = nameProblem(name, active.id);
    if (problem) { addToast(problem, 'error'); return; }
    if (await run(() => g.rename(active.id, name.trim()))) setRenaming(false);
  };
  const remove = async () => {
    if (await run(() => g.remove(active.id))) onActive(null);
    setDeleting(false);
  };

  // The tick list's OK: ticked ones move into the group, unticked members
  // back to General (General itself has nowhere to send them, so there an
  // untick changes nothing).
  const isGeneral = active?.id === GENERAL_GROUP_ID;
  const assign = async (values) => {
    const members = inGroup(active.id).map((h) => h.id);
    const keep = new Set(values);
    const before = new Set(members);
    const added = values.filter((id) => !before.has(id));
    const removed = isGeneral ? [] : members.filter((id) => !keep.has(id));
    const back = GENERAL_GROUP_ID;
    const backName = g.groups.find((x) => x.id === back)?.name || 'General';
    if (!added.length && !removed.length) return;
    const ok = await run(async () => (await g.assign(added, active.id)) && (await g.assign(removed, back)));
    if (ok) {
      addToast([
        added.length && `${plural(added.length, 'header')} moved to “${active.name}”`,
        removed.length && `${plural(removed.length, 'header')} moved to “${backName}”`,
      ].filter(Boolean).join(' · ') + ' — Save New Version to keep it');
    }
  };

  return (
    <div className="mx-4 space-y-2 rounded-lg border border-divider bg-card px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[12.5px] font-semibold text-foreground">Our Groups</span>
        <Chip active={!active} onClick={() => onActive(null)} count={headers.length}>All</Chip>
        {g.groups.map((x) => (
          <Chip key={x.id} active={x.id === activeId} onClick={() => onActive(x.id === activeId ? null : x.id)} icon={KIND_ICON[x.kind]} count={counts[x.id] || 0}>
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

      {active && (
        <div className="flex flex-wrap items-center gap-2 border-t border-divider pt-2">
          {renaming ? (
            <NameBox initial={active.name} placeholder="Group name" onSave={rename} onCancel={() => setRenaming(false)} />
          ) : (
            <span className="text-[12px] text-muted">
              <span className="font-semibold text-foreground">{active.name}</span> · {plural(counts[active.id] || 0, 'header')}
              {isGeneral && <span className="text-subtle"> — every header starts here; built in, can&rsquo;t be renamed or deleted</span>}
            </span>
          )}
          <Popover
            align="left"
            trigger={(open) => (
              <span className={`inline-flex cursor-pointer items-center gap-1 rounded-full bg-action px-3 py-1 text-[12px] font-semibold text-white hover:bg-action-hover ${busy ? 'pointer-events-none opacity-50' : ''}`}>
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
              <button type="button" onClick={() => setRenaming(true)} title="Rename this group" className="inline-flex items-center gap-1 rounded-full border border-divider-light px-2.5 py-1 text-[12px] text-foreground hover:bg-card-hover"><Pencil size={12} /> Rename</button>
              <button type="button" onClick={() => setDeleting(true)} title="Delete this group" className="inline-flex items-center gap-1 rounded-full border border-neg/40 px-2.5 py-1 text-[12px] text-neg hover:bg-neg/10"><Trash2 size={12} /> Delete</button>
            </>
          )}
        </div>
      )}

      <p className="text-[11px] text-subtle">
        Groups sort your headers — a header is in one group at a time, and starts in General. Whether it shows on the dashboard is its own{' '}
        <span className="font-semibold text-muted">Show / Hide</span> switch in the table. Groups and switches are saved in the version, like the rest — Save New Version keeps them.
      </p>

      <ConfirmDialog
        open={deleting && !!active}
        title={`Delete group “${active?.name || ''}”?`}
        description={!(counts[active?.id] || 0) ? 'It has no headers.'
          : `Its ${plural(counts[active?.id], 'header')} go${counts[active?.id] === 1 ? 'es' : ''} back to General. Shown and hidden headers stay as they are.`}
        loading={busy}
        onConfirm={remove}
        onCancel={() => setDeleting(false)}
      />
    </div>
  );
}
