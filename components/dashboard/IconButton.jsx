'use client';

import { useRef } from 'react';

const TONES = {
  action: 'bg-action text-white hover:bg-action-hover border border-transparent',
  outline: 'bg-background text-foreground border border-divider-light hover:border-divider',
  ghost: 'bg-transparent text-muted border border-transparent hover:bg-card-hover',
  activeOutline: 'bg-accent/5 text-foreground border border-accent',
};

// Compact control: icon always, label only from `sm:` up (icon-only on phones).
// `title` drives the hover tooltip so an icon-only button still tells you what
// it does.
export default function IconButton({
  icon: Icon,
  label,
  title,
  tone = 'outline',
  active,
  disabled,
  onClick,
  badge,
  type = 'button',
}) {
  const cls = TONES[active ? 'activeOutline' : tone] ?? TONES.outline;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      aria-label={title || label}
      className={`relative inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors disabled:opacity-45 ${cls}`}
    >
      {Icon && <Icon size={15} className="shrink-0" />}
      {label && <span className="hidden whitespace-nowrap sm:inline">{label}</span>}
      {badge != null && (
        <span className="ml-0.5 rounded-full bg-action-soft px-1.5 text-[10px] font-bold leading-4 text-action">
          {badge}
        </span>
      )}
    </button>
  );
}

// Same look, but clicking it opens a file picker.
export function FileIconButton({ icon: Icon, label, title, accept = '.csv,.xlsx,.xls', multiple = true, onFiles, disabled, tone = 'action' }) {
  const ref = useRef(null);
  const cls = TONES[tone] ?? TONES.action;
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={disabled}
        title={title || label}
        aria-label={title || label}
        className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors disabled:opacity-45 ${cls}`}
      >
        {Icon && <Icon size={15} className="shrink-0" />}
        {label && <span className="hidden whitespace-nowrap sm:inline">{label}</span>}
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}
