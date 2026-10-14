'use client';

import { Loader2, Save } from 'lucide-react';
import { DEFAULT_OVERVIEW_ICON, DEFAULT_TAB_ICON, tabIconFor } from '@/components/dashboard/tabIcons';
import PositionList from './PositionList';
import SectionHead from './SectionHead';

const KINDS = {
  tab: { title: 'Tabs Organizer', listKey: 'tabs', anchor: 'section-tabs-organizer', icon: DEFAULT_TAB_ICON, noun: 'tab' },
  overview: { title: 'Overview Organizer', listKey: 'overviewTabs', anchor: 'section-overview-organizer', icon: DEFAULT_OVERVIEW_ICON, noun: 'overview tab' },
};

// The GLOBAL position of every Tab (or Overview Tab): the order the
// dashboard's sidebar lists them in for every user. Someone who saved their
// own arrangement with the dashboard's Position Settings keeps it only until
// this order is changed in the version the dashboard shows — the newer
// change wins (see `base` in lib/profitLoss/layoutSections.js); they can
// re-arrange afterwards.
// Moving one works the way every ordered list here does — drag, "Position N",
// ↑ / ↓ / ⇈ / ⇊ (PositionList). Every move renumbers `order` 0..n-1 in the
// Global Settings draft. Save Position saves that draft the same way the
// footer's button does — always as a new version (GlobalVersion.jsx).
export default function TabsOrganizerSection({ draft, kind = 'tab', onSave, saving = false }) {
  const k = KINDS[kind];
  const items = [...(draft.config[k.listKey] || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const moveTo = (from, to) => {
    const next = [...items];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    const orderById = new Map(next.map((x, i) => [x.id, i]));
    draft.setConfig((c) => ({ ...c, [k.listKey]: (c[k.listKey] || []).map((x) => ({ ...x, order: orderById.get(x.id) ?? x.order })) }));
  };

  return (
    <div id={k.anchor} className="scroll-mt-24">
      <SectionHead
        title={k.title}
        right={(
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !items.length}
            title="Saves Global Settings with this order as a new draft version — switch it Live on the Version Page to show it on the dashboard"
            className="inline-flex items-center gap-1.5 rounded-full bg-action px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-action-hover disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save Position
          </button>
        )}
      />
      <div className="rounded-xl border border-divider bg-background p-4">
        <p className="mb-3 text-[12px] text-subtle">
          The order every user&rsquo;s dashboard sidebar shows these {k.noun}s in (top = first). Once a changed order is in the version the dashboard shows, it replaces a user&rsquo;s own earlier arrangement from Position Settings — they can re-arrange again afterwards.
        </p>
        {!items.length ? (
          <p className="py-6 text-center text-[12.5px] text-subtle">No {k.noun}s yet.</p>
        ) : (
          <PositionList
            items={items}
            onMove={moveTo}
            renderRow={(it) => {
              const Icon = tabIconFor(it.icon, k.icon);
              return (
                <>
                  <Icon size={15} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{it.name || 'Untitled'}</span>
                </>
              );
            }}
          />
        )}
      </div>
    </div>
  );
}
