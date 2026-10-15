'use client';

import { useCallback } from 'react';

// For a fillHeight table (DetailsTable / OverviewTreeTable on the dashboard):
// returns a callback ref for its outer box, which it keeps given `--page-h`
// — the page's visible height (<main>'s clientHeight) — for the box to be
// exactly that tall. The table always gets the whole screen: scrolling the
// page down moves the cards / graphs out of view, then the table fills the
// screen, header and Total rows on top, pager on the bottom edge, and the
// page can't scroll any further — only the rows do. Re-measured whenever the
// page changes size; nothing listens to scrolling.
export default function useFillHeight(enabled) {
  return useCallback((box) => {
    const page = box?.closest('main');
    if (!enabled || !page || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => box.style.setProperty('--page-h', `${page.clientHeight}px`));
    observer.observe(page);
    return () => observer.disconnect();
  }, [enabled]);
}
