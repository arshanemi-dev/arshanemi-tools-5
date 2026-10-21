'use client';

import { BarChart3, Columns3, LayoutGrid, RotateCcw } from 'lucide-react';
import HeaderPickerStrip from '@/components/templateSettings/HeaderPickerStrip';
import MyDetailsPanes from '@/components/dashboard/MyDetailsPanes';
import { cardItems, graphItems, shownIds } from '@/lib/profitLoss/positionDraft';

// Position Settings › one tab's contents: pick a Tab / Overview Tab from the
// row on top, then arrange what its dashboard page shows —
//  - Title Cards and Graphs: the "pick some, put them in order" list of
//    Template Settings (HeaderPickerStrip) — drag ⋮⋮, "Position N", ↑ / ↓,
//    every row a dropdown of this tab's own cards / graphs (each listed once;
//    picking one already in the list swaps the two), × takes one off, Add
//    brings it back;
//  - Columns: My Details' two lists (MyDetailsPanes) — tick the columns,
//    group by group, and put the ticked ones in order.
// `tabs` = [{ id, name, overview, onStrip }] (every one the version has —
// one taken off the strip can still be arranged); `columns` = the picked
// tab's { model (positionDraft columnsModel), ticked, order, onTicked,
// onOrder } or null; `onSection(kind, visibleIds, allIds)`.
function Part({ icon: Icon, title, hint, right = null, children }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-divider bg-background p-4">
      <div className="flex flex-wrap items-start gap-2">
        <span className="rounded-lg bg-accent/10 p-1.5 text-accent"><Icon size={15} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-[12px] text-muted">{hint}</p>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

const Empty = ({ children }) => (
  <p className="rounded-lg border border-dashed border-divider-light px-3 py-5 text-center text-[13px] text-muted">{children}</p>
);

export default function TabContentsPanel({ config, layout, tabs = [], selectedId, onSelect, tab = null, overview = false, onSection, columns = null }) {
  const sections = (tab && layout?.perTab?.[tab.id]) || {};
  const cards = cardItems(tab, config);
  const graphs = graphItems(tab, config);
  const m = columns?.model;
  const noneTicked = !!m && m.headers.length > 0 && columns.ticked.size === 0;
  const atDefault = !!m && columns.ticked.size === m.defaultIds.length && m.defaultIds.every((id) => columns.ticked.has(id));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Tab to arrange">
        {tabs.map((t) => {
          const on = t.id === selectedId;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onSelect(t.id)}
              title={t.onStrip ? undefined : 'Taken off the tab strip — you can still arrange it'}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
                on ? 'border-accent bg-accent/10 text-foreground' : 'border-divider-light bg-background text-muted hover:bg-card-hover'
              } ${t.onStrip ? '' : 'border-dashed'}`}
            >
              {t.name}
              {t.overview && <span className="text-[10px] font-semibold uppercase tracking-wide text-subtle">overview</span>}
              {!t.onStrip && <span className="text-[10px] font-semibold uppercase tracking-wide text-subtle">off</span>}
            </button>
          );
        })}
      </div>

      {!tab ? (
        <Empty>Pick a tab to arrange.</Empty>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <Part icon={LayoutGrid} title="Title Cards" hint="The cards along the top of this tab, first one first.">
              {cards.length ? (
                <HeaderPickerStrip
                  label="Title Card"
                  options={cards}
                  selectedIds={shownIds(cards, sections.titleCards)}
                  onChange={(ids) => onSection('titleCards', ids, cards.map((c) => c.id))}
                />
              ) : <Empty>This tab has no title cards — they&rsquo;re added in Template Settings.</Empty>}
            </Part>
            <Part icon={BarChart3} title="Graphs" hint="The graphs under the cards, first one first.">
              {graphs.length ? (
                <HeaderPickerStrip
                  label="Graph"
                  options={graphs}
                  selectedIds={shownIds(graphs, sections.graphs)}
                  onChange={(ids) => onSection('graphs', ids, graphs.map((g) => g.id))}
                />
              ) : <Empty>This tab has no graphs — they&rsquo;re added in Template Settings.</Empty>}
            </Part>
          </div>

          <Part
            icon={Columns3}
            title="Columns"
            hint={overview
              ? 'Tick the columns beside the hierarchy, group by group, then put them in order.'
              : 'Tick the columns this tab’s table shows, group by group, then put them in order.'}
            right={m && m.headers.length > 0 && (
              <button
                type="button"
                onClick={() => columns.onTicked(new Set(m.defaultIds))}
                disabled={atDefault}
                title="Tick just the columns this tab starts with"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-divider-light px-2.5 py-1.5 text-[12px] font-medium text-muted transition-colors hover:bg-card-hover disabled:opacity-40"
              >
                <RotateCcw size={13} /> Tab default
              </button>
            )}
          >
            {m && m.headers.length > 0 ? (
              <div className="flex h-[38rem] flex-col lg:h-[32rem]">
                <MyDetailsPanes
                  keyHeader={m.keyHeader}
                  headers={m.headers}
                  groups={config.headerGroups}
                  ticked={columns.ticked}
                  onTicked={columns.onTicked}
                  order={columns.order}
                  onOrder={columns.onOrder}
                />
              </div>
            ) : <Empty>{overview && !m?.keyHeader ? 'Pick this overview’s hierarchy in Template Settings first.' : 'Only one column on this tab.'}</Empty>}
            {noneTicked && <p className="text-[12px] font-medium text-neg">Tick at least one column — with none ticked the tab would go back to its default columns.</p>}
          </Part>
        </>
      )}
    </div>
  );
}
