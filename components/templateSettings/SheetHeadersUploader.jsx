'use client';

import { useMemo, useState } from 'react';
import { Check, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import { ACCEPT } from '@/lib/sheet/readAnyFile';
import {
  extractSheetHeaders, headerBoxText, lineLabel, parseHeaderBox, readSheetsForHeaders,
  uniqueNames, valueBoxText, valueSpecFromBox, withOrientation,
} from '@/lib/sheet/sheetHeaders';
import { rowOverrideFor } from '@/lib/sheet/rowOverride';
import { slotExtractedHeaders } from '@/lib/profitLoss/marketplaceHeaders';
import { useToast } from '@/components/admin/Toast';
import SheetListRow from './SheetListRow';
import HeaderColumns from './HeaderColumns';

// "Header row 2 · Value rows 4–212 · 38 headers" for one saved sheet.
function savedSheetSummary(s) {
  const isCol = s.orientation === 'column';
  const unit = isCol ? 'column' : 'row';
  const lines = (s.headerIndexes?.length ? s.headerIndexes : [s.headerIndex]).filter(Boolean);
  const values = s.valueSpec ? valueBoxText(s.valueSpec) + (/-\s*(end)?\s*$/i.test(s.valueSpec) ? ' to end' : '')
    : s.valueFrom ? `${lineLabel(s.valueFrom, isCol)}–${lineLabel(s.valueTo, isCol)}` : 'none';
  return `Header ${unit}${lines.length > 1 ? 's' : ''} ${lines.map((n) => lineLabel(n, isCol)).join(', ') || '—'} · Value ${unit}s ${values} · ${(s.headers || []).length} headers`;
}

// A sheet's box texts → what extractSheetHeaders reads and what is saved.
function settingsOf(c = {}) {
  const header = parseHeaderBox(c.headerText);
  return { orientation: c.orientation || 'row', headerOk: header.ok, headerIndexes: header.indexes, valueSpec: valueSpecFromBox(c.valueText) };
}

// Step 1 of a marketplace file: upload it and see EVERY sheet in it on one
// line each, like the listing tool's sheet pickers but for as many sheets as
// the file has — tick the ones to read, and per sheet its direction (Row /
// Column) and its Header Row and Value Row (empty = auto-detect; see
// SheetListRow). "Save All Sheets" hands the result to `onSave` — per-sheet
// settings + the file's unique header list, which MarketPlaceSection stores
// on the slot (in the Global Settings draft — Save New Version keeps it, and
// the version switched Live is what the dashboard uses); it reads every ticked
// sheet of an upload with exactly these settings (rowOverrideFor →
// parseAllTabs → ingestWorkbook). Nothing is kept until then; re-uploading
// replaces the pending review.
export default function SheetHeadersUploader({ slot, onSave, saving = false }) {
  const { addToast } = useToast();
  const [reading, setReading] = useState(false);
  const [pending, setPending] = useState(null); // { fileName, isPdf, sheets }
  const [cfg, setCfg] = useState({}); // { [sheetName]: { include, orientation, headerText, valueText } }
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
        const savedHeaders = p && p.headerIndexAuto === false ? (p.headerIndexes?.length ? p.headerIndexes : [p.headerIndex].filter(Boolean)) : null;
        next[s.name] = {
          include: p ? p.include !== false : true,
          orientation,
          headerText: savedHeaders?.length ? headerBoxText(savedHeaders, orientation === 'column') : '',
          valueText: valueBoxText(p?.valueSpec || ''),
        };
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
    return Object.fromEntries(pending.sheets.map((s) => [s.name, extractSheetHeaders(s, settingsOf(cfg[s.name]), defaults)]));
  }, [pending, cfg, defaults]);

  const includedNames = pending ? pending.sheets.filter((s) => cfg[s.name]?.include !== false).map((s) => s.name) : [];
  // The file's total headers across every ticked sheet — the one list shown below the sheets.
  const totalHeaders = uniqueNames(includedNames.flatMap((n) => results[n]?.headers || []));
  const uniqueCount = totalHeaders.length;
  const totalFilled = new Set(includedNames.flatMap((n) => [...(results[n]?.filled || [])].map((h) => h.toLowerCase())));
  const badLines = includedNames.some((n) => !settingsOf(cfg[n]).headerOk || (results[n] && !results[n].valueSpecOk));
  const allTicked = !!pending && includedNames.length === pending.sheets.length;

  const patchCfg = (name, patch) => setCfg((c) => ({ ...c, [name]: { ...c[name], ...patch } }));
  const tickAll = (include) => setCfg((c) => Object.fromEntries(Object.entries(c).map(([name, v]) => [name, { ...v, include }])));
  // Switching direction re-reads the sheet the other way — old picks don't carry over.
  const setOrientation = (name, orientation) => {
    setPending((p) => ({ ...p, sheets: p.sheets.map((s) => (s.name === name ? withOrientation(s, orientation) : s)) }));
    patchCfg(name, { orientation, headerText: '', valueText: '' });
  };

  async function saveAll() {
    const sheets = pending.sheets.map((s) => {
      const c = cfg[s.name] || {};
      const { headerIndexes, valueSpec } = settingsOf(c);
      const r = results[s.name];
      return {
        name: s.name,
        include: c.include !== false,
        orientation: c.orientation || 'row',
        headerIndex: r.headerIndexes[0] ?? null, // first header line — kept for older readers
        headerIndexes: r.headerIndexes,
        headerIndexAuto: !headerIndexes?.length,
        valueSpec: valueSpec && r.valueSpecOk ? valueSpec : '',
        valueFrom: r.valueFrom,
        valueTo: r.valueTo,
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
  const th = 'px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted';

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
            {slotExtractedHeaders(slot).length} unique headers
          </span>
        )}
      </div>

      {pending ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[12.5px] font-semibold text-foreground">
              {pending.fileName} <span className="font-normal text-subtle">· {pending.sheets.length} sheet{pending.sheets.length === 1 ? '' : 's'} — tick the ones to read</span>
            </p>
            <button type="button" onClick={() => setPending(null)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11.5px] text-subtle hover:bg-card-hover hover:text-foreground">
              <X size={12} /> Cancel
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-divider bg-background">
            <table className="w-full min-w-[640px]">
              <thead className="bg-card">
                <tr>
                  <th className="w-8 px-3 py-2 text-left">
                    <input type="checkbox" checked={allTicked} onChange={(e) => tickAll(e.target.checked)} aria-label="Read every sheet" className="accent-[var(--color-action)]" />
                  </th>
                  <th className={th}>Sheet</th>
                  <th className={th}>{pending.isPdf ? '' : 'Direction'}</th>
                  <th className={th}>{pending.isPdf ? '' : 'Header Row'}</th>
                  <th className={th}>{pending.isPdf ? '' : 'Value Row'}</th>
                  <th className={`${th} text-right`}>Headers</th>
                </tr>
              </thead>
              <tbody>
                {pending.sheets.map((s) => {
                  const c = cfg[s.name] || {};
                  return (
                    <SheetListRow
                      key={s.name}
                      sheet={s}
                      c={c}
                      r={results[s.name] || { headers: [] }}
                      headerOk={settingsOf(c).headerOk}
                      isPdf={pending.isPdf}
                      onPatch={(patch) => patchCfg(s.name, patch)}
                      onOrientation={(o) => setOrientation(s.name, o)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
          {!pending.isPdf && (
            <p className="text-[11px] text-subtle">
              Empty boxes are auto-detected (shown in grey). Header Row: e.g. <span className="font-medium text-muted">2</span>, or{' '}
              <span className="font-medium text-muted">1, 2</span> for two header rows. Value Row: the first data row, e.g.{' '}
              <span className="font-medium text-muted">4</span> (to the end), or <span className="font-medium text-muted">4-200</span>. Column sheets use letters (A, B).
            </p>
          )}

          <HeaderColumns headers={totalHeaders} filled={totalFilled} />

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-divider bg-card px-3 py-2">
            <span className="text-[12px] text-muted">
              {includedNames.length} of {pending.sheets.length} sheets · <span className="font-semibold text-foreground">{uniqueCount} unique headers</span>
            </span>
            <button
              type="button"
              onClick={saveAll}
              disabled={saving || !uniqueCount || badLines}
              title={badLines ? 'Fix the red Header Row / Value Row box first' : undefined}
              className="inline-flex items-center gap-1.5 rounded-full bg-action px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-action-hover disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save All Sheets
            </button>
          </div>
        </div>
      ) : saved.length > 0 || slot.extractedHeaders?.length > 0 ? (
        <div className="space-y-1.5">
          {saved.length > 0 && (
            <ul className="divide-y divide-divider rounded-lg border border-divider bg-background">
              {saved.map((s) => (
                <li key={s.name} className={`flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-[12px] ${s.include === false ? 'text-subtle' : 'text-foreground'}`}>
                  <span className={`flex min-w-0 items-center gap-1.5 truncate ${s.include === false ? 'line-through' : ''}`}><FileSpreadsheet size={12} className="shrink-0 text-subtle" /> {s.name}</span>
                  <span className="text-[11px] text-subtle">
                    {s.include === false ? 'not read' : savedSheetSummary(s)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <HeaderColumns headers={slotExtractedHeaders(slot)} />
        </div>
      ) : null}
    </div>
  );
}
