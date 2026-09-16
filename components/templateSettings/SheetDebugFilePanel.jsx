'use client';

import { useMemo } from 'react';
import { Copy, Loader2 } from 'lucide-react';
import { detectPlatform, getPlatform, pickBestTab } from '@/data/platforms/index';
import { normHeader } from '@/data/platforms/canonical';
import { matchSlotHeaders } from '@/lib/sheet/matchSlotHeaders';
import { useToast } from '@/components/admin/Toast';

// One uploaded file's full debug breakdown — everything SheetDebugger used
// to render inline, split out so a file can be one tab of several (see
// SheetDebugger.jsx). Pure display + the handful of per-file interactions
// (pick a sheet, toggle raw JSON, show more rows, force header/value row).
export default function SheetDebugFilePanel({ record, slot = null, headers = [], onSelectSheet, onOverrideChange, onToggleRaw, onShowMore }) {
  const { addToast } = useToast();
  const { file, parsed, activeSheet, override, busy, error, showRaw, rowLimit } = record;

  const skippedSheets = useMemo(() => {
    if (!parsed) return [];
    const readable = new Set(parsed.sheetNames);
    return (parsed.allSheetNames || []).filter((n) => !readable.has(n));
  }, [parsed]);

  // Mirrors DashboardWorkspace.onUpload exactly: platform is detected off the
  // FIRST sheet's header row + the file name, then that platform's own
  // fingerprint picks the best tab across every sheet.
  const firstTab = parsed ? parsed.byTab[parsed.sheetNames[0]] : null;
  const detectedPlatformId = useMemo(
    () => (parsed && firstTab ? detectPlatform(firstTab.headerRow, parsed.fileName) : null),
    [parsed, firstTab],
  );
  const bestTabName = useMemo(
    () => (parsed && detectedPlatformId && parsed.sheetNames.length
      ? pickBestTab(detectedPlatformId, parsed.byTab, parsed.sheetNames)
      : null),
    [parsed, detectedPlatformId],
  );

  const activeTab = activeSheet ? parsed?.byTab?.[activeSheet] : null;
  const previewRows = activeTab ? activeTab.rows.slice(0, rowLimit) : [];

  // Same check DashboardWorkspace.onUpload runs before accepting a file —
  // `missing` is exactly why a real upload would get rejected. Each current
  // column is then classified against this slot's own mapping.
  const headerMatch = useMemo(() => {
    if (!activeTab || !slot) return null;
    const { ok, missing } = matchSlotHeaders(slot, activeTab.headerRow);
    const savedHeaders = slot.extractedHeaders || [];
    const savedSet = new Set(savedHeaders.map(normHeader));
    const mappedByNorm = new Map((slot.mappings || []).map((m) => [normHeader(m.sheetHeader), m]));
    const columns = activeTab.headerRow.filter(Boolean).map((h) => {
      const key = normHeader(h);
      const mapping = mappedByNorm.get(key);
      if (mapping) {
        const target = headers.find((x) => x.id === mapping.headerId);
        return { name: h, status: 'mapped', detail: target?.name || '(deleted header)' };
      }
      if (savedSet.has(key)) {
        return { name: h, status: 'unmapped', detail: "Extracted from this slot's sample, not mapped to a header yet — Market Place > Unmap Header" };
      }
      if (savedHeaders.length) {
        return { name: h, status: 'new', detail: "Not in this slot's saved sample — extra columns are never a problem (only a missing expected one is); re-upload this file as the sample to also map it" };
      }
      return { name: h, status: 'unsampled', detail: 'This slot has no saved sample yet — nothing to compare against' };
    });
    return { ok, missing, columns, hasSample: savedHeaders.length > 0 };
  }, [activeTab, slot, headers]);

  const copyHeaders = async () => {
    if (!activeTab) return;
    try {
      await navigator.clipboard.writeText(activeTab.headerRow.join(', '));
      addToast('Header row copied');
    } catch {
      addToast('Could not copy — clipboard blocked', 'error');
    }
  };

  if (busy) {
    return (
      <p className="flex items-center justify-center gap-2 rounded-xl border border-divider bg-background px-4 py-6 text-[12.5px] text-subtle">
        <Loader2 size={13} className="animate-spin" /> Reading {file?.name}…
      </p>
    );
  }
  if (error) return <p className="rounded-lg bg-neg/10 px-3 py-2 text-[12.5px] text-neg">{error}</p>;
  if (!parsed) return null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Sheets in workbook" value={parsed.allSheetNames?.length ?? 0} />
        <Stat label="Readable sheets" value={parsed.sheetNames.length} />
        <Stat label="All headers (union)" value={parsed.allHeaders?.length ?? 0} />
        <Stat label="Detected platform" value={detectedPlatformId ? getPlatform(detectedPlatformId)?.label || detectedPlatformId : '—'} />
        {slot && (
          <Stat
            label={`Match: ${slot.label}`}
            value={!headerMatch?.hasSample ? 'No sample yet' : headerMatch.ok ? 'OK' : `${headerMatch.missing.length} missing`}
          />
        )}
      </div>

      {skippedSheets.length > 0 && (
        <p className="rounded-lg bg-card px-3 py-2 text-[12px] text-subtle">
          Skipped (no data table found — merged banner rows only, or genuinely empty): {skippedSheets.join(', ')}
        </p>
      )}

      {bestTabName && parsed.sheetNames.length > 1 && (
        <p className="rounded-lg bg-action-soft px-3 py-2 text-[12px] text-action">
          A real upload of this file would read the <strong>“{bestTabName}”</strong> tab (best fingerprint match for {getPlatform(detectedPlatformId)?.label || detectedPlatformId}).
        </p>
      )}

      {/* header/value row override — pre-filled with whatever's actually in
          effect for the active sheet (the auto-detect result, or the
          override itself once one is set), not left blank, so it reads as
          "here's what's happening" rather than an unset field. */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-divider bg-card px-3 py-2">
        <span className="text-[11.5px] font-medium text-muted">Header/value row (applies to every sheet in this file, like a real file slot):</span>
        {['headerRowIndex', 'valueRowIndex'].map((k) => (
          <label key={k} className="flex items-center gap-1 text-[11px] text-subtle">
            {k === 'headerRowIndex' ? 'Header row' : 'Value row'}
            <input
              type="number"
              min={1}
              value={override[k]}
              placeholder={String(activeTab?.[k] ?? '')}
              onChange={(e) => onOverrideChange({ ...override, [k]: e.target.value })}
              className="w-14 rounded border border-divider bg-background px-1.5 py-0.5 text-[11px] focus:border-accent focus:outline-none"
            />
          </label>
        ))}
      </div>

      {parsed.allHeaders?.length > 0 && (
        <div className="rounded-xl border border-divider bg-background p-3">
          <div className="mb-1.5 text-[12.5px] font-semibold text-foreground">All headers across every sheet ({parsed.allHeaders.length})</div>
          <div className="flex flex-wrap gap-1.5">
            {parsed.allHeaders.map((h) => (
              <span key={h} className="rounded-full bg-card px-2 py-0.5 text-[11px] text-muted">{h}</span>
            ))}
          </div>
        </div>
      )}

      {parsed.sheetNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {parsed.sheetNames.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onSelectSheet(name)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                activeSheet === name ? 'bg-action text-white' : 'border border-divider bg-background text-muted hover:bg-card-hover'
              }`}
            >
              {name} · {parsed.byTab[name].rows.length} row{parsed.byTab[name].rows.length === 1 ? '' : 's'}
            </button>
          ))}
        </div>
      )}

      {activeTab && (
        <div className="space-y-3 rounded-xl border border-divider bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[12.5px] font-semibold text-foreground">
              “{activeSheet}” — {activeTab.headerRow.length} column{activeTab.headerRow.length === 1 ? '' : 's'} · {activeTab.rows.length} row{activeTab.rows.length === 1 ? '' : 's'}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={copyHeaders} className="inline-flex items-center gap-1 rounded-full border border-divider px-2.5 py-1 text-[11.5px] font-medium text-muted hover:bg-card-hover">
                <Copy size={11} /> Copy headers
              </button>
              <button type="button" onClick={onToggleRaw} className="rounded-full border border-divider px-2.5 py-1 text-[11.5px] font-medium text-muted hover:bg-card-hover">
                {showRaw ? 'Hide' : 'Show'} raw JSON
              </button>
            </div>
          </div>

          {headerMatch ? (
            <div className="space-y-2">
              {!headerMatch.hasSample ? (
                <p className="rounded-lg bg-card px-3 py-2 text-[12px] text-subtle">
                  “{slot.label}” has no saved sample yet in Template Settings — nothing to compare against, so every column below is unverified.
                </p>
              ) : headerMatch.ok ? (
                <p className="rounded-lg bg-action-soft px-3 py-2 text-[12px] text-action">
                  Every header “{slot.label}” expects is present — a real upload of this file would be accepted.
                </p>
              ) : (
                <p className="rounded-lg bg-neg/10 px-3 py-2 text-[12px] text-neg">
                  A real upload would be REJECTED — “{slot.label}” expects {headerMatch.missing.length} header{headerMatch.missing.length === 1 ? '' : 's'} this file doesn&rsquo;t have: {headerMatch.missing.join(', ')}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {headerMatch.columns.map((c, i) => (
                  <span
                    key={`${c.name}-${i}`}
                    title={c.detail}
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      c.status === 'mapped' ? 'bg-action-soft text-action' : 'bg-card text-muted'
                    }`}
                  >
                    {c.name}{c.status === 'mapped' ? ` → ${c.detail}` : ''}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {activeTab.headerRow.map((h, i) => {
                const meta = activeTab.headerMeta?.[h];
                return (
                  <span
                    key={`${h}-${i}`}
                    title={meta?.group || meta?.info ? `${meta.group || ''} ${meta.info || ''}`.trim() : undefined}
                    className="rounded-full bg-card px-2 py-0.5 text-[11px] text-foreground"
                  >
                    <span className="text-subtle">{i + 1}.</span> {h || <em className="text-subtle">(blank)</em>}
                  </span>
                );
              })}
            </div>
          )}

          {showRaw && (
            <pre className="max-h-64 overflow-auto rounded-lg bg-card p-3 text-[10.5px] text-muted">
              {JSON.stringify({ headerRow: activeTab.headerRow, groupRow: activeTab.groupRow, infoRow: activeTab.infoRow, headerMeta: activeTab.headerMeta }, null, 2)}
            </pre>
          )}

          {activeTab.rows.length === 0 ? (
            <p className="rounded-lg bg-card px-3 py-6 text-center text-[12px] text-subtle">No data rows under the header.</p>
          ) : (
            <>
              <div className="max-h-[28rem] overflow-auto rounded-lg border border-divider">
                <table className="w-full min-w-max text-[11.5px]">
                  <thead className="sticky top-0 bg-th">
                    <tr>
                      <th className="border-b border-divider px-2 py-1.5 text-left font-medium text-subtle">#</th>
                      {activeTab.headerRow.map((h, i) => (
                        <th key={`${h}-${i}`} className="border-b border-divider px-2 py-1.5 text-left font-medium text-muted whitespace-nowrap">{h || '—'}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, ri) => (
                      <tr key={ri} className="border-t border-divider hover:bg-card-hover">
                        <td className="px-2 py-1.5 text-subtle">{ri + 1}</td>
                        {activeTab.headerRow.map((h, ci) => (
                          <td key={`${h}-${ci}`} className="whitespace-nowrap px-2 py-1.5 text-foreground">{String(r[h] ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {activeTab.rows.length > previewRows.length && (
                <button type="button" onClick={onShowMore} className="text-[11.5px] font-medium text-action hover:underline">
                  Show 100 more rows ({previewRows.length} of {activeTab.rows.length} shown)
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-divider bg-background p-3">
      <div className="text-[10.5px] font-medium uppercase tracking-wide text-subtle">{label}</div>
      <div className="mt-0.5 truncate text-[15px] font-bold text-foreground" title={String(value)}>{value}</div>
    </div>
  );
}
