'use client';

import { useCallback } from 'react';

const MIN_FIT = 320; // px — the table's own floor (min-h-80)

// For a fillHeight table (DetailsTable / OverviewTreeTable on the dashboard):
// returns a callback ref for its outer box. The table takes the height the
// page leaves below the cards / graphs; its rows scroll inside it, under the
// pinned header row, and the page doesn't move. When that leaves less than
// MIN_FIT, a MIN_FIT-tall table would make the page scroll and carry the
// header row away with it — so instead the box is marked `data-fill-full`
// and given `--page-h` (the page's visible height) to be exactly that tall:
// once the page has scrolled the cards / graphs out of view the table fills
// the screen, header row on top, and the page can't scroll any further —
// only the rows do. Re-checked whenever the page, the box, or the content
// around it changes size; nothing listens to scrolling.
export default function useFillHeight(enabled) {
  return useCallback((box) => {
    const page = box?.closest('main');
    if (!enabled || !page || typeof ResizeObserver === 'undefined') return undefined;
    const update = () => {
      const above = box.getBoundingClientRect().top - page.getBoundingClientRect().top + page.scrollTop;
      box.style.setProperty('--page-h', `${page.clientHeight}px`);
      box.toggleAttribute('data-fill-full', page.clientHeight - above < MIN_FIT);
    };
    const observer = new ResizeObserver(update);
    observer.observe(page);
    observer.observe(box);
    const section = box.closest('main > *'); // grows with the cards / graphs once the box is full-height
    if (section) observer.observe(section);
    return () => {
      observer.disconnect();
      box.removeAttribute('data-fill-full');
    };
  }, [enabled]);
}
