'use client';

import KpiCard from './KpiCard';

// The KPI band = the active tab's Title Cards. `cards` = ordered title-card
// defs (config.titleCards, filtered to the tab); `values` =
// resolveTemplate().titleCardValues keyed by card id. Cards share width on a
// wide screen and wrap onto new rows once they no longer fit — no horizontal
// scrolling — each one bounded between a min and a max width.
export default function KpiCardRow({ cards = [], values = {}, editMode = false, arrange }) {
  if (!cards.length) return null;

  return (
    <div className="flex flex-wrap gap-3">
      {cards.map((card) => {
        const v = values[card.id] || {};
        return (
          <div key={card.id} className="min-w-[180px] max-w-[260px] flex-1">
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
