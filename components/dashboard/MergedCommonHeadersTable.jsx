'use client';

import { useMemo, useState } from 'react';
import { Download, FileText, Layers, Search, Table as TableIcon } from 'lucide-react';
import { readHeaderFromRow } from '@/lib/profitLoss/resolveTemplate';
import { normHeader } from '@/data/platforms/canonical';

export default function MergedCommonHeadersTable({ canonicalRows = [], config = {}, uploads = [] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [pageLimit, setPageLimit] = useState(50);

  // 1. Gather all global/tab headers & raw meta headers across all uploaded rows
  const globalHeaders = useMemo(() => config?.headers || [], [config]);

  const allMetaKeys = useMemo(() => {
    const keys = new Set();
    globalHeaders.forEach((h) => keys.add(h.name));
    canonicalRows.forEach((r) => {
      if (r.meta) {
        Object.keys(r.meta).forEach((k) => keys.add(k));
      }
    });
    return [...keys];
  }, [globalHeaders, canonicalRows]);

  // 2. Identify common headers (present in 2+ rows or active template headers)
  const headerStats = useMemo(() => {
    const counts = new Map();
    canonicalRows.forEach((r) => {
      allMetaKeys.forEach((key) => {
        let val = null;
        if (r.meta && key in r.meta) val = r.meta[key];
        else {
          const gh = globalHeaders.find((h) => h.name === key);
          if (gh) val = readHeaderFromRow(gh, r);
        }
        if (val != null && String(val).trim() !== '') {
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      });
    });
    return counts;
  }, [allMetaKeys, canonicalRows, globalHeaders]);

  const activeHeaders = useMemo(() => {
    return allMetaKeys.filter((k) => (headerStats.get(k) || 0) > 0);
  }, [allMetaKeys, headerStats]);

  // 3. Filtered rows by search
  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return canonicalRows;
    const term = searchTerm.toLowerCase();
    return canonicalRows.filter((r) => {
      if (r.orderId && r.orderId.toLowerCase().includes(term)) return true;
      if (r.settlementId && r.settlementId.toLowerCase().includes(term)) return true;
      if (r.sku && r.sku.toLowerCase().includes(term)) return true;
      if (r.platform && r.platform.toLowerCase().includes(term)) return true;
      if (r.brand && r.brand.toLowerCase().includes(term)) return true;
      for (const [k, v] of Object.entries(r.meta || {})) {
        if (v != null && String(v).toLowerCase().includes(term)) return true;
      }
      return false;
    });
  }, [canonicalRows, searchTerm]);

  const displayedRows = useMemo(() => filteredRows.slice(0, pageLimit), [filteredRows, pageLimit]);

  // Download CSV helper
  const handleExportCsv = () => {
    if (!filteredRows.length) return;
    const cols = ['Order ID', 'Transaction ID', 'SKU', 'Platform', 'Brand', ...activeHeaders];
    const csvLines = [cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')];

    filteredRows.forEach((r) => {
      const line = [
        r.orderId || '',
        r.settlementId || '',
        r.sku !== '—' ? r.sku : '',
        r.platform || '',
        r.brand || '',
        ...activeHeaders.map((hName) => {
          let val = r.meta?.[hName];
          if (val == null) {
            const gh = globalHeaders.find((h) => h.name === hName);
            if (gh) val = readHeaderFromRow(gh, r);
          }
          return val != null ? String(val) : '';
        }),
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
      csvLines.push(line);
    });

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `merged_extracted_common_headers_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-8 space-y-4 rounded-xl border border-divider bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider pb-4">
        <div>
          <div className="flex items-center gap-2">
            <TableIcon className="text-action" size={18} />
            <h2 className="text-[15px] font-bold text-foreground">Merged Extracted Common Headers Data</h2>
            <span className="rounded-full bg-action/10 px-2.5 py-0.5 text-[11px] font-semibold text-action">
              {canonicalRows.length} Total Merged Rows
            </span>
          </div>
          <p className="mt-1 text-[12px] text-subtle">
            Consolidated data extracted across all marketplace sheets & tabs, matched by Order ID and Transaction ID.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!filteredRows.length}
            className="inline-flex items-center gap-1.5 rounded-lg border border-divider bg-surface px-3 py-1.5 text-[12px] font-semibold text-foreground hover:bg-card-hover disabled:opacity-50"
          >
            <Download size={13} /> Export Merged CSV
          </button>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[240px] flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" size={14} />
          <input
            type="text"
            placeholder="Search Order ID, Transaction ID, SKU, value..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-divider bg-surface py-1.5 pl-8 pr-3 text-[12px] text-foreground placeholder:text-subtle focus:border-action focus:outline-none"
          />
        </div>

        <div className="text-[12px] font-medium text-subtle">
          Showing <span className="font-bold text-foreground">{displayedRows.length}</span> of {filteredRows.length} rows ({activeHeaders.length} Extracted Common Headers)
        </div>
      </div>

      {/* Headers pills */}
      {activeHeaders.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-surface/50 p-2 text-[11px]">
          <span className="font-semibold text-subtle">Extracted Headers:</span>
          {activeHeaders.slice(0, 15).map((hName) => (
            <span key={hName} className="rounded border border-divider bg-card px-2 py-0.5 font-mono text-muted">
              {hName} ({headerStats.get(hName) || 0})
            </span>
          ))}
          {activeHeaders.length > 15 && (
            <span className="text-subtle">+{activeHeaders.length - 15} more</span>
          )}
        </div>
      )}

      {/* Main Table */}
      {displayedRows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-divider p-8 text-center text-[12.5px] text-subtle">
          No extracted data rows match the current search filter or uploads.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-divider">
          <table className="w-full min-w-max text-left text-[11.5px]">
            <thead className="bg-th font-semibold text-muted">
              <tr>
                <th className="border-b border-divider px-3 py-2">#</th>
                <th className="border-b border-divider px-3 py-2">Platform / Brand</th>
                <th className="border-b border-divider px-3 py-2">Order ID</th>
                <th className="border-b border-divider px-3 py-2">Transaction ID</th>
                <th className="border-b border-divider px-3 py-2">SKU / Product</th>
                {activeHeaders.map((hName) => (
                  <th key={hName} className="border-b border-divider px-3 py-2 whitespace-nowrap">
                    {hName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-divider bg-card">
              {displayedRows.map((r, idx) => (
                <tr key={idx} className="hover:bg-card-hover transition-colors">
                  <td className="px-3 py-2 font-mono text-subtle">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1 rounded bg-action/10 px-2 py-0.5 text-[10.5px] font-semibold text-action">
                      {r.platform || 'General'}
                    </span>
                    {r.brand && <span className="ml-1 text-[11px] text-subtle">({r.brand})</span>}
                  </td>
                  <td className="px-3 py-2 font-mono font-medium text-foreground">
                    {r.orderId || <span className="text-subtle italic">None</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-muted">
                    {r.settlementId || r.meta?.Transaction_ID || r.meta?.Jio_Transaction_ID || <span className="text-subtle italic">—</span>}
                  </td>
                  <td className="px-3 py-2 font-medium text-foreground max-w-[180px] truncate" title={r.productName || r.sku}>
                    {r.sku !== '—' ? r.sku : (r.productName || '—')}
                  </td>
                  {activeHeaders.map((hName) => {
                    let val = r.meta?.[hName];
                    if (val == null) {
                      const gh = globalHeaders.find((h) => h.name === hName);
                      if (gh) val = readHeaderFromRow(gh, r);
                    }
                    const isPresent = val != null && String(val).trim() !== '';
                    return (
                      <td key={hName} className={`px-3 py-2 whitespace-nowrap ${isPresent ? 'text-foreground font-medium' : 'text-subtle/40'}`}>
                        {isPresent ? String(val) : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filteredRows.length > displayedRows.length && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => setPageLimit((n) => n + 100)}
            className="rounded-lg border border-action/30 bg-action/10 px-4 py-2 text-[12px] font-bold text-action hover:bg-action/20"
          >
            Show 100 More Rows ({displayedRows.length} of {filteredRows.length} shown)
          </button>
        </div>
      )}
    </div>
  );
}
