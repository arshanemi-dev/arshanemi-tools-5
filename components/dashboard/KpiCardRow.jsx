'use client';

import KpiCard from './KpiCard';
import { KPI_CARDS } from '@/data/platforms/canonical';

// The 7-card band. One row on xl; wraps to a scrollable grid below that.
export default function KpiCardRow({ summary, onEditAds }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7">
      {KPI_CARDS.map((c) => {
        const stat = summary[c.key] || {};
        const metaVal = c.meta === 'pct' ? `${stat.pct ?? 0}${c.metaSuffix ?? ''}` : (stat.count ?? 0);
        return (
          <KpiCard
            key={c.key}
            label={c.label}
            meta={metaVal}
            value={stat.value ?? 0}
            signed={c.signed}
            onClick={c.key === 'ads' ? onEditAds : undefined}
          />
        );
      })}
    </div>
  );
}
