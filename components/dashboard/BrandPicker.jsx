'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Plus, Search, Tag } from 'lucide-react';
import Popover from './Popover';

// "Select Brand ▾" — the toolbar's second setup step, after Market Place.
// Unlike every other dropdown here it isn't data-driven (there's no data yet
// at this point); it lists the user's saved brands (`brands`, persisted
// per-user in preferences.brands) and lets them type a new one and create it
// on the spot. Selecting or creating a brand is what unlocks the file upload
// buttons and tags the next upload with it (see DashboardWorkspace.onUpload).
export default function BrandPicker({ brands = [], value, onChange, onCreate }) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? brands.filter((b) => b.toLowerCase().includes(s)) : brands;
  }, [q, brands]);

  const exactMatch = brands.some((b) => b.toLowerCase() === q.trim().toLowerCase());

  return (
    <Popover
      align="left"
      panelClass="min-w-[15rem] max-h-80 overflow-y-auto p-1"
      onOpenChange={(open) => { if (!open) setQ(''); }}
      trigger={() => (
        <button
          type="button"
          className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors ${
            value ? 'border-accent bg-accent/5 text-foreground' : 'border-action bg-action/5 text-action'
          }`}
          title={value ? `Brand: ${value}` : 'Pick or create a brand before uploading'}
        >
          <Tag size={14} className="shrink-0" />
          <span className="max-w-[9rem] truncate">{value || 'Select Brand'}</span>
          <ChevronDown size={13} className="shrink-0" />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="relative mb-1 px-0.5 pt-0.5">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search or create a brand…"
              className="w-full rounded-lg border border-divider bg-card py-1.5 pl-8 pr-2 text-[13px] focus:border-accent focus:outline-none"
            />
          </div>

          {filtered.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => { onChange(b); close(); }}
              className={`block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-card-hover ${b === value ? 'font-semibold text-foreground' : 'text-muted'}`}
            >
              {b}
            </button>
          ))}
          {!filtered.length && !q.trim() && (
            <p className="px-2.5 py-2 text-xs text-subtle">No brands yet — type a name to create one.</p>
          )}

          {q.trim() && !exactMatch && (
            <button
              type="button"
              onClick={() => { const name = q.trim(); onCreate(name); onChange(name); setQ(''); close(); }}
              className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium text-action hover:bg-card-hover"
            >
              <Plus size={13} className="shrink-0" /> Create “{q.trim()}”
            </button>
          )}
        </>
      )}
    </Popover>
  );
}
