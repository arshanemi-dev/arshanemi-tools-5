'use client';

import { Megaphone } from 'lucide-react';
import { CARRY_DAYS } from '@/lib/profitLoss/adsLedger';
import { fmtAnyDate } from '@/lib/profitLoss/dates';

// One line above the table: the Payment sheet's ads spend for the dates /
// account on screen, how much of it landed on ad orders (lib/profitLoss/
// adsLedger.js) and what didn't — so an unallocated amount is never silently
// missing from Profit/Loss. `info` = summarizeAds' result (null = no ads
// sheet uploaded for what's on screen → nothing shown).
const day = (iso) => fmtAnyDate(iso); // DD/MM/YYYY, like every date
const span = (from, to) => (to && to !== from ? `${day(from)}–${day(to)}` : day(from));
// To the paisa — this line is checked against the payout, unlike a KPI card.
const rupees = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AdsLedgerNotice({ info }) {
  if (!info) return null;
  const { total, allocated, unallocated, unallocatedDays, carried, adOrders, chargedOrders } = info;
  const uncharged = adOrders - chargedOrders;
  const warn = unallocated > 0;
  return (
    <div
      role="status"
      className={`flex shrink-0 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg px-3 py-1.5 text-[13px] ${warn ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-action-soft text-action'}`}
    >
      <Megaphone size={14} className="shrink-0" />
      <span className="font-medium">Ads cost from Payment sheet: {rupees(total)}</span>
      <span className="opacity-80">· {rupees(allocated)} split over {chargedOrders.toLocaleString('en-IN')} ad order{chargedOrders === 1 ? '' : 's'} within each deduction duration</span>
      {carried.length > 0 && (
        <span className="opacity-80" title={carried.map((c) => `${span(c.spendDate, c.endDate)} → up to ${day(c.targetDate)}: ${rupees(c.amount)}`).join('\n')}>
          · {carried.length} duration{carried.length === 1 ? '' : 's'} had no ad orders, extended to the next day with some
        </span>
      )}
      {warn && (
        <span
          className="font-medium"
          title={unallocatedDays.map((d) => `${span(d.spendDate, d.endDate)}: ${rupees(d.amount)}`).join('\n')}
        >
          · {rupees(unallocated)} unallocated — no ad orders within {CARRY_DAYS} days of {unallocatedDays.map((d) => span(d.spendDate, d.endDate)).join(', ')}
        </span>
      )}
      {uncharged > 0 && (
        <span className="opacity-80" title="Their ad spend is in another month's Payment sheet — upload it to charge them">
          · {uncharged.toLocaleString('en-IN')} ad order{uncharged === 1 ? '' : 's'} with no spend on {uncharged === 1 ? 'its' : 'their'} date
        </span>
      )}
    </div>
  );
}
