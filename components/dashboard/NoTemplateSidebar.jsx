'use client';

import { useState } from 'react';
import { Layers, Sparkles } from 'lucide-react';

const ITEMS = [
  { key: 'no-template', label: 'No template', icon: Layers },
  { key: 'automatic', label: 'Automatic', icon: Sparkles },
];

// Placeholder rail shown instead of the template-driven nav list when no
// marketplace template is published yet — just the two placeholder tabs,
// "Automatic" active by default since there's nothing configured to pick
// between; both lead to the same "No marketplaces yet" message on the right.
export default function NoTemplateSidebar() {
  const [active, setActive] = useState('automatic');

  return (
    <aside className="hidden w-56 flex-shrink-0 flex-col border-r border-divider bg-background py-4 lg:flex">
      <nav className="flex flex-col gap-0.5 px-2">
        {ITEMS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActive(key)}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] font-medium transition-colors ${
              active === key ? 'bg-footer text-white' : 'text-foreground/75 hover:bg-foreground/5 hover:text-foreground'
            }`}
          >
            <Icon size={16} className="shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
