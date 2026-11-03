'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

const GAP = 6; // px between the ⓘ and the panel
const EDGE = 8; // px kept clear of the viewport's edges
const CLOSE_DELAY = 150; // ms — time to move the pointer from the ⓘ onto the panel

// The ⓘ at the end of a dashboard column header: hover / focus it (tap on a
// phone) and the header's Description — Template Settings → Header → Add /
// Edit, up to 300 words — shows in a panel. The panel is portalled to <body>
// with fixed positioning, so the table's scroll area (overflow) never clips
// it; it sits below the ⓘ, or above when there's no room, kept inside the
// viewport. It stays open while the pointer is on it (a long description
// scrolls inside it); closes on leave / blur / Escape / outside tap / a
// scroll of the page.
// `onDark` = it sits in the dark navy header band (the dashboard tables) —
// white tones; false for a light header row.
export default function HeaderInfoTip({ label, text, onDark = true, onOpenChange }) {
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const timer = useRef(null);
  const [open, setOpen] = useState(false);

  const show = () => {
    clearTimeout(timer.current);
    setOpen(true);
    onOpenChange?.(true);
  };
  const hideSoon = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setOpen(false);
      onOpenChange?.(false);
    }, CLOSE_DELAY);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  // Placed straight on the panel's style once it's measured, before paint —
  // it renders off-screen first, so its size is known.
  useLayoutEffect(() => {
    const el = panelRef.current;
    const at = btnRef.current?.getBoundingClientRect();
    if (!open || !el || !at) return;
    const panel = el.getBoundingClientRect();
    const below = at.bottom + GAP;
    const top = below + panel.height > window.innerHeight - EDGE && at.top - GAP - panel.height >= EDGE
      ? at.top - GAP - panel.height
      : below;
    const left = Math.min(Math.max(at.left + at.width / 2 - panel.width / 2, EDGE), window.innerWidth - panel.width - EDGE);
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => {
      setOpen(false);
      onOpenChange?.(false);
    };
    const onScroll = (e) => { if (!panelRef.current?.contains(e.target)) close(); };
    const onKey = (e) => e.key === 'Escape' && close();
    const onDoc = (e) => { if (!btnRef.current?.contains(e.target) && !panelRef.current?.contains(e.target)) close(); };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDoc);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDoc);
    };
  }, [open, onOpenChange]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={show}
        onMouseLeave={hideSoon}
        onFocus={show}
        onBlur={hideSoon}
        onClick={() => {
          if (open) {
            setOpen(false);
            onOpenChange?.(false);
          } else {
            show();
          }
        }}
        className={`shrink-0 rounded p-0.5 align-middle transition-colors ${onDark
          ? `hover:bg-white/15 ${open ? 'text-white' : 'text-white/60 hover:text-white'}`
          : `hover:bg-card-hover ${open ? 'text-foreground' : 'text-subtle hover:text-foreground'}`}`}
        aria-label={`About ${label}`}
        aria-expanded={open}
      >
        <Info size={12} />
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          role="tooltip"
          onMouseEnter={show}
          onMouseLeave={hideSoon}
          style={{ top: -9999, left: -9999 }}
          className="fixed z-[60] max-h-[min(60vh,26rem)] w-max max-w-[min(26rem,calc(100vw-16px))] overflow-y-auto rounded-lg border border-divider-light bg-background px-3 py-2 text-left text-[12px] font-normal leading-relaxed text-foreground shadow-lg shadow-black/10"
        >
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
          <p className="whitespace-pre-line break-words">{text}</p>
        </div>,
        document.body,
      )}
    </>
  );
}
