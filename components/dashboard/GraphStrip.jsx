'use client';

import TemplateChart from './TemplateChart';

// A tab's graph row. `graphs` = the tab's ordered [{ id, span }]; `series` =
// resolveTemplate().graphSeries keyed by graph id. Hidden entirely when the
// tab defines no graphs.
export default function GraphStrip({ graphs = [], series = {} }) {
  const items = graphs.map((g) => ({ ...g, data: series[g.id] })).filter((g) => g.data);
  if (!items.length) return null;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
      {items.map((g) => (
        <div
          key={g.id}
          className={`rounded-2xl border border-divider bg-background p-4 ${
            (g.span || 1) >= 2 ? 'lg:col-span-2' : ''
          }`}
        >
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">{g.data.name}</h3>
            <span className="text-[11px] uppercase tracking-wide text-subtle">{g.data.chartType}</span>
          </div>
          <div className="h-44">
            <TemplateChart chartType={g.data.chartType} series={g.data.series} />
          </div>
        </div>
      ))}
    </div>
  );
}
