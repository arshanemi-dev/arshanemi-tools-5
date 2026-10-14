'use client';

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { isHexColor } from '@/data/templateSchema';

// '#abc' → '#aabbcc'; anything that isn't a hex colour → null.
function toHex(text) {
  const t = String(text || '').trim().toLowerCase();
  const short = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(t);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const full = t.startsWith('#') ? t : `#${t}`;
  return isHexColor(full) ? full : null;
}

// One colour setting: the browser's colour picker beside a hex box (#1565c0,
// #abc, or without the #). `value` = '#rrggbb' or '' — '' means "the
// theme's colour", which the swatch can't show, so it shows `fallback` and
// the box says Default. Only a whole colour reaches `onChange` — half-typed
// hex stays in the box until it is one (or is put back on leaving it);
// Reset hands over '' again.
export default function ColorField({ label, value = '', onChange, fallback = '#ffffff' }) {
  const [typed, setTyped] = useState(null); // the hex box while typing; null = showing `value`
  const bad = typed != null && typed.trim() !== '' && !toHex(typed);

  const onType = (text) => {
    setTyped(text);
    if (text.trim() === '') onChange('');
    else {
      const hex = toHex(text);
      if (hex) onChange(hex);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="w-32 shrink-0 text-[12.5px] font-medium text-foreground">{label}</span>
      <input
        type="color"
        value={value || fallback}
        onChange={(e) => { setTyped(null); onChange(e.target.value.toLowerCase()); }}
        aria-label={`${label} — colour picker`}
        className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-divider bg-background p-0.5"
      />
      <input
        value={typed ?? value}
        onChange={(e) => onType(e.target.value)}
        onBlur={() => setTyped(null)}
        placeholder="Default"
        spellCheck={false}
        aria-label={`${label} — hex`}
        aria-invalid={bad || undefined}
        title={bad ? 'Not a colour yet — e.g. #1565c0' : undefined}
        className={`w-28 rounded-lg border bg-background px-2.5 py-1.5 font-mono text-[12.5px] focus:outline-none ${bad ? 'border-neg' : 'border-divider focus:border-accent'}`}
      />
      {value && (
        <button
          type="button"
          onClick={() => { setTyped(null); onChange(''); }}
          title="Back to the theme's colour"
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] text-muted hover:bg-card-hover hover:text-foreground"
        >
          <RotateCcw size={12} /> Default
        </button>
      )}
    </div>
  );
}
