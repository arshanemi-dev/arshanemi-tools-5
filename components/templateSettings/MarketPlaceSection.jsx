'use client';

import { useMemo, useState } from 'react';
import { Loader2, Minus, Plus, Trash2, Upload } from 'lucide-react';
import { makeFileSlot, makeHeader } from '@/data/templateSchema';
import { readAnyFile } from '@/lib/sheet/readAnyFile';
import { useToast } from '@/components/admin/Toast';
import SectionHead from './SectionHead';

// image 2 · Market Place — the upload slots (which become the dashboard's green
// buttons) plus the Unmap / Our / Map column-mapping grid. Mapping a sheet
// header to a default header removes it from the header pool (the "union" rule
// — see HeaderSection).
export default function MarketPlaceSection({ draft }) {
  const { addToast } = useToast();
  const { config, setConfig, addItem, patchItem, removeItem, updateMarketplace, setMarketplaceVisible } = draft;
  const slots = useMemo(() => config.fileSlots || [], [config.fileSlots]);
  const headers = useMemo(() => config.headers || [], [config.headers]);
  const [busySlot, setBusySlot] = useState(null);
  const [pick, setPick] = useState({}); // { [sheetHeader]: headerId }

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
      rows.push({ slotId: s.id, slotLabel: s.label, sheetHeader: m.sheetHeader, headerId: m.headerId, headerName: headers.find((x) => x.id === m.headerId)?.name || '(deleted)' });
    }
    return rows;
  }, [slots, headers]);

  const defaultTargets = headers.filter((h) => h.source === 'default' || h.source === 'manual');

  async function uploadSample(slotId, file) {
    if (!file) return;
    setBusySlot(slotId);
    try {
      const wb = await readAnyFile(file);
      const first = wb.byTab[wb.sheetNames[0]] || { headerRow: [], rows: [] };
      const extractedHeaders = (first.headerRow || []).map((h) => String(h || '').trim()).filter(Boolean);
      const sampleValues = {};
      for (const h of extractedHeaders.slice(0, 40)) {
        sampleValues[h] = (first.rows || []).slice(0, 3).map((r) => r[h]).filter((v) => v != null && String(v).trim() !== '');
      }
      patchItem('fileSlots', slotId, { extractedHeaders, sampleValues, sheetNameHint: wb.sheetNames[0] || '' });
      // Add an "extracted" header for every new sheet column (union rule).
      setConfig((c) => {
        const have = new Set(c.headers.map((x) => (x.name || '').toLowerCase()));
        const add = extractedHeaders
          .filter((h) => !have.has(h.toLowerCase()))
          .map((h) => ({ ...makeHeader({ name: h, type: 'text', source: 'extracted' }), format: 'text', showInTable: false, mappedFrom: { slot: slotId, sheetHeader: h } }));
        return add.length ? { ...c, headers: [...c.headers, ...add] } : c;
      });
      addToast(`${extractedHeaders.length} columns extracted from ${file.name}`);
    } catch {
      addToast('Could not read that sample file', 'error');
    } finally {
      setBusySlot(null);
    }
  }

  function mapHeader(slotId, sheetHeader) {
    const headerId = pick[sheetHeader];
    if (!headerId) { addToast('Pick a header to map to', 'error'); return; }
    setConfig((c) => ({
      ...c,
      fileSlots: c.fileSlots.map((s) => (s.id === slotId ? { ...s, mappings: [...(s.mappings || []).filter((m) => m.sheetHeader !== sheetHeader), { sheetHeader, headerId }] } : s)),
      // remove the auto-added extracted header for this sheet column, and point
      // the chosen default/manual header at the sheet column instead.
      headers: c.headers
        .filter((h) => !(h.source === 'extracted' && h.mappedFrom?.slot === slotId && h.mappedFrom?.sheetHeader === sheetHeader))
        .map((h) => (h.id === headerId ? { ...h, mappedFrom: { slot: slotId, sheetHeader } } : h)),
    }));
  }

  function unmapHeader(slotId, sheetHeader, headerId) {
    setConfig((c) => {
      const target = c.headers.find((h) => h.id === headerId);
      const restored = target && target.source !== 'extracted'
        ? [{ ...makeHeader({ name: sheetHeader, type: 'text', source: 'extracted' }), format: 'text', showInTable: false, mappedFrom: { slot: slotId, sheetHeader } }]
        : [];
      return {
        ...c,
        fileSlots: c.fileSlots.map((s) => (s.id === slotId ? { ...s, mappings: (s.mappings || []).filter((m) => m.sheetHeader !== sheetHeader) } : s)),
        headers: [
          ...c.headers.map((h) => (h.id === headerId && h.source !== 'extracted' ? { ...h, mappedFrom: null } : h)),
          ...restored,
        ],
      };
    });
  }

  return (
    <div id="section-market-place" className="scroll-mt-24">
      <SectionHead title="Market Place" desc="Upload slots + the column mapping. Fill this first." />

      <div className="space-y-4 rounded-xl border border-divider bg-background p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={config.marketplace?.name || ''}
            onChange={(e) => updateMarketplace({ name: e.target.value })}
            placeholder="Marketplace name"
            className="min-w-[12rem] flex-1 rounded-lg border border-divider bg-background px-3 py-1.5 text-sm font-medium focus:border-accent focus:outline-none"
          />
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={config.visibility?.marketplaceInSidebar !== false} onChange={(e) => setMarketplaceVisible(e.target.checked)} className="accent-[var(--color-action)]" />
            Show marketplace to users
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[['companyHeaderId', 'Company filter header'], ['brandHeaderId', 'Brand filter header'], ['groupByHeaderId', 'Group table rows by']].map(([key, label]) => (
            <label key={key} className="text-[11px] font-medium text-muted">
              {label}
              <select
                value={config.marketplace?.[key] || ''}
                onChange={(e) => updateMarketplace({ [key]: e.target.value || null })}
                className="mt-1 w-full rounded-md border border-divider bg-background px-2 py-1.5 text-xs focus:outline-none"
              >
                <option value="">—</option>
                {headers.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </label>
          ))}
        </div>

        {/* File slots */}
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-foreground">Files</span>
          <button type="button" onClick={() => addItem('fileSlots', makeFileSlot('File', 'aux'))} className="inline-flex items-center gap-1 rounded-full border border-dashed border-divider-light px-2.5 py-1 text-[12px] font-medium text-action hover:bg-action-soft">
            <Plus size={12} /> Add File
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          {slots.map((s) => (
            <div key={s.id} className="w-56 rounded-lg border border-divider bg-card p-3">
              <div className="flex items-center gap-1.5">
                <input
                  value={s.label}
                  onChange={(e) => patchItem('fileSlots', s.id, { label: e.target.value })}
                  className="min-w-0 flex-1 rounded-md border border-divider bg-background px-2 py-1 text-[12.5px] font-medium focus:border-accent focus:outline-none"
                />
                <button type="button" onClick={() => removeItem('fileSlots', s.id)} className="rounded p-1 text-subtle hover:text-neg"><Trash2 size={12} /></button>
              </div>
              <label className="mt-2 inline-flex cursor-pointer items-center gap-1 rounded-md bg-action px-2 py-1 text-[11px] font-semibold text-white hover:bg-action-hover">
                {busySlot === s.id ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />} Upload File
                <input type="file" hidden accept=".csv,.xlsx,.xls,.pdf" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; uploadSample(s.id, f); }} />
              </label>
              <p className="mt-1.5 text-[10.5px] text-subtle">{(s.extractedHeaders || []).length} columns · sheet “{s.sheetNameHint || '—'}”</p>
              <div className="mt-1.5 flex gap-1">
                {['headerRowIndex', 'valueRowIndex'].map((k) => (
                  <label key={k} className="flex items-center gap-1 text-[10px] text-subtle">
                    {k === 'headerRowIndex' ? 'Header' : 'Value'}
                    <input type="number" min={1} value={s[k] || 1} onChange={(e) => patchItem('fileSlots', s.id, { [k]: Math.max(1, Number(e.target.value) || 1) })} className="w-12 rounded border border-divider bg-background px-1 py-0.5 text-[10px] focus:outline-none" />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

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
                  {h.mappedFrom && <span className="shrink-0 text-[10px] text-action">mapped</span>}
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
                  <button type="button" onClick={() => unmapHeader(m.slotId, m.sheetHeader, m.headerId)} className="rounded-full p-1 text-subtle hover:text-neg"><Minus size={11} /></button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
