'use client';

import { useEffect, useRef, useState } from 'react';

// Minimal click-to-open popover: a trigger button + an absolutely-positioned
// panel that closes on outside-click / Escape. Used by every dropdown control
// on the dashboard so they behave identically.
export default function Popover({ trigger, children, align = 'left', panelClass = '', open: controlledOpen, onOpenChange }) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = controlledOpen ?? uncontrolled;
  const setOpen = (v) => {
    if (onOpenChange) onOpenChange(v);
    if (controlledOpen === undefined) setUncontrolled(v);
  };
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen(!open)}>{trigger(open)}</div>
      {open && (
        <div
          className={`dropdown-panel-in absolute z-40 mt-2 min-w-[12rem] rounded-xl border border-divider-light bg-background p-1 shadow-lg shadow-black/5 ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${panelClass}`}
        >
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}
