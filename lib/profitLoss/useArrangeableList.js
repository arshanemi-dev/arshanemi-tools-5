'use client';

import { useMemo } from 'react';
import { applyLayout, swapItems, toggleHidden } from './layoutSections';

// Backs every inline "arrange" surface (sidebar tabs, title cards, graphs,
// table columns): given the full item list + its layout `section`, returns
// the visible (filtered + ordered) and hidden subsets plus the handlers each
// item's ArrangeControl / HiddenItemsChip needs — one place for the
// show/hide + swap logic instead of re-deriving it at each call site.
export function useArrangeableList(items, section, onChange) {
  const visible = useMemo(() => applyLayout(items, section), [items, section]);
  const hidden = useMemo(
    () => items.filter((it) => section.hidden.includes(it.id)),
    [items, section],
  );
  const allIds = useMemo(() => items.map((i) => i.id), [items]);

  return {
    visible,
    hidden,
    allItems: items,
    hiddenIds: section.hidden,
    swapWith: (id, targetId) => onChange(swapItems(section, allIds, id, targetId)),
    hide: (id) => onChange(toggleHidden(section, id)),
    show: (id) => onChange(toggleHidden(section, id)),
  };
}
