'use client';

import { useMemo, useState } from 'react';
import { Check, Minus, Plus, X as XIcon } from 'lucide-react';
import { makeFileSlot, RESERVED_HEADER_IDS } from '@/data/templateSchema';
import { marketplaceUniqueHeaders, staleMappingHeaderIds, withoutHeaderMappings } from '@/lib/profitLoss/marketplaceHeaders';
import { isOurHeader } from '@/lib/profitLoss/headerUsage';
import { useToast } from '@/components/admin/Toast';
import SectionHead from './SectionHead';
import NameField from './NameField';
import SheetHeadersUploader from './SheetHeadersUploader';

// image 2 · Market Place — the upload slots (which become the dashboard's green
// buttons) plus the Unmap / Our / Map column-mapping grid. `globalHeaders`
// (Header/Title Card/Graph/Tab/Overview Tab now all live in the global
// config, see TemplateBuilder) is the mapping target list — mapping a sheet
// header to one of them removes it from this marketplace's unmapped pool.
// Marketplace columns NEVER become "Our Headers" on their own — Our Headers
// are only what's created in Global Settings › Header; a marketplace's
// columns stay its own, to be mapped onto them. File names must be unique —
// a duplicate reddens the input live.
//
// A file's upload goes through SheetHeadersUploader: every sheet in the
// workbook is listed with Headers Row / Column buttons, and "Save All Sheets"
// stores each sheet's settings + the file's unique headers on the slot and
// saves the marketplace straight away — its unique header list (every file,
// every included sheet) is what the global Header section offers in this
// marketplace's column (`onSheetsSaved` refreshes that list). Nothing is
// mapped automatically.
export default function MarketPlaceSection({ draft, globalHeaders = [], onSheetsSaved, activeSlotId = null, onActiveSlotId }) {
  const { addToast } = useToast();
  const { config, setConfig, addItem, patchItem, updateMarketplace } = draft;
  const slots = useMemo(() => config.fileSlots || [], [config.fileSlots]);
  const [savingSheets, setSavingSheets] = useState(false);
  const uniqueHeaders = useMemo(() => marketplaceUniqueHeaders(config), [config]);
  const [pick, setPick] = useState({}); // { [sheetHeader]: headerId }
  const [localSlotId, setLocalSlotId] = useState(null);
  const setActiveSlotId = onActiveSlotId || setLocalSlotId;
  const activeSlot = slots.find((s) => s.id === activeSlotId) || null;

  const mappedSheetHeaders = useMemo(() => {
    const set = new Set();
    for (const s of slots) for (const m of s.mappings || []) set.add(`${s.id}::${m.sheetHeader}`);
    return set;
  }, [slots]);

  // The Unmap/Map grids below are scoped to whichever file is currently
  // selected on the left — a marketplace with several files (e.g. a Payment
  // sheet + an Orders sheet) would otherwise mix every file's columns into
  // one list with no clear sense of which file a row even belongs to.
  // `allMappings` (every slot) stays separate for the "Our Header" pool's
  // "mapped" badge and the reserved Order Id/Transaction Id status at the
  // top — those are marketplace-wide completeness checks, not per-file, so
  // they must NOT narrow to just the active slot.
  const allMappings = useMemo(() => {
    const rows = [];
    for (const s of slots) for (const m of s.mappings || []) {
      rows.push({ slotId: s.id, slotLabel: s.label, sheetHeader: m.sheetHeader, headerId: m.headerId, headerName: globalHeaders.find((x) => x.id === m.headerId)?.name || '(deleted)' });
    }
    return rows;
  }, [slots, globalHeaders]);

  const unmapped = useMemo(() => {
    if (!activeSlot) return [];
    return (activeSlot.extractedHeaders || [])
      .filter((h) => !mappedSheetHeaders.has(`${activeSlot.id}::${h}`))
      .map((h) => ({ slotId: activeSlot.id, slotLabel: activeSlot.label, sheetHeader: h }));
  }, [activeSlot, mappedSheetHeaders]);

  const mappings = useMemo(
    () => allMappings.filter((m) => m.slotId === activeSlotId),
    [allMappings, activeSlotId],
  );

  const mappedHeaderIds = useMemo(() => new Set(allMappings.map((m) => m.headerId)), [allMappings]);
  const reservedStatus = [
    { id: RESERVED_HEADER_IDS.orderId, name: 'Order Id' },
    { id: RESERVED_HEADER_IDS.transactionId, name: 'Transaction Id' },
  ].map((r) => ({ ...r, mapped: mappedHeaderIds.has(r.id) }));

  const defaultTargets = globalHeaders.filter(isOurHeader); // Our Headers only, never sheet columns

  // Mappings to Our Headers that have since been deleted: they do nothing on
  // the dashboard but fail validation (Save stays blocked). One click removes
  // them and saves.
  const knownIds = useMemo(() => new Set(globalHeaders.map((h) => h.id)), [globalHeaders]);
  const staleIds = useMemo(() => staleMappingHeaderIds(config, knownIds), [config, knownIds]);
  const staleCount = allMappings.filter((m) => staleIds.has(m.headerId)).length;
  const [cleaning, setCleaning] = useState(false);
  async function removeStaleMappings() {
    setCleaning(true);
    try {
      const next = withoutHeaderMappings(config, staleIds);
      setConfig(next);
      const res = await draft.save(next);
      addToast(res.ok ? `Removed ${staleCount} mapping${staleCount === 1 ? '' : 's'} to deleted headers` : (res.error || 'Removed locally — saving failed'), res.ok ? 'success' : 'error');
      if (res.ok) onSheetsSaved?.();
    } finally {
      setCleaning(false);
    }
  }

  // "Save All Sheets": the slot takes the per-sheet settings + unique
  // headers and the marketplace is saved right away. Its columns stay this
  // marketplace's own — never added to Our Headers, never auto-mapped; map
  // them in Global Settings › Header.
  async function saveSheets(slotId, slotPatch) {
    setSavingSheets(true);
    try {
      const next = { ...config, fileSlots: slots.map((s) => (s.id === slotId ? { ...s, ...slotPatch } : s)) };
      setConfig(next);
      const res = await draft.save(next);
      if (!res.ok) { addToast(res.error || 'Sheets kept locally — saving the marketplace failed', 'error'); return false; }
      onSheetsSaved?.();
      addToast(`${slotPatch.extractedHeaders.length} unique headers saved — map them in Global Settings › Header`);
      return true;
    } finally {
      setSavingSheets(false);
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

        {staleCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neg/30 bg-neg/5 px-3 py-2">
            <p className="min-w-0 flex-1 text-[12px] text-foreground">
              <span className="font-semibold">{staleCount} mapping{staleCount === 1 ? '' : 's'}</span> point at Our Headers that were deleted — they do nothing on the dashboard and block saving this marketplace.
            </p>
            <button type="button" onClick={removeStaleMappings} disabled={cleaning} className="rounded-full bg-neg px-3 py-1 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
              Remove them
            </button>
          </div>
        )}

        {/* File slots — compact list (left) + the selected one's full editor (right) */}
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-foreground">
            Files <span className="font-normal text-subtle">· {uniqueHeaders.length} unique headers across {slots.length} file{slots.length === 1 ? '' : 's'}</span>
          </span>
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
                  <SheetHeadersUploader
                    key={activeSlot.id}
                    slot={activeSlot}
                    saving={savingSheets}
                    onSave={(payload) => saveSheets(activeSlot.id, payload)}
                  />
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-[10px] text-subtle">Default rows for sheets on auto:</span>
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

        {/* Mapping grid — Unmap/Map scoped to activeSlot only, see unmapped/
            mappings above; "Our Header" stays the full shared pool. */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 hidden">
          <div className="rounded-lg border border-divider bg-card p-3">
            <div className="mb-2 flex items-center justify-between gap-2 text-[12.5px] font-semibold text-foreground">
              <span>Unmap Header ({unmapped.length})</span>
              {activeSlot && <span className="truncate text-[10.5px] font-normal text-subtle">{activeSlot.label}</span>}
            </div>
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {!activeSlot && <li className="text-[11px] text-subtle">Pick a file on the left to see its columns.</li>}
              {activeSlot && unmapped.length === 0 && <li className="text-[11px] text-subtle">Upload a sample file to extract columns.</li>}
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
            <div className="mb-2 flex items-center justify-between gap-2 text-[12.5px] font-semibold text-foreground">
              <span>Map Header ({mappings.length})</span>
              {activeSlot && <span className="truncate text-[10.5px] font-normal text-subtle">{activeSlot.label}</span>}
            </div>
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {!activeSlot && <li className="text-[11px] text-subtle">Pick a file on the left to see its mappings.</li>}
              {activeSlot && mappings.length === 0 && <li className="text-[11px] text-subtle">Nothing mapped yet.</li>}
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
