'use client';

import KpiCard from './KpiCard';
import { HL_BOX, isHighlighted, usePreviewHighlight } from './previewHighlight';
import { MAX_CARDS_PER_ROW } from '@/data/templateSchema';

// A short line still splits into at least this many slots (the default Cards
// per row), so one or two cards don't stretch across the whole screen.
const MIN_SLOTS = 4;

// The KPI band = the active tab's Title Cards. `cards` = ordered title-card
// defs (config.titleCards, filtered to the tab); `values` =
// resolveTemplate().titleCardValues keyed by card id.
//
// Template Settings' "Cards per row" (tab.layout.titleCards.columns,
// 1–MAX_CARDS_PER_ROW) → up to that many cards on one line on a wide screen,
// then the next line; 1–2 per line on narrow ones. A line is split into
// min(Cards per row, max(cards, MIN_SLOTS)) equal slots — never into dozens
// of empty ones when the tab has fewer cards than the setting. Each slot is
// at least 180px; a line too wide for the screen scrolls sideways instead of
// squeezing the cards. The lg:grid-cols-[repeat(N,…)] class is built from a
// number, so app/globals.css keeps all 99 of them (@source inline).
//
// While arranging (edit mode) the line keeps its layout but loses its own
// scroll area — that would clip each card's swap / hide menu — so a line
// wider than the screen scrolls the page sideways instead. Without a Cards
// per row the cards wrap, each bounded between a min and a max width.
export default function KpiCardRow({ cards = [], values = {}, editMode = false, arrange, columns = null }) {
  const hl = usePreviewHighlight();
  if (!cards.length) return null;
  const perRow = Math.min(MAX_CARDS_PER_ROW, Math.round(Number(columns)));
  const slots = perRow >= 1 ? Math.min(perRow, Math.max(cards.length, MIN_SLOTS)) : 0;

  const grid = (
    <div className={slots ? `grid grid-cols-1 gap-3 ${slots > 1 ? 'sm:grid-cols-2' : ''} lg:grid-cols-[repeat(${slots},minmax(180px,1fr))]` : 'flex flex-wrap gap-3'}>
      {cards.map((card) => {
        const v = values[card.id] || {};
        const on = isHighlighted(hl, 'titleCard', card.id);
        return (
          <div key={card.id} data-preview-hl={on || undefined} className={`${slots ? 'min-w-0' : 'min-w-[180px] max-w-[260px] flex-1'} rounded-2xl ${on ? HL_BOX : ''}`}>
            <KpiCard
              name={card.name}
              mainDisplay={v.main?.display}
              mainRaw={v.main?.raw}
              subDisplay={v.sub?.display}
              format={card.mainValue?.format || 'money'}
              signed={!!card.mainValue?.signed}
              textColor={card.textColor}
              bgColor={card.bgColor}
              editMode={editMode}
              currentId={card.id}
              items={arrange?.allItems}
              hiddenIds={arrange?.hiddenIds}
              onSwapWith={(targetId) => arrange?.swapWith(card.id, targetId)}
              onHide={() => arrange?.hide(card.id)}
            />
          </div>
        );
      })}
    </div>
  );

  // The 4px padding (cancelled by the negative margin) keeps the Template
  // Settings preview's highlight outline inside the scroll area's clip.
  return slots && !editMode ? <div className="lg:-m-1 lg:overflow-x-auto lg:p-1">{grid}</div> : grid;
}
