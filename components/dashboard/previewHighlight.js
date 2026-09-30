'use client';

import { createContext, useContext } from 'react';

// Template Settings' live preview (BuilderPreview) renders the real
// dashboard components. This context lets it point at the one item
// selected in the builder — { kind: 'titleCard' | 'graph' | 'header' |
// 'tab' | 'overview', id } — so the matching card / graph / column lights
// up. Nothing provides it on the real /profit-loss dashboard, so there the
// value is null and every check is a no-op.
//
// Every highlighted element also gets `data-preview-hl` so the preview can
// find it and scroll it into view.
export const PreviewHighlightContext = createContext(null);

export function usePreviewHighlight() {
  return useContext(PreviewHighlightContext);
}

export function isHighlighted(hl, kind, id) {
  return !!hl && !!id && hl.kind === kind && hl.id === id;
}

// Card / graph / chip: accent outline (follows border-radius) + one glow
// pulse when it first lights up (--animate-hl-flash in globals.css).
export const HL_BOX = 'outline-2 outline-offset-2 outline-accent animate-hl-flash';
// Table column: accent header text + underline, tinted body cells. The
// sticky header keeps its opaque background so scrolled rows never show
// through it.
export const HL_HEAD = 'text-accent shadow-[inset_0_-3px_0_var(--color-accent)]';
export const HL_CELL = 'bg-accent/10';
