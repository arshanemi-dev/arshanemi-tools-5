'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import { AGGREGATE_BUILTIN_NAMES, HEADER_DESCRIPTION_MAX_CHARS, HEADER_DESCRIPTION_MAX_WORDS, capWords, makeHeader, wordCount } from '@/data/templateSchema';
import { fixedHeaderHint, fixedHeaderType, isReviewField } from '@/data/fixedHeaders';
import { isOurHeader } from '@/lib/profitLoss/headerUsage';
import TypeToggle from './TypeToggle';
import FormulaEditor from './FormulaEditor';

const FORMATS = ['money', 'int', 'pct', 'text'];

// Add / Edit one Our Header in a popup — name, type, format, show-in-table
// and the formula builder, plus a Description (≤ 300 words — the ⓘ tooltip
// at the end of its dashboard column). Works on a local copy: nothing touches the draft
// until Save (Cancel / × discards). Mount it with a `key` per open so the
// copy starts fresh each time. `onSave(header)` gets the full header.
// `usages` (editing only) = where the header is used: `formulas` name it and
// are rewritten on a rename (withHeaderUpdate), `others` (Tabs, Graphs,
// marketplace mappings…) point at it by id and simply follow.
export default function HeaderEditModal({ open, header = null, headers = [], usages = null, onClose, onSave }) {
  const [form, setForm] = useState(() => (header ? { ...header } : makeHeader({ name: '', type: 'number', source: 'manual' })));
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const isNew = !header;
  const reserved = !!form.reserved;
  const fixedHint = fixedHeaderHint(form); // '' unless it's a built-in Account Name / SKU Cost header
  const canSave = form.name.trim().length > 0;
  // A built-in header (Master SKU, the costs, Account Name) can be worked out
  // by a formula instead of filled by the dashboard — its name stays locked.
  // Not Review / Reason: those are picked by hand on the dashboard.
  const builtInType = fixedHeaderType(form);
  const canUseFormula = !!builtInType && !isReviewField(form);
  const usesFormula = form.type === 'formula';
  const setUsesFormula = (on) => set(on
    ? { type: 'formula', format: builtInType === 'text' ? 'text' : form.format || 'money' }
    : { type: builtInType, formula: '', format: builtInType === 'text' ? 'text' : form.format === 'text' ? 'money' : form.format || 'money' });

  const others = headers.filter((h) => h.id !== form.id);
  const refNames = [...others.map((h) => h.name), ...AGGREGATE_BUILTIN_NAMES];
  const listNames = [...others.filter(isOurHeader).map((h) => h.name), ...AGGREGATE_BUILTIN_NAMES]; // Header List: Our Headers only
  const previewScope = Object.fromEntries(refNames.map((n) => [n, 100]));
  const dateNames = others.filter((h) => h.type === 'date').map((h) => h.name);
  // A Date header has one way to be shown (a local date), so no Format to pick.
  const setType = (type) => set(type === 'date' ? { type, format: 'text' } : form.type === 'date' ? { type, format: type === 'text' || type === 'alphanumeric' ? 'text' : 'money' } : { type });

  const words = wordCount(form.description);
  const renaming = !isNew && form.name.trim() && form.name.trim() !== header.name;
  const usedAnywhere = !!(usages?.formulas.length || usages?.others.length);

  const save = () => { if (canSave) onSave({ ...form, name: form.name.trim(), description: String(form.description || '').trim() }); };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isNew ? 'Add Header' : `Edit Header — ${header.name}`}
      maxWidth="max-w-2xl"
      footer={(
        <div className="flex w-full justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-divider px-4 py-1.5 text-[13px] font-medium text-muted hover:bg-card-hover">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={!canSave} className="inline-flex items-center gap-1.5 rounded-full bg-action px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-action-hover disabled:opacity-40">
            <Check size={14} /> Save
          </button>
        </div>
      )}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-muted">Header name</span>
        <input
          autoFocus
          value={form.name}
          onChange={(e) => set({ name: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
          placeholder="Enter Header name"
          disabled={reserved}
          title={fixedHint ? 'Built-in header — name is locked' : reserved ? 'Required by every marketplace — name is locked' : undefined}
          className="rounded-lg border border-divider bg-background px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>

      {usages && (
        <div className="rounded-lg border border-divider bg-card px-3 py-2 text-[11.5px] leading-relaxed text-muted">
          <p className="mb-1 font-semibold text-foreground">Where “{header.name}” is used</p>
          {!usedAnywhere && <p>Not used in any formula, Tab, Overview Tab, Graph or mapping yet.</p>}
          {usages.formulas.length > 0 && (
            <p>
              <span className="font-medium text-foreground">Formulas ({usages.formulas.length}):</span> {usages.formulas.join(', ')}
              {renaming
                ? <span className="block text-action">On Save, [{header.name}] becomes [{form.name.trim()}] in {usages.formulas.length === 1 ? 'this formula' : 'all of these'}.</span>
                : <span className="block text-subtle">Rename it and these formulas are updated to the new name on Save.</span>}
            </p>
          )}
          {usages.others.length > 0 && (
            <p className={usages.formulas.length ? 'mt-1' : ''}>
              <span className="font-medium text-foreground">Also in:</span> {usages.others.join(', ')}
              <span className="block text-subtle">These follow the header itself, so a new name shows there with nothing to change.</span>
            </p>
          )}
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="flex items-center justify-between text-[12px] font-medium text-muted">
          Description
          <span className={`text-[11px] font-normal tabular-nums ${words >= HEADER_DESCRIPTION_MAX_WORDS ? 'text-neg' : 'text-subtle'}`}>
            {words} / {HEADER_DESCRIPTION_MAX_WORDS} words
          </span>
        </span>
        <textarea
          value={form.description || ''}
          onChange={(e) => set({ description: capWords(e.target.value) })}
          rows={4}
          maxLength={HEADER_DESCRIPTION_MAX_CHARS}
          placeholder="What this header shows and how it's worked out — shown when hovering the ⓘ beside its column on the dashboard"
          className="resize-y rounded-lg border border-divider bg-background px-3 py-2 text-sm leading-relaxed text-foreground focus:border-accent focus:outline-none"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-muted">Type</span>
        <TypeToggle value={form.type} disabled={reserved} onChange={setType} />
      </div>

      {canUseFormula && (
        <label className="flex items-start gap-2 rounded-lg border border-divider bg-card px-3 py-2 text-xs text-foreground">
          <input
            type="checkbox"
            checked={usesFormula}
            onChange={(e) => setUsesFormula(e.target.checked)}
            className="mt-0.5 accent-[var(--color-action)]"
          />
          <span>
            <span className="font-medium">Work it out with a formula</span>
            <span className="block text-[11px] text-subtle">
              {usesFormula
                ? 'Its value comes from the formula below — the dashboard no longer gives it an input box.'
                : 'Off: filled by the dashboard as usual. On: the Formula section opens below.'}
            </span>
          </span>
        </label>
      )}

      <div className="flex flex-wrap items-center gap-4">
        {form.type !== 'date' && (
          <label className="flex items-center gap-1.5 text-xs text-muted">
            Format
            <select
              value={form.format || 'money'}
              onChange={(e) => set({ format: e.target.value })}
              className="rounded-md border border-divider bg-background px-2 py-1 text-xs focus:outline-none"
            >
              {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
        )}
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={form.showInTable !== false}
            onChange={(e) => set({ showInTable: e.target.checked })}
            className="accent-[var(--color-action)]"
          />
          Show in table
        </label>
      </div>

      {form.type === 'formula' && (
        <FormulaEditor
          value={form.formula || ''}
          onChange={(formula) => set({ formula })}
          refNames={refNames}
          listNames={listNames}
          previewScope={previewScope}
          dateNames={dateNames}
        />
      )}

      {form.type === 'date' && (
        <p className="text-[11.5px] leading-relaxed text-muted">
          Reads any date or date-time the sheet has — <code>2026-07-29 08:19:55</code>, <code>29/07/2026</code>, <code>29-Jul-2026</code>, <code>Jul 29, 2026 8:19 PM</code>, an Excel date — and shows it as a date (<span className="font-medium text-foreground">29 Jul 2026</span>).
          In a Formula header, one Date minus another gives days, and <code>TODAY()</code> is today&rsquo;s date.
        </p>
      )}

      {reserved && !fixedHint && (
        <p className="text-[11px] text-subtle">Required header — every marketplace must map it to a sheet column before it can be published live. Its name and type are locked.</p>
      )}
      {fixedHint && (
        <p className="text-[11px] text-subtle">Built-in header. {usesFormula ? 'Worked out by the formula above.' : fixedHint} {canUseFormula ? 'Its name is locked.' : 'Its name and type are locked.'}</p>
      )}
      {form.source === 'default' && form.primitive && (
        <p className="text-[11px] text-subtle">
          Bound to the <code>{form.primitive}</code> engine metric{form.note ? ` — ${form.note}` : ''}.
        </p>
      )}
    </Modal>
  );
}
