'use client';

import KpiCard from './KpiCard';

// The KPI band = the active tab's Title Cards. `cards` = ordered title-card
// defs (config.titleCards, filtered to the tab); `values` =
// resolveTemplate().titleCardValues keyed by card id. Cards share width on a
// wide screen and scroll sideways below that — matching the reference, where
// the last card clips at the viewport edge.
export default function KpiCardRow({ cards = [], values = {} }) {
  if (!cards.length) return null;

  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-divider-light">
      {cards.map((card) => {
        const v = values[card.id] || {};
        return (
          <div key={card.id} className="min-w-[180px] flex-1">
            <KpiCard
              name={card.name}
              mainDisplay={v.main?.display}
              mainRaw={v.main?.raw}
              subDisplay={v.sub?.display}
              format={card.mainValue?.format || 'money'}
              signed={!!card.mainValue?.signed}
            />
          </div>
        );
      })}
    </div>
  );
}
