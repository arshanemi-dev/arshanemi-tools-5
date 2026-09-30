'use client';

import { useMemo, useState } from 'react';
import { Check, FileSpreadsheet, Loader2, RotateCcw, Upload, X } from 'lucide-react';
import { ACCEPT } from '@/lib/sheet/readAnyFile';
import { columnLetter } from '@/lib/sheet/sheetLayout';
import { extractSheetHeaders, readSheetsForHeaders, uniqueNames, withOrientation } from '@/lib/sheet/sheetHeaders';
import { rowOverrideFor } from '@/lib/sheet/rowOverride';
import { useToast } from '@/components/admin/Toast';

const CHIP_LIMIT = 16;

function Pill({ active, disabled, onClick, children }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? 'border-action bg-action text-white' : 'border-divider-light bg-background text-foreground hover:bg-card-hover'
      }`}
    >
      {children}
    </button>
  );
}

function HeaderChips({ headers, filled }) {
  const [all, setAll] = useState(false);
  if (!headers.length) return null;
  const shown = all ? headers : headers.slice(0, CHIP_LIMIT);
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {shown.map((h) => (
        <span
          key={h}
          title={filled && !filled.has(h) ? 'No values in the first rows of this sample' : undefined}
          className={`rounded-md border border-divider px-1.5 py-0.5 text-[11px] ${filled && !filled.has(h) ? 'text-subtle' : 'text-foreground'}`}
        >
          {h}
        </span>
      ))}
      {headers.length > CHIP_LIMIT && (
        <button type="button" onClick={() => setAll((v) => !v)} className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-action hover:bg-action-soft">
          {all ? 'Show less' : `+${headers.length - CHIP_LIMIT} more`}
        </button>
      )}
    </div>
  );
}

// Step 1 of a marketplace file: upload it, see EVERY sheet in it, and set
// each one's headers as a Row or a Column (plus which row/column, and
// whether to include the sheet at all). "Save All Sheets" hands the result
// to `onSave` — per-sheet settings + the file's unique header list, which
// MarketPlaceSection stores on the slot and saves marketplace-wide. Nothing
// is kept until then; re-uploading replaces the pending review.
export default function SheetHeadersUploader({ slot, onSave, saving = false }) {
  const { addToast } = useToast();
  const [reading, setReading] = useState(false);
  const [pending, setPending] = useState(null); // { fileName, isPdf, sheets }
  const [cfg, setCfg] = useState({}); // { [sheetName]: { include, orientation, headerIndex|null } }
  const defaults = useMemo(() => rowOverrideFor({ ...slot, sheets: [] }), [slot]);

  async function onFile(file) {
    if (!file) return;
    setReading(true);
    try {
      const wb = await readSheetsForHeaders(file);
      if (!wb.sheets.length) { addToast(`No sheets found in ${file.name}`, 'error'); return; }
      // Start from what this slot saved last time for a same-named sheet.
      const prev = Object.fromEntries((slot.sheets || []).map((s) => [s.name, s]));
      const next = {};
      let sheets = wb.sheets;
      for (const s of wb.sheets) {
        const p = prev[s.name];
        const orientation = p?.orientation === 'column' && !wb.isPdf ? 'column' : 'row';
        next[s.name] = { include: p ? p.include !== false : true, orientation, headerIndex: p && p.headerIndexAuto === false ? p.headerIndex : null };
        if (orientation === 'column') sheets = sheets.map((x) => (x.name === s.name ? withOrientation(x, 'column') : x));
      }
      setPending({ ...wb, sheets });
      setCfg(next);
    } catch {
      addToast('Could not read that file', 'error');
    } finally {
      setReading(false);
    }
  }

  const results = useMemo(() => {
    if (!pending) return {};
    return Object.fromEntries(pending.sheets.map((s) => [s.name, extractSheetHeaders(s, cfg[s.name] || {}, defaults)]));
  }, [pending, cfg, defaults]);

  const includedNames = pending ? pending.sheets.filter((s) => cfg[s.name]?.include !== false).map((s) => s.name) : [];
  const uniqueCount = uniqueNames(includedNames.flatMap((n) => results[n]?.headers || [])).length;

  const patchCfg = (name, patch) => setCfg((c) => ({ ...c, [name]: { ...c[name], ...patch } }));
  const setOrientation = (name, orientation) => {
    setPending((p) => ({ ...p, sheets: p.sheets.map((s) => (s.name === name ? withOrientation(s, orientation) : s)) }));
    patchCfg(name, { orientation, headerIndex: null });
  };

  async function saveAll() {
    const sheets = pending.sheets.map((s) => {
      const c = cfg[s.name] || {};
      const r = results[s.name];
      return {
        name: s.name,
        include: c.include !== false,
        orientation: c.orientation || 'row',
        headerIndex: r.headerIndex,
        headerIndexAuto: !(c.headerIndex > 0),
        headers: r.headers,
        dataCount: r.dataCount,
      };
    });
    const included = sheets.filter((s) => s.include);
    const extractedHeaders = uniqueNames(included.flatMap((s) => s.headers));
    const sampleValues = {};
    for (const s of included) {
      const r = results[s.name];
      for (const h of r.headers) {
        if (!(h in sampleValues) && Object.keys(sampleValues).length < 40 && r.samples[h]?.length) sampleValues[h] = r.samples[h];
      }
    }
    const ok = await onSave({
      sheets,
      extractedHeaders,
      sampleValues,
      sheetNameHint: included[0]?.name || '',
      sourceFileName: pending.fileName,
    });
    if (ok) setPending(null);
  }

  const saved = Array.isArray(slot.sheets) ? slot.sheets : [];

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-action px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-action-hover ${reading ? 'pointer-events-none opacity-70' : ''}`}>
          {reading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {saved.length || slot.extractedHeaders?.length ? 'Upload New File' : 'Upload File'}
          <input type="file" hidden accept={ACCEPT} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; onFile(f); }} />
        </label>
        {!pending && (saved.length > 0 || slot.extractedHeaders?.length > 0) && (
          <span className="text-[11.5px] text-subtle">
            {slot.sourceFileName ? `${slot.sourceFileName} · ` : ''}
            {saved.length ? `${saved.filter((s) => s.include !== false).length} of ${saved.length} sheets · ` : `sheet “${slot.sheetNameHint || '—'}” · `}
            {(slot.extractedHeaders || []).length} unique headers
          </span>
        )}
      </div>

      {pending ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[12.5px] font-semibold text-foreground">
              {pending.fileName} <span className="font-normal text-subtle">· {pending.sheets.length} sheet{pending.sheets.length === 1 ? '' : 's'}</span>
            </p>
            <button type="button" onClick={() => setPending(null)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11.5px] text-subtle hover:bg-card-hover hover:text-foreground">
              <X size={12} /> Cancel
            </button>
          </div>

          {pending.sheets.map((s) => {
            const c = cfg[s.name] || {};
            const r = results[s.name] || { headers: [] };
            const isCol = c.orientation === 'column';
            const include = c.include !== false;
            return (
              <div key={s.name} className={`rounded-lg border border-divider bg-background p-3 ${include ? '' : 'opacity-60'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-foreground">
                      <FileSpreadsheet size={14} className="shrink-0 text-action" /> {s.name}
                    </p>
                    <p className="text-[11px] text-subtle">{s.rowCount} rows × {s.colCount} columns</p>
                  </div>
                  <label className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-muted">
                    <input type="checkbox" checked={include} onChange={(e) => patchCfg(s.name, { include: e.target.checked })} className="accent-[var(--color-action)]" />
                    Include
                  </label>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-[12px] font-medium text-muted">Headers</span>
                  <Pill active={!isCol} disabled={!include} onClick={() => setOrientation(s.name, 'row')}>Row</Pill>
                  <Pill active={isCol} disabled={!include || pending.isPdf} onClick={() => setOrientation(s.name, 'column')}>Column</Pill>
                  {!pending.isPdf && (
                    <label className="ml-1 flex items-center gap-1.5 text-[11.5px] text-muted">
                      {isCol ? 'Column' : 'Row'} #
                      <input
                        type="number"
                        min={1}
                        disabled={!include}
                        value={c.headerIndex || r.headerIndex || ''}
                        onChange={(e) => patchCfg(s.name, { headerIndex: Math.max(1, Number(e.target.value) || 1) })}
                        className="w-14 rounded-md border border-divider bg-background px-1.5 py-0.5 text-[11.5px] focus:border-accent focus:outline-none disabled:opacity-50"
                      />
                      {isCol && (c.headerIndex || r.headerIndex) ? <span className="text-subtle">({columnLetter(c.headerIndex || r.headerIndex)})</span> : null}
                    </label>
                  )}
                  {c.headerIndex > 0 ? (
                    <button type="button" onClick={() => patchCfg(s.name, { headerIndex: null })} title="Back to auto-detect" className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] text-subtle hover:text-foreground">
                      <RotateCcw size={11} /> Auto
                    </button>
                  ) : (
                    <span className="text-[11px] text-subtle">auto</span>
                  )}
                </div>

                <p className="mt-2 text-[11.5px] text-muted">
                  {r.headers.length
                    ? `${r.headers.length} headers · ${r.dataCount} data ${isCol ? 'column' : 'row'}${r.dataCount === 1 ? '' : 's'}`
                    : `No header ${isCol ? 'column' : 'row'} found — set the ${isCol ? 'column' : 'row'} number by hand, or switch to ${isCol ? 'Row' : 'Column'}.`}
                </p>
                <HeaderChips headers={r.headers} filled={r.filled} />
              </div>
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-divider bg-card px-3 py-2">
            <span className="text-[12px] text-muted">
              {includedNames.length} of {pending.sheets.length} sheets · <span className="font-semibold text-foreground">{uniqueCount} unique headers</span>
            </span>
            <button
              type="button"
              onClick={saveAll}
              disabled={saving || !uniqueCount}
              className="inline-flex items-center gap-1.5 rounded-full bg-action px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-action-hover disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save All Sheets
            </button>
          </div>
        </div>
      ) : saved.length > 0 ? (
        <div className="space-y-1.5">
          <ul className="divide-y divide-divider rounded-lg border border-divider bg-background">
            {saved.map((s) => (
              <li key={s.name} className={`flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-[12px] ${s.include === false ? 'text-subtle' : 'text-foreground'}`}>
                <span className={`flex min-w-0 items-center gap-1.5 truncate ${s.include === false ? 'line-through' : ''}`}><FileSpreadsheet size={12} className="shrink-0 text-subtle" /> {s.name}</span>
                <span className="text-[11px] text-subtle">
                  {s.include === false ? 'ignored' : `Headers ${s.orientation === 'column' ? `column ${columnLetter(s.headerIndex)}` : `row ${s.headerIndex}`} · ${(s.headers || []).length} headers`}
                </span>
              </li>
            ))}
          </ul>
          <HeaderChips headers={slot.extractedHeaders || []} />
        </div>
      ) : null}
    </div>
  );
}
