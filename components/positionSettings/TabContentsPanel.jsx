'use client';

import { BarChart3, Columns3, LayoutGrid, RotateCcw } from 'lucide-react';
import MyDetailsPanes from '@/components/dashboard/MyDetailsPanes';
import { partItems, partList, partSection } from '@/lib/profitLoss/tabParts';
import TickOrderList, { listWords } from './TickOrderList';

// A tab's cards / graphs: every one of the version, the tab's own shown
// unless taken off, any other once ticked (tabParts.js).
const PARTS = {
  list: (items, section) => partList(items, section),
  save: (section, items, _list, order, ticked) => partSection(section, items, order, ticked),
};

const CARD_WORDS = listWords('title card', 'title cards', 'Card order', 'Take off this tab');
const GRAPH_WORDS = listWords('graph', 'graphs', 'Graph order', 'Take off this tab');

// The Graphs section is hidden for now — flip this to bring it back. Hidden,
// nothing about graphs changes: each tab still shows its own, and any graph
// arrangement saved before stays as it was (the page just doesn't edit it).
const SHOW_GRAPHS = false;

// Position Settings › one tab's contents: pick a Tab / Overview Tab from the
// row on top, then arrange what its dashboard page shows — its Title Cards,
// Graphs (hidden for now — SHOW_GRAPHS) and Columns, each the same way: My
// Details' two lists — tick what shows — every card / graph / column of the
// version, each listed once, the tab's own ticked to start with — then put
// the ticked ones in order (TickOrderList for the cards and graphs,
// MyDetailsPanes with the tab's key column pinned for the columns).
// `tabs` = [{ id, name, overview, onStrip }] (every one the version has —
// one taken off the strip can still be arranged); `columns` = the picked
// tab's { model (positionDraft columnsModel), ticked, order, onTicked,
// onOrder } or null; `onSection(kind, nextSection)`; `dirtyIds` = the tabs
// with unsaved changes (a dot on their pill).
function Part({ icon: Icon, title, hint, right = null, children }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-divider bg-background p-4">
      <div className="flex flex-wrap items-start gap-2">
        <span className="rounded-lg bg-accent/10 p-1.5 text-accent"><Icon size={15} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {/* <p className="text-[12px] text-muted">{hint}</p> */}
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

export default function TabContentsPanel({ config, layout, tabs = [], dirtyIds = new Set(), selectedId, onSelect, tab = null, overview = false, onSection, columns = null }) {
  const sections = (tab && layout?.perTab?.[tab.id]) || {};
  const cards = partItems(tab, config, 'titleCards').map((c) => ({ id: c.id, name: c.name || c.id, own: c.own }));
  const graphs = partItems(tab, config, 'graphs').map((g) => ({ id: g.id, name: g.name || g.id, own: g.own }));
  const m = columns?.model;
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
              {dirtyIds.has(t.id) && <span className="h-1.5 w-1.5 rounded-full bg-link" title="Unsaved changes" aria-label="unsaved" />}
            </button>
          );
        })}
      </div>

      {!tab ? (
        <Empty>Pick a tab to arrange.</Empty>
      ) : (
        <>
          <Part icon={LayoutGrid} title="Title Cards" hint="Every title card of the template — this tab's own are ticked to start with. Tick the ones it shows, then put them in order.">
            {cards.length ? (
              <TickOrderList items={cards} section={sections.titleCards} onChange={(next) => onSection('titleCards', next)} title="Title Cards" words={CARD_WORDS} model={PARTS} />
            ) : <Empty>The template has no title cards yet — they&rsquo;re made in Template Settings.</Empty>}
          </Part>
          {SHOW_GRAPHS && (
            <Part icon={BarChart3} title="Graphs" hint="Every graph of the template — this tab's own are ticked to start with. Tick the ones it shows, then put them in order.">
              {graphs.length ? (
                <TickOrderList items={graphs} section={sections.graphs} onChange={(next) => onSection('graphs', next)} title="Graphs" words={GRAPH_WORDS} model={PARTS} />
              ) : <Empty>The template has no graphs yet — they&rsquo;re made in Template Settings.</Empty>}
            </Part>
          )}

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
          </Part>
        </>
      )}
    </div>
  );
}
