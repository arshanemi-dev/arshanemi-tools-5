'use client';

import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RotateCcw, X } from 'lucide-react';
import { PLATFORMS } from '@/data/platforms/detect';
import { CANONICAL_FIELDS } from '@/data/platforms/manual';
import {
  selectPlatformSettings,
  setTabs,
  setHeaderMap,
  addKnownHeader,
  resetPlatform,
} from '@/store/sheetSettingsSlice';

// Slide-over. Per marketplace: which workbook tabs to read + a column-mapping
// override for each field the engine needs. Everything here is persisted to
// localStorage via the Redux store.
export default function SheetSettingsPanel({ open, onClose, focusPlatform }) {
  const dispatch = useDispatch();
  const [active, setActive] = useState(focusPlatform || 'flipkart');

  useEffect(() => {
    if (focusPlatform) setActive(focusPlatform);
  }, [focusPlatform]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9997] flex justify-end bg-black/40" onMouseDown={onClose}>
      <aside
        className="flex h-full w-full max-w-lg flex-col bg-background shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-divider px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-foreground">Sheet Settings</h2>
            <p className="mt-0.5 text-xs text-subtle">
              Choose which Excel tabs to read and map columns — saved on this device.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-card-hover">
            <X size={18} />
          </button>
        </header>

        <div className="flex gap-1 overflow-x-auto border-b border-divider px-3 py-2">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActive(p.id)}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                active === p.id ? 'bg-action text-white' : 'text-muted hover:bg-card-hover'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <PlatformConfig platformId={active} dispatch={dispatch} />
        </div>
      </aside>
    </div>
  );
}

function PlatformConfig({ platformId, dispatch }) {
  const cfg = useSelector((s) => selectPlatformSettings(s, platformId));
  const [newHeader, setNewHeader] = useState('');

  const tabs = cfg.knownTabs || [];
  const selected = cfg.tabs || [];
  const headers = cfg.knownHeaders || [];

  const toggleTab = (name) => {
    const next = selected.includes(name)
      ? selected.filter((t) => t !== name)
      : [...selected, name];
    dispatch(setTabs({ platformId, tabs: next }));
  };

  return (
    <div className="space-y-6">
      {/* ── tabs ─────────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-foreground">Sheet tabs to read</h3>
        {tabs.length === 0 ? (
          <p className="mt-1 text-xs text-muted">
            Upload a {label(platformId)} sheet and its tabs will appear here.
          </p>
        ) : (
          <>
            <p className="mt-1 text-xs text-subtle">
              Nothing checked = auto (the tool reads the tab that looks like a settlement sheet).
            </p>
            <div className="mt-2 space-y-1">
              {tabs.map((name) => (
                <label
                  key={name}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground hover:bg-card-hover"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(name)}
                    onChange={() => toggleTab(name)}
                    className="accent-[var(--color-action)]"
                  />
                  {name}
                </label>
              ))}
            </div>
          </>
        )}
      </section>

      {/* ── column mapping ───────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-foreground">Column mapping</h3>
        <p className="mt-1 text-xs text-subtle">
          Override which header feeds each value. Leave on “Auto” to trust detection.
        </p>
        <div className="mt-2 space-y-2">
          {CANONICAL_FIELDS.map((f) => (
            <div key={f.key} className="grid grid-cols-[9rem_1fr] items-center gap-2">
              <span className="text-xs text-muted">
                {f.label}
                {f.required && <span className="text-neg"> *</span>}
              </span>
              <select
                value={cfg.headerMap?.[f.key] ?? ''}
                onChange={(e) => dispatch(setHeaderMap({ platformId, field: f.key, header: e.target.value }))}
                className="w-full rounded-lg border border-divider-light bg-background px-2 py-1.5 text-sm text-foreground focus:border-accent focus:outline-none"
              >
                <option value="">Auto</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {/* add a header name the sheet uses that isn't in the list yet */}
        <div className="mt-3 flex gap-2">
          <input
            value={newHeader}
            onChange={(e) => setNewHeader(e.target.value)}
            placeholder="Add a header name…"
            className="flex-1 rounded-lg border border-divider-light bg-background px-2.5 py-1.5 text-sm text-foreground focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              if (newHeader.trim()) {
                dispatch(addKnownHeader({ platformId, header: newHeader.trim() }));
                setNewHeader('');
              }
            }}
            className="rounded-lg bg-action px-3 py-1.5 text-sm font-semibold text-white hover:bg-action-hover"
          >
            Add
          </button>
        </div>
      </section>

      <button
        type="button"
        onClick={() => dispatch(resetPlatform({ platformId }))}
        className="inline-flex items-center gap-1.5 rounded-lg border border-divider-light px-3 py-1.5 text-xs text-muted hover:bg-card-hover"
      >
        <RotateCcw size={12} /> Reset {label(platformId)}
      </button>
    </div>
  );
}

function label(id) {
  return PLATFORMS.find((p) => p.id === id)?.label ?? id;
}
