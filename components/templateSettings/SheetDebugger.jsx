'use client';

import { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, Loader2, Trash2, Upload, X } from 'lucide-react';
import { readAnyFile, ACCEPT } from '@/lib/sheet/readAnyFile';
import { isLoggedIn } from '@/lib/tokenStore';
import { deleteAllExtractedRows } from '@/lib/profitLoss/apiClient';
import { useToast } from '@/components/admin/Toast';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import SheetDebugFilePanel from './SheetDebugFilePanel';

// Raw sheet inspector — see exactly what lib/sheet/parseWorkbook.js (via
// readAnyFile) produced for a file: every sheet the workbook actually has
// vs. the ones it could read a data table out of, each readable sheet's
// header row + a data preview, and what the real upload pipeline
// (DashboardWorkspace.onUpload) would do with it. Purely a diagnostic
// tool: nothing here is saved, mapped, or sent anywhere.
//
// Holds MULTIPLE files at once, one tab per file (added, never replaced) —
// so uploading a second or third file to compare doesn't lose the first
// one's breakdown. Each tab keeps its own parse, active sheet, header/value
// row override, etc. (SheetDebugFilePanel renders one tab's worth).
//
// Two ways to feed it files: its own picker (the standalone /profit-loss/
// debug page), or `externalFile` — when embedded right under the
// dashboard's own upload toolbar, a picker of its own would just be a
// second "choose a file" sitting under the real one, so `showPicker={false}`
// there and DashboardWorkspace hands over every file uploaded above, each
// one landing as its own new tab automatically.
//
// `fileSlots` (every marketplace file slot) + `headers` (the global header
// list) are optional — when given, each tab is checked against exactly what
// a real upload of THAT tab's own file checks and against that same slot's
// mapping (see SheetDebugFilePanel). Which slot a tab belongs to is fixed
// onto the tab itself the moment it's created (`externalSlotId`, captured
// alongside `externalFile`) — never re-resolved against "whichever slot was
// most recently uploaded to", or uploading a second file to a different
// slot would silently change what an already-open tab is checked against.
export default function SheetDebugger({ externalFile = null, externalSlotId = null, showPicker = true, fileSlots = [], headers = [] }) {
  const { addToast } = useToast();
  const [files, setFiles] = useState([]);
  const [activeFileId, setActiveFileId] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const lastExternalFileRef = useRef(null);

  // Debug-only escape hatch — wipes every row this user has auto-saved
  // (profit_loss_extracted_rows), so a re-upload during testing starts from
  // a clean slate instead of merging into what's already there. Doesn't
  // touch anything else (settings, brands, the coin-metered Save to History
  // runs) — see the hub's DELETE /api/profit-loss/rows.
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const onDeleteAllHistory = async () => {
    setDeletingAll(true);
    try {
      const { ok, data } = await deleteAllExtractedRows();
      if (ok) addToast(`Deleted ${data.deleted ?? 0} saved row${data.deleted === 1 ? '' : 's'}`);
      else addToast(data?.error || 'Could not delete', 'error');
    } catch {
      addToast('Network error while deleting', 'error');
    } finally {
      setDeletingAll(false);
      setConfirmDeleteAll(false);
    }
  };

  const newRecord = (file, slotId = null) => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    slotId,
    parsed: null,
    activeSheet: null,
    override: { headerRowIndex: '', valueRowIndex: '' },
    busy: true,
    error: '',
    showRaw: false,
    rowLimit: 25,
  });

  const parseInto = async (id, file, override) => {
    setFiles((prev) => prev.map((r) => (r.id === id ? { ...r, busy: true, error: '' } : r)));
    try {
      const effectiveOverride = (override?.headerRowIndex || override?.valueRowIndex)
        ? { headerRowIndex: Number(override.headerRowIndex) || null, valueRowIndex: Number(override.valueRowIndex) || null }
        : null;
      const result = await readAnyFile(file, effectiveOverride);
      setFiles((prev) => prev.map((r) => (r.id === id ? {
        ...r,
        parsed: result,
        activeSheet: result.sheetNames.includes(r.activeSheet) ? r.activeSheet : (result.sheetNames[0] || null),
        rowLimit: 25,
        busy: false,
      } : r)));
      if (!result.sheetNames.length) addToast('No readable data table found in any sheet', 'error');
    } catch (err) {
      setFiles((prev) => prev.map((r) => (r.id === id ? { ...r, parsed: null, error: err?.message || 'Could not read that file.', busy: false } : r)));
    }
  };

  const addFile = (file) => {
    if (!file) return;
    const rec = newRecord(file);
    setFiles((prev) => [...prev, rec]);
    setActiveFileId(rec.id);
    parseInto(rec.id, file, null);
  };

  // Embedded mode: every file the toolbar above uploads (any slot, or SKU
  // Cost) lands here as its own new tab, auto-selected — a re-upload of the
  // same file name is still a *new* File instance, so this fires every
  // time. Inlined in the effect body (rather than calling addFile) so the
  // effect's own execution is what does the async work, matching the
  // pattern the rest of Template Settings' data loading already uses.
  useEffect(() => {
    if (!externalFile || externalFile === lastExternalFileRef.current) return;
    lastExternalFileRef.current = externalFile;
    const rec = newRecord(externalFile, externalSlotId);
    (async () => {
      setFiles((prev) => [...prev, rec]);
      setActiveFileId(rec.id);
      try {
        const result = await readAnyFile(externalFile, null);
        setFiles((prev) => prev.map((r) => (r.id === rec.id ? { ...r, parsed: result, activeSheet: result.sheetNames[0] || null, busy: false } : r)));
        if (!result.sheetNames.length) addToast('No readable data table found in any sheet', 'error');
      } catch (err) {
        setFiles((prev) => prev.map((r) => (r.id === rec.id ? { ...r, error: err?.message || 'Could not read that file.', busy: false } : r)));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalFile]);

  const removeFile = (id) => {
    setFiles((prev) => prev.filter((r) => r.id !== id));
    if (activeFileId === id) {
      const remaining = files.filter((r) => r.id !== id);
      setActiveFileId(remaining[remaining.length - 1]?.id || null);
    }
  };

  const onSelectSheet = (id, name) => setFiles((prev) => prev.map((r) => (r.id === id ? { ...r, activeSheet: name, rowLimit: 25 } : r)));
  const onToggleRaw = (id) => setFiles((prev) => prev.map((r) => (r.id === id ? { ...r, showRaw: !r.showRaw } : r)));
  const onShowMore = (id) => setFiles((prev) => prev.map((r) => (r.id === id ? { ...r, rowLimit: r.rowLimit + 100 } : r)));
  const onOverrideChange = (id, next) => {
    setFiles((prev) => prev.map((r) => (r.id === id ? { ...r, override: next } : r)));
    const rec = files.find((r) => r.id === id);
    if (rec) parseInto(id, rec.file, next);
  };

  const activeRecord = files.find((r) => r.id === activeFileId) || null;

  return (
    <>
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[15px] font-bold text-foreground">Sheet Debugger</h1>
          <p className="mt-0.5 text-[12.5px] text-subtle">
            {showPicker
              ? "Add any settlement/order/aux files and see every sheet each has, its header row + raw data, and what the real upload pipeline would detect from it. Nothing here is saved or mapped."
              : "Every file uploaded from the toolbar above lands here as its own tab — every sheet it has, its header row + raw data, and what the real upload pipeline detected. Nothing here is saved or mapped."}
          </p>
        </div>
        {isLoggedIn() && (
          <button
            type="button"
            onClick={() => setConfirmDeleteAll(true)}
            title="Debug only — wipes every row you've auto-saved (profit_loss_extracted_rows) for this account"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-neg/30 px-3 py-1.5 text-[12px] font-medium text-neg hover:bg-neg/10"
          >
            <Trash2 size={13} /> Delete All Saved Data
          </button>
        )}
      </div>

      {/* ── file picker — only in standalone mode; embedded under the
          dashboard's own upload toolbar, a second picker here would just
          be redundant, so tabs are driven by `externalFile` instead ── */}
      {showPicker && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); [...(e.dataTransfer.files || [])].forEach(addFile); }}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
            dragOver ? 'border-accent bg-accent/5' : 'border-divider-light bg-background'
          }`}
        >
          <FileSpreadsheet size={22} className="text-subtle" />
          <p className="text-[12.5px] text-subtle">Drag one or more files here, or</p>
          <label className="mt-1 inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-action px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-action-hover">
            <Upload size={12} /> Add file{files.length > 0 ? 's' : ''}
            <input
              ref={inputRef}
              type="file"
              hidden
              multiple
              accept={ACCEPT}
              onChange={(e) => { [...(e.target.files || [])].forEach(addFile); e.target.value = ''; }}
            />
          </label>
        </div>
      )}

      {!showPicker && files.length === 0 && (
        <p className="rounded-xl border border-dashed border-divider-light bg-background px-4 py-6 text-center text-[12.5px] text-subtle">
          Upload a file above (any Files button, or SKU Cost) to see its debug breakdown here.
        </p>
      )}

      {/* ── file tabs — one per uploaded file, never replaced. Each tab's
          own slot (shown under the filename when known) is what it's
          checked against, fixed at the moment the tab was created — a
          later upload to a different slot never changes an already-open
          tab's own check. ── */}
      {files.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {files.map((r) => {
            const tabSlot = fileSlots.find((s) => s.id === r.slotId) || null;
            return (
            <div
              key={r.id}
              className={`inline-flex items-center gap-1 rounded-full py-1 pl-3 pr-1.5 text-[12px] font-medium ${
                activeFileId === r.id ? 'bg-action text-white' : 'border border-divider bg-background text-muted hover:bg-card-hover'
              }`}
            >
              <button type="button" onClick={() => setActiveFileId(r.id)} className="flex max-w-[11rem] flex-col items-start leading-tight">
                <span className="flex max-w-full items-center gap-1 truncate">
                  {r.busy && <Loader2 size={10} className="shrink-0 animate-spin" />}
                  <span className="truncate">{r.file.name}</span>
                </span>
                {tabSlot && <span className={`text-[10px] font-normal ${activeFileId === r.id ? 'text-white/70' : 'text-subtle'}`}>{tabSlot.label}</span>}
              </button>
              <button
                type="button"
                onClick={() => removeFile(r.id)}
                title="Close this file"
                className={`shrink-0 rounded-full p-0.5 ${activeFileId === r.id ? 'hover:bg-white/20' : 'hover:text-neg'}`}
              >
                <X size={11} />
              </button>
            </div>
            );
          })}
        </div>
      )}

      {activeRecord && (
        <SheetDebugFilePanel
          record={activeRecord}
          slot={fileSlots.find((s) => s.id === activeRecord.slotId) || null}
          headers={headers}
          onSelectSheet={(name) => onSelectSheet(activeRecord.id, name)}
          onOverrideChange={(next) => onOverrideChange(activeRecord.id, next)}
          onToggleRaw={() => onToggleRaw(activeRecord.id)}
          onShowMore={() => onShowMore(activeRecord.id)}
        />
      )}
    </div>
    <ConfirmDialog
      open={confirmDeleteAll}
      title="Delete ALL saved data?"
      description="Debug only. Permanently deletes every row you've auto-saved for this account (profit_loss_extracted_rows) — not your settings, brands, or Save to History runs. This cannot be undone."
      confirmText="DELETE"
      confirmLabel="Delete All"
      loading={deletingAll}
      onConfirm={onDeleteAllHistory}
      onCancel={() => setConfirmDeleteAll(false)}
    />
    </>
  );
}
