'use client';

import { LayoutList } from 'lucide-react';

// Global Settings shows only the ONE section picked (builder sidebar, or the
// chips here) — nothing opens on its own. With nothing picked yet this is
// the empty state; once one is open it shrinks to a chip row below lg only,
// where the sidebar is an off-canvas drawer, so a section stays switchable.
export default function GlobalSectionPicker({ sections = [], openKey = null, onOpen }) {
  const chips = (className = '') => (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {sections.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => onOpen(s.key, s.anchor)}
          className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
            openKey === s.key
              ? 'bg-action text-white'
              : 'border border-divider bg-background text-muted hover:bg-card-hover hover:text-foreground'
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );

  if (openKey) return chips('lg:hidden');

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-divider-light bg-background px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-action-soft text-action"><LayoutList size={22} /></div>
      <div>
        <h2 className="text-base font-bold text-foreground">No section open</h2>
        <p className="mt-1 max-w-sm text-sm text-muted">Pick a section to open it — only the one you pick is shown.</p>
      </div>
      {chips('justify-center')}
    </div>
  );
}
