'use client';

import { PLATFORM_BY_ID } from '@/data/platforms/detect';

// Small coloured marketplace chip. Falls back gracefully for unknown ids.
export default function PlatformBadge({ id, size = 'sm' }) {
  const p = PLATFORM_BY_ID[id];
  const label = p?.label ?? (id ? id[0].toUpperCase() + id.slice(1) : 'Manual');
  const color = p?.color ?? '#6b7280';
  const pad = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${pad}`}
      style={{ backgroundColor: `${color}1a`, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
