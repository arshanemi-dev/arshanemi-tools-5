'use client';

import { useState } from 'react';
import { Layers, Settings, Sparkles } from 'lucide-react';

const ITEMS = [
  { key: 'no-template', label: 'No template', icon: Layers },
  { key: 'automatic', label: 'Automatic', icon: Sparkles },
];

const PILL = 'inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13.5px] font-medium transition-colors';

// Placeholder tab strip shown instead of the template-driven one
// (DashboardTabBar.jsx) when no marketplace template is published yet —
// just the two placeholder tabs, "Automatic" active by default since there's
// nothing configured to pick between; both lead to the same "No marketplaces
// yet" message below. For master_admin / a granted user, also the ONLY way
// to reach Template Settings from a blank dashboard, since this component
// replaces the real strip entirely while zero marketplaces exist.
export default function NoTemplateTabBar({ showTemplateSettings = false, onOpenTemplateSettings }) {
  const [active, setActive] = useState('automatic');

  return (
    <div className="border-b border-divider bg-background">
      <nav aria-label="Dashboard pages" className="flex w-full items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6 lg:px-10">
        {ITEMS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActive(key)}
            aria-current={active === key ? 'page' : undefined}
            className={`${PILL} ${active === key ? 'bg-footer text-white' : 'text-foreground/75 hover:bg-foreground/5 hover:text-foreground'}`}
          >
            <Icon size={16} className="shrink-0" />
            {label}
          </button>
        ))}

        {showTemplateSettings && (
          <button
            type="button"
            onClick={onOpenTemplateSettings}
            className={`${PILL} ml-auto text-foreground/75 hover:bg-foreground/5 hover:text-foreground`}
          >
            <Settings size={16} className="shrink-0" />
            Template Settings
          </button>
        )}
      </nav>
    </div>
  );
}
