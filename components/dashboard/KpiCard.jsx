'use client';

import ArrangeControl from './ArrangeControl';
import { isHexColor } from '@/data/templateSchema';

// One title card: name + sub value on the top row, big main value below.
// Matches the reference — rounded-2xl, hairline border, ₹ prefix for money.
// `textColor` / `bgColor` = the card's own colours from Template Settings
// ('#rrggbb', or nothing for the theme's). They are admin-picked data, so
// they go in `style` (as PlatformBadge's colours do) — no class can hold
// them. With a text colour the name and sub value are that colour, faded;
// a negative main value stays red either way.
export default function KpiCard({
  name, mainDisplay, mainRaw, subDisplay, format = 'money', signed = false, textColor, bgColor,
  editMode = false, currentId, items, hiddenIds, onSwapWith, onHide,
}) {
  const neg = signed && Number(mainRaw) < 0;
  const prefix = format === 'money' ? '₹' : '';
  const ownText = isHexColor(textColor);
  const colors = { color: ownText ? textColor : undefined, backgroundColor: isHexColor(bgColor) ? bgColor : undefined };
  return (
    <div className="relative flex flex-col rounded-2xl border border-divider bg-background p-5 text-left" style={colors}>
      {editMode && (
        <ArrangeControl
          currentId={currentId}
          items={items}
          hiddenIds={hiddenIds}
          onSwapWith={onSwapWith}
          onHide={onHide}
          className="absolute right-2 top-2"
        />
      )}
      <div className={`flex items-start justify-between gap-2 ${editMode ? 'pr-10' : ''}`}>
        <span className={`text-sm ${ownText ? 'opacity-80' : 'text-muted'}`}>{name}</span>
        {subDisplay != null && subDisplay !== '' && (
          <span className={`text-sm font-medium ${ownText ? 'opacity-70' : 'text-subtle'}`}>{subDisplay}</span>
        )}
      </div>
      <div className={`mt-3 text-[1.7rem] font-bold leading-tight tracking-tight ${neg ? 'text-neg' : ownText ? '' : 'text-foreground'}`}>
        {prefix}{mainDisplay === '' || mainDisplay == null ? '0' : mainDisplay}
      </div>
    </div>
  );
}
