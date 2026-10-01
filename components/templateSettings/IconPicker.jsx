'use client';

import { useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import Popover from '@/components/dashboard/Popover';
import { TAB_ICONS, tabIconFor, tabIconLabel } from '@/components/dashboard/tabIcons';

// The icon a Tab / Overview Tab shows in the dashboard sidebar: a button with
// the current icon that opens a searchable grid of every icon (TAB_ICONS).
// `fallback` = what's shown while the tab has no icon saved yet.
export default function IconPicker({ value, onChange, fallback, disabled = false }) {
  const [q, setQ] = useState('');
  const current = value || fallback;
  const Current = tabIconFor(current, fallback);
  const s = q.trim().toLowerCase();
  const list = s ? TAB_ICONS.filter((i) => i.label.toLowerCase().includes(s) || i.name.toLowerCase().includes(s)) : TAB_ICONS;

  return (
    <Popover
      align="right"
      panelClass="w-72 p-2"
      trigger={() => (
        <button
          type="button"
          disabled={disabled}
          title="Icon shown in the dashboard sidebar"
          className="inline-flex items-center gap-1.5 rounded-lg border border-divider bg-background px-2.5 py-1.5 text-[12px] text-foreground hover:bg-card-hover disabled:opacity-50"
        >
          <Current size={15} className="shrink-0" />
          <span className="max-w-[7rem] truncate">{tabIconLabel(current, fallback)}</span>
          <ChevronDown size={12} className="shrink-0 text-subtle" />
        </button>
      )}
    >
      {(close) => (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-subtle" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search icons…"
              className="w-full rounded-md border border-divider bg-background py-1 pl-6 pr-2 text-[12px] focus:border-accent focus:outline-none"
            />
          </div>
          <div className="grid max-h-56 grid-cols-6 gap-1 overflow-y-auto">
            {list.map(({ name, label, Icon }) => (
              <button
                key={name}
                type="button"
                title={label}
                aria-label={label}
                onClick={() => { onChange(name); setQ(''); close(); }}
                className={`flex h-9 items-center justify-center rounded-md transition-colors ${
                  name === current ? 'bg-action text-white' : 'text-muted hover:bg-card-hover hover:text-foreground'
                }`}
              >
                <Icon size={16} />
              </button>
            ))}
            {!list.length && <p className="col-span-6 py-3 text-center text-[11.5px] text-subtle">No icon matches.</p>}
          </div>
        </div>
      )}
    </Popover>
  );
}
