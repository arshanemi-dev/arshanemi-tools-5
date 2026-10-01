'use client';

import KpiCard from './KpiCard';
import { HL_BOX, isHighlighted, usePreviewHighlight } from './previewHighlight';

// Template Settings' "Cards per row" (tab.layout.titleCards.columns, 1-8) →
// that many cards per row on a wide screen; fewer on narrow ones. Static
// class names so Tailwind keeps them.
const LG_COLS = {
  1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5', 6: 'lg:grid-cols-6', 7: 'lg:grid-cols-7', 8: 'lg:grid-cols-8',
};

// The KPI band = the active tab's Title Cards. `cards` = ordered title-card
// defs (config.titleCards, filtered to the tab); `values` =
// resolveTemplate().titleCardValues keyed by card id. With the tab's Cards
// per row set (`columns`), cards sit in that many equal columns and wrap onto
// new rows — no horizontal scrolling; without it they share width, each
// bounded between a min and a max width.
export default function KpiCardRow({ cards = [], values = {}, editMode = false, arrange, columns = null }) {
  const hl = usePreviewHighlight();
  if (!cards.length) return null;
  const cols = LG_COLS[Math.round(Number(columns))] || null;

  return (
    <div className={cols ? `grid grid-cols-1 gap-3 ${Number(columns) > 1 ? 'sm:grid-cols-2' : ''} ${cols}` : 'flex flex-wrap gap-3'}>
      {cards.map((card) => {
        const v = values[card.id] || {};
        const on = isHighlighted(hl, 'titleCard', card.id);
        return (
          <div key={card.id} data-preview-hl={on || undefined} className={`${cols ? 'min-w-0' : 'min-w-[180px] max-w-[260px] flex-1'} rounded-2xl ${on ? HL_BOX : ''}`}>
            <KpiCard
              name={card.name}
              mainDisplay={v.main?.display}
              mainRaw={v.main?.raw}
              subDisplay={v.sub?.display}
              format={card.mainValue?.format || 'money'}
              signed={!!card.mainValue?.signed}
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
}
