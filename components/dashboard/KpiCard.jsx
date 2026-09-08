'use client';

import { fmtMoney } from '@/lib/profitLoss/fmt';

// One stat card: label + secondary metric on the top row, big ₹ figure below.
// Matches the reference: rounded-2xl, hairline border, white surface.
export default function KpiCard({ label, meta, value, signed = false, onClick, active }) {
  const neg = signed && Number(value) < 0;
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-muted">{label}</span>
        {meta != null && meta !== '' && (
          <span className="text-sm font-medium text-subtle">{meta}</span>
        )}
      </div>
      <div className={`mt-3 text-[1.7rem] font-bold leading-tight tracking-tight ${neg ? 'text-neg' : 'text-foreground'}`}>
        {fmtMoney(value, { symbol: true })}
      </div>
    </>
  );

  const cls = `flex flex-col rounded-2xl border bg-background p-5 text-left ${
    active ? 'border-accent' : 'border-divider'
  }`;

  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} cursor-pointer transition-colors hover:border-divider-light`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
