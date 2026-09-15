'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import { readAnyFile, ACCEPT } from '@/lib/sheet/readAnyFile';
import { detectPlatform, getPlatform, pickBestTab } from '@/data/platforms/index';
import { normHeader } from '@/data/platforms/canonical';
import { matchSlotHeaders } from '@/lib/sheet/matchSlotHeaders';
import { useToast } from '@/components/admin/Toast';

// Raw sheet inspector — see exactly what lib/sheet/parseWorkbook.js (via
// readAnyFile) produced for a file: every sheet the workbook actually has
// vs. the ones it could read a data table out of, each readable sheet's
// header row + a data preview, and what the real upload pipeline
// (DashboardWorkspace.onUpload) would do with it — detected platform +
// which tab it'd pick. Purely a diagnostic tool: nothing here is saved,
// mapped, or sent anywhere.
//
// Two ways to feed it a file: its own picker (the standalone /profit-loss/
// debug page), or `externalFile` — when embedded right under the
// dashboard's own upload toolbar, a picker of its own would just be a
// second "choose a file" sitting under the real one, so `showPicker={false}`
// there and DashboardWorkspace hands over whatever was last uploaded above.
//
// `slot` (the marketplace file slot the upload went to) + `headers` (the
// global header list, to resolve a mapping's target name) are optional —
// when given, the active sheet's columns get checked against exactly what
// a real upload checks (lib/sheet/matchSlotHeaders — the same missing-
// header list that rejects an upload) and against this slot's own mapping,
// so it's visible which columns are mapped, which are extracted but still
// unmapped, which are new since the slot was last sampled, and — the
// actual cause of an upload getting rejected — which of the slot's saved
// headers this file is missing.
export default function SheetDebugger({ externalFile = null, showPicker = true, slot = null, headers = [] }) {
  const { addToast } = useToast();
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [activeSheet, setActiveSheet] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [override, setOverride] = useState({ headerRowIndex: '', valueRowIndex: '' });
  const [rowLimit, setRowLimit] = useState(25);
  const [showRaw, setShowRaw] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const runParse = useCallback(async (f, ov) => {
    setBusy(true);
    setError('');
    try {
      const effectiveOverride = (ov?.headerRowIndex || ov?.valueRowIndex)
        ? { headerRowIndex: Number(ov.headerRowIndex) || null, valueRowIndex: Number(ov.valueRowIndex) || null }
        : null;
      const result = await readAnyFile(f, effectiveOverride);
      setParsed(result);
      setActiveSheet((prev) => (result.sheetNames.includes(prev) ? prev : result.sheetNames[0] || null));
      setRowLimit(25);
      if (!result.sheetNames.length) addToast('No readable data table found in any sheet', 'error');
    } catch (err) {
      setParsed(null);
      setError(err?.message || 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  }, [addToast]);

  const onPick = useCallback((f) => {
    if (!f) return;
    setFile(f);
    setOverride({ headerRowIndex: '', valueRowIndex: '' });
    runParse(f, null);
  }, [runParse]);

  // Embedded mode: re-run whenever the toolbar above hands over a newly
  // uploaded file — a re-upload of the same file name is still a *new* File
  // instance, so this fires every time, not just once. Inlined (rather than
  // calling onPick/runParse) so the effect's own body is what does the
  // async work, matching the pattern the rest of Template Settings' data
  // loading already uses.
  useEffect(() => {
    if (!externalFile || externalFile === file) return;
    (async () => {
      setFile(externalFile);
      setOverride({ headerRowIndex: '', valueRowIndex: '' });
      setBusy(true);
      setError('');
      try {
        const result = await readAnyFile(externalFile, null);
        setParsed(result);
        setActiveSheet((prev) => (result.sheetNames.includes(prev) ? prev : result.sheetNames[0] || null));
        setRowLimit(25);
      } catch (err) {
        setParsed(null);
        setError(err?.message || 'Could not read that file.');
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalFile]);

  const onOverrideChange = (next) => {
    setOverride(next);
    if (file) runParse(file, next);
  };

  const clear = () => {
    setFile(null);
    setParsed(null);
    setActiveSheet(null);
    setError('');
    setOverride({ headerRowIndex: '', valueRowIndex: '' });
    if (inputRef.current) inputRef.current.value = '';
  };

  const skippedSheets = useMemo(() => {
    if (!parsed) return [];
    const readable = new Set(parsed.sheetNames);
    return (parsed.allSheetNames || []).filter((n) => !readable.has(n));
  }, [parsed]);

  // Mirrors DashboardWorkspace.onUpload exactly: platform is detected off the
  // FIRST sheet's header row + the file name, then that platform's own
  // fingerprint picks the best tab across every sheet — same thing a real
  // marketplace file button would do with this exact file.
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
  // column is then classified against this slot's own mapping: already
  // mapped to a header (and which), extracted from a past sample but still
  // unmapped, or new since that sample was taken.
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
        return { name: h, status: 'new', detail: "Wasn't in this slot's saved sample — re-upload this file there to pick it up" };
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

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-[15px] font-bold text-foreground">Sheet Debugger</h1>
        <p className="mt-0.5 text-[12.5px] text-subtle">
          {showPicker
            ? "Upload any settlement/order/aux file and see every sheet it has, each one's header row + raw data, and what the real upload pipeline would detect from it. Nothing here is saved or mapped."
            : "Shows the last file uploaded from the toolbar above — every sheet it has, each one's header row + raw data, and what the real upload pipeline detected from it. Nothing here is saved or mapped."}
        </p>
      </div>

      {/* ── file picker — only in standalone mode; embedded under the
          dashboard's own upload toolbar, a second picker here would just
          be redundant, so `file`/`parsed` are driven by `externalFile`
          instead (see the effect above) ── */}
      {showPicker && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); onPick(e.dataTransfer.files?.[0]); }}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
            dragOver ? 'border-accent bg-accent/5' : 'border-divider-light bg-background'
          }`}
        >
          <FileSpreadsheet size={22} className="text-subtle" />
          {file ? (
            <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
              {file.name}
              <button type="button" onClick={clear} className="rounded-full p-0.5 text-subtle hover:text-neg" title="Clear">
                <X size={13} />
              </button>
            </div>
          ) : (
            <p className="text-[12.5px] text-subtle">Drag a file here, or</p>
          )}
          <label className="mt-1 inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-action px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-action-hover">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} {file ? 'Choose a different file' : 'Choose a file'}
            <input ref={inputRef} type="file" hidden accept={ACCEPT} onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>
      )}

      {!showPicker && !parsed && !busy && (
        <p className="rounded-xl border border-dashed border-divider-light bg-background px-4 py-6 text-center text-[12.5px] text-subtle">
          Upload a file above (any Files button, or SKU Cost) to see its debug breakdown here.
        </p>
      )}
      {!showPicker && busy && (
        <p className="flex items-center justify-center gap-2 rounded-xl border border-divider bg-background px-4 py-6 text-[12.5px] text-subtle">
          <Loader2 size={13} className="animate-spin" /> Reading {file?.name}…
        </p>
      )}
      {!showPicker && file && !busy && (
        <p className="text-[11.5px] text-subtle">Debugging the last file uploaded above: <span className="font-medium text-foreground">{file.name}</span></p>
      )}

      {error && <p className="rounded-lg bg-neg/10 px-3 py-2 text-[12.5px] text-neg">{error}</p>}

      {parsed && (
        <>
          {/* ── summary ── */}
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

          {/* ── header/value row override, same fields a file slot has ── */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-divider bg-card px-3 py-2">
            <span className="text-[11.5px] font-medium text-muted">Force header/value row (blank = auto-detect):</span>
            {['headerRowIndex', 'valueRowIndex'].map((k) => (
              <label key={k} className="flex items-center gap-1 text-[11px] text-subtle">
                {k === 'headerRowIndex' ? 'Header row' : 'Value row'}
                <input
                  type="number"
                  min={1}
                  value={override[k]}
                  onChange={(e) => onOverrideChange({ ...override, [k]: e.target.value })}
                  className="w-14 rounded border border-divider bg-background px-1.5 py-0.5 text-[11px] focus:border-accent focus:outline-none"
                />
              </label>
            ))}
          </div>

          {/* ── all headers, union across every readable sheet ── */}
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

          {/* ── sheet tabs ── */}
          {parsed.sheetNames.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {parsed.sheetNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => { setActiveSheet(name); setRowLimit(25); }}
                  className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                    activeSheet === name ? 'bg-action text-white' : 'border border-divider bg-background text-muted hover:bg-card-hover'
                  }`}
                >
                  {name} · {parsed.byTab[name].rows.length} row{parsed.byTab[name].rows.length === 1 ? '' : 's'}
                </button>
              ))}
            </div>
          )}

          {/* ── active sheet detail ── */}
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
                  <button type="button" onClick={() => setShowRaw((s) => !s)} className="rounded-full border border-divider px-2.5 py-1 text-[11.5px] font-medium text-muted hover:bg-card-hover">
                    {showRaw ? 'Hide' : 'Show'} raw JSON
                  </button>
                </div>
              </div>

              {/* header list — plain numbered chips (no slot context given),
                  or a match-status view against the marketplace slot this
                  file was uploaded to: mapped (→ target header), extracted
                  but not yet mapped, new since the last sample, and —
                  separately — exactly which of the slot's expected headers
                  this file is missing, the real reason an upload gets
                  rejected. */}
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
                          c.status === 'mapped' ? 'bg-action-soft text-action'
                            : c.status === 'new' ? 'bg-amber-500/10 text-amber-600'
                            : 'bg-card text-muted'
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

              {/* data preview */}
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
                    <button
                      type="button"
                      onClick={() => setRowLimit((n) => n + 100)}
                      className="text-[11.5px] font-medium text-action hover:underline"
                    >
                      Show 100 more rows ({previewRows.length} of {activeTab.rows.length} shown)
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </>
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
