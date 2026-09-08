'use client';

import { Check, ChevronDown, LayoutGrid } from 'lucide-react';
import Popover from './Popover';
import { PLATFORM_BY_ID } from '@/data/platforms/detect';

// The reference's "All Compay ▾" — an ECOMMERCE-PLATFORM filter (not a company
// selector; there is no company concept in this tool). Options: "All Platforms"
// + whichever marketplaces are present in the loaded data.
export default function PlatformFilter({ value = 'all', available = [], onChange }) {
  const opts = ['all', ...available];
  const label = value === 'all' ? 'All Platforms' : PLATFORM_BY_ID[value]?.label ?? value;
  const disabled = available.length === 0;

  return (
    <Popover
      align="right"
      trigger={(open) => (
        <button
          type="button"
          disabled={disabled}
          className={`inline-flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors disabled:opacity-50 ${
            open ? 'border-accent' : 'border-divider-light hover:border-divider'
          }`}
        >
          <LayoutGrid size={15} className="text-muted" />
          {label}
          <ChevronDown size={15} className="text-muted" />
        </button>
      )}
    >
      {(close) => (
        <div className="py-0.5">
          {opts.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                onChange(id);
                close();
              }}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-card-hover"
            >
              <span className="flex items-center gap-2">
                {id !== 'all' && (
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: PLATFORM_BY_ID[id]?.color ?? '#6b7280' }}
                  />
                )}
                {id === 'all' ? 'All Platforms' : PLATFORM_BY_ID[id]?.label ?? id}
              </span>
              {value === id && <Check size={14} className="text-action" />}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
