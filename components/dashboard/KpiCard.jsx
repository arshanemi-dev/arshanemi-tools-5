'use client';

import ArrangeControl from './ArrangeControl';

// One title card: name + sub value on the top row, big main value below.
// Matches the reference — rounded-2xl, hairline border, ₹ prefix for money.
export default function KpiCard({
  name, mainDisplay, mainRaw, subDisplay, format = 'money', signed = false,
  editMode = false, currentId, items, hiddenIds, onSwapWith, onHide,
}) {
  const neg = signed && Number(mainRaw) < 0;
  const prefix = format === 'money' ? '₹' : '';
  return (
    <div className="relative flex flex-col rounded-2xl border border-divider bg-background p-5 text-left">
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
        <span className="text-sm text-muted">{name}</span>
        {subDisplay != null && subDisplay !== '' && (
          <span className="text-sm font-medium text-subtle">{subDisplay}</span>
        )}
      </div>
      <div className={`mt-3 text-[1.7rem] font-bold leading-tight tracking-tight ${neg ? 'text-neg' : 'text-foreground'}`}>
        {prefix}{mainDisplay === '' || mainDisplay == null ? '0' : mainDisplay}
      </div>
    </div>
  );
}
