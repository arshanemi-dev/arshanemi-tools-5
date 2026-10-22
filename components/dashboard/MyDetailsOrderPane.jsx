'use client';

import { X } from 'lucide-react';
import PositionList from '@/components/templateSettings/PositionList';
import { KeyRow } from './MyDetailsGroupList';

// The order side of the My Details window, there only while Position
// Settings is on: the ticked columns in table order, arranged exactly like
// Template Settings' lists (PositionList) — drag a row onto another (a green
// line shows where it lands), pick its "Position N", or ↑ / ↓ / ⇈ / ⇊; ×
// unticks it. The key column is pinned above them — it is always first.
// `items` = [{ id, name, groupName }] in order; `onMove(from, to)`;
// `words` = what the items are called (MyDetailsPanes COLUMN_WORDS).
export default function MyDetailsOrderPane({ keyHeader = null, items = [], onMove, onRemove, words }) {
  return (
    <div className="flex flex-col gap-2">
      {keyHeader && <KeyRow header={keyHeader} />}
      {items.length > 0 ? (
        <PositionList
          items={items}
          onMove={onMove}
          compact
          className="bg-background"
          renderRow={(it) => (
            <>
              <span className="min-w-0 truncate text-[13px] text-foreground" title={it.name}>{it.name}</span>
              {it.groupName && (
                <span className="shrink-0 rounded-full bg-card px-1.5 py-0.5 text-[10px] font-medium text-subtle">{it.groupName}</span>
              )}
            </>
          )}
          renderEnd={(it) => (
            <button
              type="button"
              title={words.off}
              aria-label={`Untick ${it.name}`}
              onClick={() => onRemove(it.id)}
              className="rounded-md p-1 text-subtle hover:bg-card-hover hover:text-neg"
            >
              <X size={14} />
            </button>
          )}
        />
      ) : (
        <p className="rounded-lg border border-dashed border-divider-light px-3 py-6 text-center text-[13px] text-muted">
          {words.empty}
        </p>
      )}
    </div>
  );
}
