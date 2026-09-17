'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  GitMerge,
  HelpCircle,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Table,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { readAnyFile, ACCEPT } from '@/lib/sheet/readAnyFile';
import { isLoggedIn } from '@/lib/tokenStore';
import { deleteAllExtractedRows, listExtractedRows } from '@/lib/profitLoss/apiClient';
import { mergeUploadsAcrossSlots } from '@/lib/profitLoss/mergeRows';
import { readHeaderFromRow, normalizeOrderId } from '@/lib/profitLoss/resolveTemplate';
import { RESERVED_HEADER_IDS } from '@/data/templateSchema';
import { normHeader } from '@/data/platforms/canonical';
import { useToast } from '@/components/admin/Toast';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import SheetDebugFilePanel from './SheetDebugFilePanel';

export default function NextLevelSheetDebugger({
  externalFile = null,
  externalSlotId = null,
  showPicker = true,
  fileSlots = [],
  headers = [],
}) {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('reconciliation'); // 'reconciliation' | 'uniqueness' | 'merged' | 'database' | 'rawFiles'
  const [files, setFiles] = useState([]);
  const [activeFileId, setActiveFileId] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const lastExternalFileRef = useRef(null);

  // Database audit state
  const [dbRows, setDbRows] = useState([]);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbTotalCount, setDbTotalCount] = useState(0);

  // Delete all confirmation
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  // Load database saved rows
  const fetchDbSavedRows = async () => {
    if (!isLoggedIn()) return;
    setDbLoading(true);
    try {
      const { ok, data } = await listExtractedRows({ page: 1, limit: 100 });
      if (ok) {
        setDbRows(data.rows || []);
        setDbTotalCount(data.totalCount || 0);
      }
    } catch {
      // ignore
    } finally {
      setDbLoading(false);
    }
  };

  useEffect(() => {
    fetchDbSavedRows();
  }, []);

  const onDeleteAllHistory = async () => {
    setDeletingAll(true);
    try {
      const { ok, data } = await deleteAllExtractedRows();
      if (ok) {
        addToast(`Deleted ${data.deleted ?? 0} saved row${data.deleted === 1 ? '' : 's'}`);
        fetchDbSavedRows();
      } else addToast(data?.error || 'Could not delete', 'error');
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
      const effectiveOverride = override?.headerRowIndex || override?.valueRowIndex
        ? { headerRowIndex: Number(override.headerRowIndex) || null, valueRowIndex: Number(override.valueRowIndex) || null }
        : null;
      const result = await readAnyFile(file, effectiveOverride);
      setFiles((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                parsed: result,
                activeSheet: result.sheetNames.includes(r.activeSheet) ? r.activeSheet : result.sheetNames[0] || null,
                rowLimit: 25,
                busy: false,
              }
            : r
        )
      );
      if (!result.sheetNames.length) addToast('No readable data table found in any sheet', 'error');
    } catch (err) {
      setFiles((prev) => prev.map((r) => (r.id === id ? { ...r, parsed: null, error: err?.message || 'Could not read file.', busy: false } : r)));
    }
  };

  const addFile = (file) => {
    if (!file) return;
    const rec = newRecord(file);
    setFiles((prev) => [...prev, rec]);
    setActiveFileId(rec.id);
    parseInto(rec.id, file, null);
  };

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
      } catch (err) {
        setFiles((prev) => prev.map((r) => (r.id === rec.id ? { ...r, error: err?.message || 'Could not read file.', busy: false } : r)));
      }
    })();
  }, [externalFile, externalSlotId]);

  const removeFile = (id) => {
    setFiles((prev) => prev.filter((r) => r.id !== id));
    if (activeFileId === id) {
      const remaining = files.filter((r) => r.id !== id);
      setActiveFileId(remaining[remaining.length - 1]?.id || null);
    }
  };

  // ── Uniqueness & Merged Rows calculation ──────────────────────────────────
  const orderIdHeader = useMemo(() => headers.find((h) => h.id === RESERVED_HEADER_IDS.orderId) || null, [headers]);
  const transactionIdHeader = useMemo(() => headers.find((h) => h.id === RESERVED_HEADER_IDS.transactionId) || null, [headers]);

  const rawParsedUploads = useMemo(() => {
    return files
      .filter((f) => f.parsed && f.activeSheet && f.parsed.byTab[f.activeSheet])
      .map((f) => ({
        slotId: f.slotId || f.id,
        fileName: f.file.name,
        rows: f.parsed.byTab[f.activeSheet].rows.map((raw) => ({ meta: raw })),
      }));
  }, [files]);

  const totalRawRowsCount = useMemo(() => {
    return rawParsedUploads.reduce((sum, u) => sum + u.rows.length, 0);
  }, [rawParsedUploads]);

  const mergedRows = useMemo(() => {
    if (!totalRawRowsCount) return [];
    return mergeUploadsAcrossSlots(rawParsedUploads, orderIdHeader, transactionIdHeader);
  }, [rawParsedUploads, orderIdHeader, transactionIdHeader, totalRawRowsCount]);

  const uniquenessStats = useMemo(() => {
    const orderIds = new Set();
    const txnIds = new Set();
    let mergedCount = 0;

    mergedRows.forEach((r) => {
      const oVal = orderIdHeader ? readHeaderFromRow(orderIdHeader, r) : (r.orderId || r.meta?.Order_ID || r.meta?.Sub_Order_ID);
      const tVal = transactionIdHeader ? readHeaderFromRow(transactionIdHeader, r) : (r.settlementId || r.meta?.Transaction_ID || r.meta?.Jio_Transaction_ID);

      if (oVal) orderIds.add(String(oVal).trim());
      if (tVal) txnIds.add(String(tVal).trim());
    });

    return {
      rawTotal: totalRawRowsCount,
      mergedTotal: mergedRows.length,
      uniqueOrderIds: orderIds.size,
      uniqueTxnIds: txnIds.size,
      collapsedCount: totalRawRowsCount - mergedRows.length,
    };
  }, [mergedRows, totalRawRowsCount, orderIdHeader, transactionIdHeader]);

  // ── Header Reconciliation Matrix ──────────────────────────────────────────
  const reconciliationMatrix = useMemo(() => {
    const list = [];
    headers.forEach((h) => {
      const hNameNorm = normHeader(h.name);
      const hIdNorm = normHeader(h.id);

      const matchedInFiles = [];
      files.forEach((f) => {
        if (!f.parsed || !f.activeSheet || !f.parsed.byTab[f.activeSheet]) return;
        const sheetHeaders = f.parsed.byTab[f.activeSheet].headerRow || [];
        const found = sheetHeaders.find((sh) => {
          const sNorm = normHeader(sh);
          return sNorm === hNameNorm || sNorm === hIdNorm || (h.mappedFrom?.sheetHeader && normHeader(h.mappedFrom.sheetHeader) === sNorm);
        });
        if (found) {
          matchedInFiles.push({ fileName: f.file.name, sheetHeader: found });
        }
      });

      list.push({
        headerId: h.id,
        headerName: h.name,
        type: h.type,
        primitive: h.primitive || '—',
        mappedFromSlot: h.mappedFrom?.slot || 'Global',
        mappedFromHeader: h.mappedFrom?.sheetHeader || '—',
        matches: matchedInFiles,
        isMatched: matchedInFiles.length > 0 || !!h.primitive,
      });
    });
    return list;
  }, [headers, files]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Top Header & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-divider pb-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-action" size={22} />
            <h1 className="text-lg font-bold text-foreground">Next-Level Extraction & Header Debugger</h1>
            <span className="rounded-full bg-action/10 px-2.5 py-0.5 text-[11px] font-bold text-action">
              PRO DIAGNOSTIC
            </span>
          </div>
          <p className="mt-1 text-[12.5px] text-subtle">
            Inspect header matching, Order ID & Transaction ID uniqueness, merged extracted rows, and saved database payloads.
          </p>
        </div>

        {isLoggedIn() && (
          <button
            type="button"
            onClick={() => setConfirmDeleteAll(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-neg/30 bg-neg/10 px-3 py-1.5 text-[12px] font-semibold text-neg hover:bg-neg/20"
          >
            <Trash2 size={13} /> Reset All Saved Database Rows
          </button>
        )}
      </div>

      {/* Main Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-divider pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('reconciliation')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold transition-colors ${
            activeTab === 'reconciliation' ? 'bg-action text-white' : 'bg-surface text-muted hover:bg-card-hover'
          }`}
        >
          <Layers size={14} /> Header Match Matrix ({reconciliationMatrix.filter((m) => m.isMatched).length}/{reconciliationMatrix.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('uniqueness')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold transition-colors ${
            activeTab === 'uniqueness' ? 'bg-action text-white' : 'bg-surface text-muted hover:bg-card-hover'
          }`}
        >
          <GitMerge size={14} /> Uniqueness & Merging Audit ({uniquenessStats.mergedTotal} Rows)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('merged')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold transition-colors ${
            activeTab === 'merged' ? 'bg-action text-white' : 'bg-surface text-muted hover:bg-card-hover'
          }`}
        >
          <Table size={14} /> Merged Common Headers Table
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('database')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold transition-colors ${
            activeTab === 'database' ? 'bg-action text-white' : 'bg-surface text-muted hover:bg-card-hover'
          }`}
        >
          <Database size={14} /> Database Saved Rows ({dbTotalCount})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('rawFiles')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold transition-colors ${
            activeTab === 'rawFiles' ? 'bg-action text-white' : 'bg-surface text-muted hover:bg-card-hover'
          }`}
        >
          <FileSpreadsheet size={14} /> Raw File Inspector ({files.length})
        </button>
      </div>

      {/* ── File Uploader Dropzone ────────────────────────────────────────── */}
      {showPicker && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            [...(e.dataTransfer.files || [])].forEach(addFile);
          }}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
            dragOver ? 'border-action bg-action/5' : 'border-divider bg-card'
          }`}
        >
          <FileSpreadsheet size={24} className="text-subtle" />
          <p className="text-[12.5px] text-subtle">
            Drop sample CSV / XLSX files here to debug extraction across marketplace tabs and saved headers.
          </p>
          <label className="mt-1 inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-action px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-action-hover">
            <Upload size={13} /> Select Files to Debug
            <input
              ref={inputRef}
              type="file"
              hidden
              multiple
              accept={ACCEPT}
              onChange={(e) => {
                [...(e.target.files || [])].forEach(addFile);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      )}

      {/* ── TAB 1: Header Match Matrix ────────────────────────────────────── */}
      {activeTab === 'reconciliation' && (
        <div className="space-y-4 rounded-xl border border-divider bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-foreground">Header Reconciliation Matrix</h2>
            <span className="text-[12px] text-subtle">
              Matches global tab headers with uploaded sheet headers across all files
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-divider">
            <table className="w-full text-left text-[11.5px]">
              <thead className="bg-th font-semibold text-muted">
                <tr>
                  <th className="border-b border-divider px-3 py-2">Header Name</th>
                  <th className="border-b border-divider px-3 py-2">Type</th>
                  <th className="border-b border-divider px-3 py-2">Primitive / Logic</th>
                  <th className="border-b border-divider px-3 py-2">Target Sheet Header</th>
                  <th className="border-b border-divider px-3 py-2">Status</th>
                  <th className="border-b border-divider px-3 py-2">Detected in Files</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {reconciliationMatrix.map((item) => (
                  <tr key={item.headerId} className="hover:bg-card-hover">
                    <td className="px-3 py-2 font-bold text-foreground">{item.headerName}</td>
                    <td className="px-3 py-2 text-subtle">{item.type}</td>
                    <td className="px-3 py-2 font-mono text-muted">{item.primitive}</td>
                    <td className="px-3 py-2 font-mono text-foreground">{item.mappedFromHeader}</td>
                    <td className="px-3 py-2">
                      {item.isMatched ? (
                        <span className="inline-flex items-center gap-1 text-pos font-semibold">
                          <CheckCircle2 size={13} /> Matched
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-warn font-semibold">
                          <AlertTriangle size={13} /> Unmapped
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {item.matches.length > 0 ? (
                        item.matches.map((m, idx) => (
                          <span key={idx} className="mr-1 inline-block rounded bg-action/10 px-1.5 py-0.5 text-[10.5px] font-medium text-action">
                            {m.fileName} → {m.sheetHeader}
                          </span>
                        ))
                      ) : (
                        <span className="text-subtle italic">None</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 2: Uniqueness & Merging Audit ────────────────────────────── */}
      {activeTab === 'uniqueness' && (
        <div className="space-y-5 rounded-xl border border-divider bg-card p-5">
          <h2 className="text-[15px] font-bold text-foreground">Order ID & Transaction ID Uniqueness Audit</h2>

          {/* Stat Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-lg border border-divider bg-surface p-3 text-center">
              <div className="text-[11px] font-semibold text-subtle">Total Raw Rows</div>
              <div className="mt-1 text-lg font-bold text-foreground">{uniquenessStats.rawTotal}</div>
            </div>
            <div className="rounded-lg border border-divider bg-surface p-3 text-center">
              <div className="text-[11px] font-semibold text-subtle">Unique Order IDs</div>
              <div className="mt-1 text-lg font-bold text-action">{uniquenessStats.uniqueOrderIds}</div>
            </div>
            <div className="rounded-lg border border-divider bg-surface p-3 text-center">
              <div className="text-[11px] font-semibold text-subtle">Unique Transaction IDs</div>
              <div className="mt-1 text-lg font-bold text-pos">{uniquenessStats.uniqueTxnIds}</div>
            </div>
            <div className="rounded-lg border border-divider bg-surface p-3 text-center">
              <div className="text-[11px] font-semibold text-subtle">Merged Result Rows</div>
              <div className="mt-1 text-lg font-bold text-foreground">{uniquenessStats.mergedTotal}</div>
            </div>
            <div className="rounded-lg border border-divider bg-surface p-3 text-center">
              <div className="text-[11px] font-semibold text-subtle">Collapsed / Enriched</div>
              <div className="mt-1 text-lg font-bold text-muted">{uniquenessStats.collapsedCount}</div>
            </div>
          </div>

          <div className="rounded-lg border border-divider bg-surface p-4 text-[12px] text-subtle">
            <p className="font-semibold text-foreground">How Uniqueness &amp; Merging is Enforced:</p>
            <ul className="mt-1.5 list-disc pl-5 space-y-1">
              <li>Whichever rows share an exact <strong>Order ID + Transaction ID</strong> across different file slots are merged into a single composite row.</li>
              <li>Order ID suffixes (e.g. <code>_1</code>, <code>_2</code>) are normalized to link Order sheets and Payment line-items.</li>
              <li>All extracted headers from both files are preserved without overwriting valid data.</li>
            </ul>
          </div>
        </div>
      )}

      {/* ── TAB 3: Merged Common Headers Table ───────────────────────────── */}
      {activeTab === 'merged' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-divider bg-card p-4">
            <div className="text-[13px] font-bold text-foreground">Merged Preview Data ({mergedRows.length} Rows)</div>
            <p className="text-[12px] text-subtle">
              Full table preview of all merged rows across uploaded files and slots.
            </p>
          </div>
        </div>
      )}

      {/* ── TAB 4: Database Saved Rows Audit ─────────────────────────────── */}
      {activeTab === 'database' && (
        <div className="space-y-4 rounded-xl border border-divider bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-bold text-foreground">Database Saved Extraction Rows</h2>
              <p className="text-[12px] text-subtle">
                Rows auto-saved in Supabase table <code>profit_loss_extracted_rows</code> for your user account.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchDbSavedRows}
              disabled={dbLoading}
              className="inline-flex items-center gap-1 rounded-lg border border-divider bg-surface px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-card-hover"
            >
              <RefreshCw size={13} className={dbLoading ? 'animate-spin' : ''} /> Refresh DB
            </button>
          </div>

          {dbRows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-divider p-8 text-center text-[12.5px] text-subtle">
              No auto-saved rows found in database for your account yet. Upload data while signed in to auto-save.
            </div>
          ) : (
            <div className="max-h-[30rem] overflow-auto rounded-lg border border-divider">
              <table className="w-full text-left text-[11.5px]">
                <thead className="sticky top-0 bg-th font-semibold text-muted">
                  <tr>
                    <th className="border-b border-divider px-3 py-2">#</th>
                    <th className="border-b border-divider px-3 py-2">Order ID</th>
                    <th className="border-b border-divider px-3 py-2">Transaction ID</th>
                    <th className="border-b border-divider px-3 py-2">SKU</th>
                    <th className="border-b border-divider px-3 py-2">Platform / Brand</th>
                    <th className="border-b border-divider px-3 py-2">Extracted Headers JSON</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider bg-card">
                  {dbRows.map((r, idx) => (
                    <tr key={r.id || idx} className="hover:bg-card-hover">
                      <td className="px-3 py-2 font-mono text-subtle">{idx + 1}</td>
                      <td className="px-3 py-2 font-mono font-medium text-foreground">{r.order_id || '—'}</td>
                      <td className="px-3 py-2 font-mono text-muted">{r.transaction_id || '—'}</td>
                      <td className="px-3 py-2 font-medium text-foreground">{r.sku || '—'}</td>
                      <td className="px-3 py-2 text-subtle">
                        {r.platform} {r.brand && `(${r.brand})`}
                      </td>
                      <td className="px-3 py-2 font-mono text-[10.5px] text-muted max-w-[300px] truncate" title={JSON.stringify(r.extracted_data)}>
                        {JSON.stringify(r.extracted_data || {})}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 5: Raw File Inspector ─────────────────────────────────────── */}
      {activeTab === 'rawFiles' && activeRecord && (
        <SheetDebugFilePanel
          record={activeRecord}
          slot={fileSlots.find((s) => s.id === activeRecord.slotId) || null}
          headers={headers}
          onSelectSheet={(name) => setFiles((prev) => prev.map((r) => (r.id === activeRecord.id ? { ...r, activeSheet: name, rowLimit: 25 } : r)))}
          onOverrideChange={(next) => parseInto(activeRecord.id, activeRecord.file, next)}
          onToggleRaw={() => setFiles((prev) => prev.map((r) => (r.id === activeRecord.id ? { ...r, showRaw: !r.showRaw } : r)))}
          onShowMore={() => setFiles((prev) => prev.map((r) => (r.id === activeRecord.id ? { ...r, rowLimit: r.rowLimit + 100 } : r)))}
        />
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmDeleteAll}
        title="Delete ALL saved database rows?"
        description="Permanently deletes every row auto-saved for this account (profit_loss_extracted_rows). This cannot be undone."
        confirmText="DELETE"
        confirmLabel="Delete All"
        loading={deletingAll}
        onConfirm={onDeleteAllHistory}
        onCancel={() => setConfirmDeleteAll(false)}
      />
    </div>
  );
}
