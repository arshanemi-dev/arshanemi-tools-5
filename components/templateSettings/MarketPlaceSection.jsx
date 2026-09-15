'use client';

import { useMemo, useState } from 'react';
import { Check, Loader2, Minus, Plus, Trash2, Upload, X as XIcon } from 'lucide-react';
import { makeFileSlot, RESERVED_HEADER_IDS } from '@/data/templateSchema';
import { readAnyFile } from '@/lib/sheet/readAnyFile';
import { rowOverrideFor } from '@/lib/sheet/rowOverride';
import { useToast } from '@/components/admin/Toast';
import SectionHead from './SectionHead';
import NameField from './NameField';

// image 2 · Market Place — the upload slots (which become the dashboard's green
// buttons) plus the Unmap / Our / Map column-mapping grid. `globalHeaders`
// (Header/Title Card/Graph/Tab/Overview Tab now all live in the global
// config, see TemplateBuilder) is the mapping target list — mapping a sheet
// header to one of them removes it from this marketplace's "extracted" pool
// (the "union" rule). Uploading a sample also proposes its columns as NEW
// global headers via `onImportHeaders` (skips anything that's already a
// global header, case-/whitespace-insensitively) — so a marketplace's file
// grows the shared "Our Header" pool instead of just sitting unmapped.
// Mapping a column away to some OTHER header also cleans up its own
// auto-imported placeholder via `onHeaderMapped`, if nothing else still
// points at it — otherwise every re-upload would keep proposing headers
// nobody actually maps to anymore. Files are a compact list (left) + the
// full slot editor for whichever one is selected (right) — same
// master-detail pattern as Header. File names must be unique — a duplicate
// reddens the input live.
export default function MarketPlaceSection({ draft, globalHeaders = [], onImportHeaders, onHeaderMapped, activeSlotId = null, onActiveSlotId }) {
  const { addToast } = useToast();
  const { config, setConfig, addItem, patchItem, removeItem, updateMarketplace } = draft;
  const slots = useMemo(() => config.fileSlots || [], [config.fileSlots]);
  const [busySlot, setBusySlot] = useState(null);
  const [pick, setPick] = useState({}); // { [sheetHeader]: headerId }
  const [localSlotId, setLocalSlotId] = useState(null);
  const setActiveSlotId = onActiveSlotId || setLocalSlotId;
  const activeSlot = slots.find((s) => s.id === activeSlotId) || null;

  const mappedSheetHeaders = useMemo(() => {
    const set = new Set();
    for (const s of slots) for (const m of s.mappings || []) set.add(`${s.id}::${m.sheetHeader}`);
    return set;
  }, [slots]);

  const unmapped = useMemo(() => {
    const rows = [];
    for (const s of slots) {
      for (const h of s.extractedHeaders || []) {
        if (!mappedSheetHeaders.has(`${s.id}::${h}`)) rows.push({ slotId: s.id, slotLabel: s.label, sheetHeader: h });
      }
    }
    return rows;
  }, [slots, mappedSheetHeaders]);

  const mappings = useMemo(() => {
    const rows = [];
    for (const s of slots) for (const m of s.mappings || []) {
      rows.push({ slotId: s.id, slotLabel: s.label, sheetHeader: m.sheetHeader, headerId: m.headerId, headerName: globalHeaders.find((x) => x.id === m.headerId)?.name || '(deleted)' });
    }
    return rows;
  }, [slots, globalHeaders]);

  const mappedHeaderIds = useMemo(() => new Set(mappings.map((m) => m.headerId)), [mappings]);
  const reservedStatus = [
    { id: RESERVED_HEADER_IDS.orderId, name: 'Order Id' },
    { id: RESERVED_HEADER_IDS.transactionId, name: 'Transaction Id' },
  ].map((r) => ({ ...r, mapped: mappedHeaderIds.has(r.id) }));

  const defaultTargets = globalHeaders;

  async function uploadSample(slotId, file) {
    if (!file) return;
    setBusySlot(slotId);
    try {
      const slot = slots.find((s) => s.id === slotId);
      const wb = await readAnyFile(file, rowOverrideFor(slot));
      const first = wb.byTab[wb.sheetNames[0]] || { headerRow: [], rows: [] };
      const extractedHeaders = (first.headerRow || []).map((h) => String(h || '').trim()).filter(Boolean);
      const sampleValues = {};
      for (const h of extractedHeaders.slice(0, 40)) {
        sampleValues[h] = (first.rows || []).slice(0, 3).map((r) => r[h]).filter((v) => v != null && String(v).trim() !== '');
      }
      patchItem('fileSlots', slotId, { extractedHeaders, sampleValues, sheetNameHint: wb.sheetNames[0] || '' });
      // A column with nothing in it in this sample isn't worth proposing as
      // its own global header — it'd only ever render blank. Checked across
      // more rows than the 3-row `sampleValues` preview keeps, so a column
      // that's merely sparse in the first few rows still gets a fair look.
      const checkRows = (first.rows || []).slice(0, 30);
      const hasAnyValue = (h) => checkRows.some((r) => r[h] != null && String(r[h]).trim() !== '');
      const importCandidates = extractedHeaders.filter(hasAnyValue);
      const { added = 0 } = onImportHeaders ? onImportHeaders(importCandidates) : {};
      addToast(
        added
          ? `${extractedHeaders.length} columns extracted from ${file.name} · ${added} new header${added === 1 ? '' : 's'} added to Global Settings`
          : `${extractedHeaders.length} columns extracted from ${file.name}`,
      );
    } catch {
      addToast('Could not read that sample file', 'error');
    } finally {
      setBusySlot(null);
    }
  }

  // Mapping lives entirely in fileSlots[].mappings — headers themselves are
  // global (edited in Global Settings), so there's no local header list to
  // keep in sync here anymore.
  function mapHeader(slotId, sheetHeader) {
    const headerId = pick[sheetHeader];
    if (!headerId) { addToast('Pick a header to map to', 'error'); return; }
    setConfig((c) => ({
      ...c,
      fileSlots: c.fileSlots.map((s) => (s.id === slotId ? { ...s, mappings: [...(s.mappings || []).filter((m) => m.sheetHeader !== sheetHeader), { sheetHeader, headerId }] } : s)),
    }));
    onHeaderMapped?.(sheetHeader, headerId);
  }

  function unmapHeader(slotId, sheetHeader) {
    setConfig((c) => ({
      ...c,
      fileSlots: c.fileSlots.map((s) => (s.id === slotId ? { ...s, mappings: (s.mappings || []).filter((m) => m.sheetHeader !== sheetHeader) } : s)),
    }));
  }

  return (
    <div id="section-market-place" className="scroll-mt-24">
      <SectionHead title="Market Place" desc="Upload slots + the column mapping. Fill this first." />

      <div className="space-y-4 rounded-xl border border-divider bg-background p-4">
        <input
          value={config.marketplace?.name || ''}
          onChange={(e) => updateMarketplace({ name: e.target.value })}
          placeholder="Marketplace name"
          className="w-full max-w-md rounded-lg border border-divider bg-background px-3 py-1.5 text-sm font-medium focus:border-accent focus:outline-none"
        />

        {/* Required-mapping status — informational only; marketplaces save
            directly (no publish gate) so this is guidance, not a blocker. */}
        <div className="flex flex-wrap items-center gap-2">
          {reservedStatus.map((r) => (
            <span
              key={r.id}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-medium ${
                r.mapped ? 'bg-action-soft text-action' : 'bg-neg/10 text-neg'
              }`}
            >
              {r.mapped ? <Check size={11} /> : <XIcon size={11} />} {r.name}
            </span>
          ))}
        </div>

        {/* File slots — compact list (left) + the selected one's full editor (right) */}
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-foreground">Files</span>
          <button
            type="button"
            onClick={() => { const item = makeFileSlot(`File ${slots.length + 1}`, 'aux'); addItem('fileSlots', item); setActiveSlotId(item.id); }}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-divider-light px-2.5 py-1 text-[12px] font-medium text-action hover:bg-action-soft"
          >
            <Plus size={12} /> Add File
          </button>
        </div>
        {!slots.length ? (
          <p className="rounded-lg border border-divider bg-card py-6 text-center text-[12px] text-subtle">No files yet — add one.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3">
        

            <div className="rounded-lg border border-divider bg-card p-3">
              {!activeSlot ? (
                <p className="py-10 text-center text-[12px] text-subtle">Pick a file from the list on the left to edit it.</p>
              ) : (
                <>
                  <NameField
                    list={slots}
                    id={activeSlot.id}
                    value={activeSlot.label}
                    onChange={(label) => patchItem('fileSlots', activeSlot.id, { label })}
                    field="label"
                    className="w-full"
                  />
                  <label className="mt-2 inline-flex cursor-pointer items-center gap-1 rounded-md bg-action px-2 py-1 text-[11px] font-semibold text-white hover:bg-action-hover">
                    {busySlot === activeSlot.id ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />} Upload File
                    <input type="file" hidden accept=".csv,.xlsx,.xls,.pdf" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; uploadSample(activeSlot.id, f); }} />
                  </label>
                  <p className="mt-1.5 text-[10.5px] text-subtle">{(activeSlot.extractedHeaders || []).length} columns · sheet “{activeSlot.sheetNameHint || '—'}”</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    {['headerRowIndex', 'valueRowIndex'].map((k) => (
                      <label key={k} className="flex items-center gap-1 text-[10px] text-subtle">
                        {k === 'headerRowIndex' ? 'Header' : 'Value'}
                        <input type="number" min={1} value={activeSlot[k] || 1} onChange={(e) => patchItem('fileSlots', activeSlot.id, { [k]: Math.max(1, Number(e.target.value) || 1) })} className="w-12 rounded border border-divider bg-background px-1 py-0.5 text-[10px] focus:outline-none" />
                      </label>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] text-subtle" title="1-based, like a spreadsheet row number. Leave at 1/2 to auto-detect. Set both if this marketplace inserts an extra row (e.g. Meesho's per-column formula legend) between the header row and the real data.">
                    Row numbers where Header / Value data actually start — override auto-detect for a sheet like Meesho&rsquo;s (header row 2, data row 4).
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Mapping grid */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-lg border border-divider bg-card p-3">
            <div className="mb-2 text-[12.5px] font-semibold text-foreground">Unmap Header ({unmapped.length})</div>
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {unmapped.length === 0 && <li className="text-[11px] text-subtle">Upload a sample file to extract columns.</li>}
              {unmapped.map((u) => (
                <li key={`${u.slotId}::${u.sheetHeader}`} className="rounded-md border border-divider bg-background p-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] text-foreground" title={`${u.slotLabel} · ${u.sheetHeader}`}>{u.sheetHeader}</span>
                    <button type="button" onClick={() => mapHeader(u.slotId, u.sheetHeader)} className="rounded-full bg-action/10 p-1 text-action hover:bg-action/20"><Plus size={11} /></button>
                  </div>
                  <select
                    value={pick[u.sheetHeader] || ''}
                    onChange={(e) => setPick((p) => ({ ...p, [u.sheetHeader]: e.target.value }))}
                    className="mt-1 w-full rounded border border-divider bg-background px-1.5 py-0.5 text-[11px] focus:outline-none"
                  >
                    <option value="">map to → Our Header</option>
                    {defaultTargets.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-divider bg-card p-3">
            <div className="mb-2 text-[12.5px] font-semibold text-foreground">Our Header ({defaultTargets.length})</div>
            <ul className="max-h-64 space-y-0.5 overflow-y-auto text-[12px] text-muted">
              {defaultTargets.map((h) => (
                <li key={h.id} className="flex items-center justify-between rounded px-1.5 py-1 hover:bg-card-hover">
                  <span className="truncate">{h.name}</span>
                  {mappedHeaderIds.has(h.id) && <span className="shrink-0 text-[10px] text-action">mapped</span>}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-divider bg-card p-3">
            <div className="mb-2 text-[12.5px] font-semibold text-foreground">Map Header ({mappings.length})</div>
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {mappings.length === 0 && <li className="text-[11px] text-subtle">Nothing mapped yet.</li>}
              {mappings.map((m) => (
                <li key={`${m.slotId}::${m.sheetHeader}`} className="flex items-center justify-between gap-2 rounded-md border border-divider bg-background p-1.5 text-[12px]">
                  <span className="min-w-0 truncate">
                    <span className="text-subtle">{m.sheetHeader}</span> → <span className="font-medium text-foreground">{m.headerName}</span>
                  </span>
                  <button type="button" onClick={() => unmapHeader(m.slotId, m.sheetHeader)} className="rounded-full p-1 text-subtle hover:text-neg"><Minus size={11} /></button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
