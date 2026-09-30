'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, ListTree, PanelLeftClose, Search, X } from 'lucide-react';
import { filterTree } from '@/lib/profitLoss/overviewTree';
import { levelStyle } from './overviewLevelStyles';
import { HL_BOX, isHighlighted, usePreviewHighlight } from './previewHighlight';

const NAV_PAGE = 50; // nodes per sibling list before "Show more"
const ROOT = '__root__';

// Walks the tree recursively through NavList → NavNode. `ctx` carries the
// shared expand state + handlers so each node doesn't need a dozen props.
function NavList({ nodes, parentKey = ROOT, ctx }) {
  const limit = ctx.limits[parentKey] || NAV_PAGE;
  const rest = nodes.length - limit;
  return (
    <>
      {nodes.slice(0, limit).map((n) => <NavNode key={n.key} node={n} ctx={ctx} />)}
      {rest > 0 && (
        <li>
          <button
            type="button"
            onClick={() => ctx.showMore(parentKey, limit + NAV_PAGE)}
            className="ml-6 py-1 text-[11px] font-medium text-link hover:underline"
          >
            Show {Math.min(NAV_PAGE, rest)} more <span className="text-subtle">({rest} left)</span>
          </button>
        </li>
      )}
    </>
  );
}

function NavNode({ node, ctx }) {
  const st = levelStyle(node.depth);
  const hasKids = node.children?.length > 0;
  // While searching, the path down to every match is shown already open —
  // its chevron is locked open until the search is cleared.
  const forced = ctx.searching && node.openedByMatch;
  const open = hasKids && (forced || ctx.expanded.has(node.key));
  const active = ctx.activeKey === node.key;

  return (
    <li>
      <div
        data-nav-key={node.key}
        className={`flex items-center gap-1 rounded-md pr-1.5 transition-colors ${active ? st.soft : 'hover:bg-card-hover'}`}
      >
        <button
          type="button"
          onClick={() => ctx.onToggle(node.key)}
          disabled={!hasKids || forced}
          aria-label={hasKids ? `${open ? 'Collapse' : 'Expand'} ${node.value}` : undefined}
          aria-expanded={hasKids ? open : undefined}
          className="flex h-6 w-5 shrink-0 items-center justify-center rounded disabled:cursor-default"
        >
          {hasKids
            ? <ChevronRight size={13} className={`transition-transform duration-150 ${open ? 'rotate-90' : ''} ${st.text}`} />
            : <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />}
        </button>
        <button
          type="button"
          onClick={() => ctx.onFocus(node.key)}
          title={`${ctx.levelName(node.depth)}: ${node.value}`}
          className={`min-w-0 flex-1 truncate py-1 text-left text-[12.5px] ${active ? `font-semibold ${st.text}` : 'text-foreground/80'}`}
        >
          {node.value}
        </button>
        {hasKids && (
          <span
            title={`${node.children.length} ${ctx.levelName(node.depth + 1)}`}
            className={`shrink-0 rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${st.badge}`}
          >
            {node.children.length}
          </span>
        )}
      </div>
      {open && (
        <ul className={`ml-2.5 border-l-2 pl-1 ${st.guide}`}>
          <NavList nodes={node.children} parentKey={node.key} ctx={ctx} />
        </ul>
      )}
    </li>
  );
}

// The Overview tab's left "hierarchy sidebar": Level 1's unique values as
// dropdowns, each opening onto its Level 2 values, and so on down (e.g.
// Company → Sku → Order Id). Expand state is NOT local — it's the same Set
// the right-hand OverviewTreeTable reads, so opening a node here opens its
// rows there. Clicking a value (not the chevron) also focuses it: opens it,
// scrolls the table to its row and highlights it. Every level has its own
// colour (overviewLevelStyles.js); the legend chips double as "open down to
// this level" shortcuts.
export default function OverviewHierarchyNav({
  levels = [], tree = [], expanded, onToggle, activeKey, onFocus, onExpandToDepth, onHide, className = '',
}) {
  const [q, setQ] = useState('');
  const [limits, setLimits] = useState({});
  const scrollRef = useRef(null);
  const hl = usePreviewHighlight();
  const needle = q.trim().toLowerCase();
  const nodes = useMemo(
    () => (needle ? filterTree(tree, (n) => n.value.toLowerCase().includes(needle)) : tree),
    [tree, needle],
  );

  // A row focused from the table side may be off-screen in this list.
  useEffect(() => {
    if (!activeKey || typeof CSS === 'undefined') return;
    scrollRef.current
      ?.querySelector(`[data-nav-key="${CSS.escape(activeKey)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeKey]);

  const ctx = {
    expanded,
    onToggle,
    onFocus,
    activeKey,
    searching: !!needle,
    limits,
    showMore: (key, n) => setLimits((s) => ({ ...s, [key]: n })),
    levelName: (d) => levels[d]?.name || `Level ${d + 1}`,
  };

  return (
    <aside className={`flex flex-col overflow-hidden rounded-xl border border-divider bg-background ${className}`}>
      <div className="flex items-center gap-1.5 border-b border-divider px-3 py-2">
        <ListTree size={14} className="text-subtle" />
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">Hierarchy</span>
        <button type="button" onClick={() => onExpandToDepth(levels.length - 1)} title="Expand all" className="rounded p-1 text-subtle hover:bg-card-hover hover:text-foreground">
          <ChevronsUpDown size={13} />
        </button>
        <button type="button" onClick={() => onExpandToDepth(0)} title="Collapse all" className="rounded p-1 text-subtle hover:bg-card-hover hover:text-foreground">
          <ChevronsDownUp size={13} />
        </button>
        {onHide && (
          <button type="button" onClick={onHide} title="Hide hierarchy" className="rounded p-1 text-subtle hover:bg-card-hover hover:text-foreground">
            <PanelLeftClose size={13} />
          </button>
        )}
      </div>

      <div className="space-y-2 border-b border-divider px-3 py-2.5">
        <div className="flex flex-wrap gap-1">
          {levels.map((h, i) => {
            const st = levelStyle(i);
            const on = isHighlighted(hl, 'header', h.id);
            return (
              <button
                key={h.id}
                type="button"
                data-preview-hl={on || undefined}
                onClick={() => onExpandToDepth(i)}
                title={`Open down to Level ${i + 1} (${h.name})`}
                className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold transition-opacity hover:opacity-75 ${st.badge} ${on ? HL_BOX : ''}`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${st.dot}`} />
                <span className="truncate">L{i + 1} · {h.name}</span>
              </button>
            );
          })}
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${levels.map((h) => h.name).join(', ')}…`}
            className="w-full rounded-lg border border-divider bg-card py-1.5 pl-7 pr-7 text-[12px] focus:border-accent focus:outline-none"
          />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-subtle hover:text-foreground">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="max-h-[60vh] min-h-24 overflow-y-auto p-1.5">
        {!tree.length ? (
          <p className="px-2 py-6 text-center text-[12px] text-subtle">No values yet — upload a sheet to fill the hierarchy.</p>
        ) : !nodes.length ? (
          <p className="px-2 py-6 text-center text-[12px] text-subtle">Nothing matches &ldquo;{q}&rdquo;.</p>
        ) : (
          <ul>
            <NavList nodes={nodes} ctx={ctx} />
          </ul>
        )}
      </div>
    </aside>
  );
}
