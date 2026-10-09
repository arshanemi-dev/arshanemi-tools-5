// Dates for the template layer — a "Date" header, TODAY() and date maths in
// formulas (lib/profitLoss/formula.js). Whatever a sheet holds is read into
// one thing, a timestamp (ms), and only turned back into text to show it: the
// viewer's own local date. Pure; no React.

import { toISODate } from '@/data/platforms/canonical';

const DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-07-29T08:19:55Z" / "2026-07-29 08:19:55+05:30" — an exact instant.
const ZONED = /^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?)\s*(Z|[+-]\d{2}:?\d{2})$/i;
// A clock time anywhere after the date: "08:19", "08:19:55", "8:19 PM".
const TIME = /(?:^|[T\s,])(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:\s*([ap])\.?\s*m\.?)?/i;

function fromNumber(n) {
  if (!Number.isFinite(n)) return null;
  // 20260729 — a date typed as one number.
  if (Number.isInteger(n) && n >= 19000101 && n <= 22001231) {
    const iso = toISODate(`${String(n).slice(0, 4)}-${String(n).slice(4, 6)}-${String(n).slice(6, 8)}`);
    if (iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).getTime(); }
  }
  // An Excel serial (days since 1899-12-30, the fraction is the time of day)
  // — the day and time as written in the sheet, not shifted by a time zone.
  if (n > 20000 && n < 90000) {
    const whole = Math.floor(n);
    const day = new Date(Date.UTC(1899, 11, 30) + whole * DAY);
    return new Date(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 0, 0, Math.round((n - whole) * 86400)).getTime();
  }
  if (n >= 1e12 && n < 1e14) return n; // epoch milliseconds
  if (n >= 1e9 && n < 1e11) return n * 1000; // epoch seconds
  return null;
}

// Any date / date-time a sheet can hold → a timestamp (ms), or null when it
// isn't one. Text with no time zone is read as local wall-clock time, so the
// day shown is always the day written; a value that names its zone (Z,
// +05:30) is that exact instant. Numeric dates are day-first (India) — see
// toISODate, which this builds on for every textual layout: "2026-08-20",
// "20/08/2026 12:30", "20-08-26", "20-Aug-2026", "Aug 20, 2026 8:19 PM", …
export function parseDateTime(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === 'number') return fromNumber(v);
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d+(?:\.\d+)?$/.test(s)) return fromNumber(Number(s));

  const zoned = s.match(ZONED);
  if (zoned) {
    const zone = zoned[3].toUpperCase() === 'Z' ? 'Z' : zoned[3].replace(/^([+-]\d{2}):?(\d{2})$/, '$1:$2');
    const clock = zoned[2].replace(/^(\d):/, '0$1:');
    const t = Date.parse(`${zoned[1]}T${clock}${zone}`);
    return Number.isNaN(t) ? null : t;
  }

  const iso = toISODate(s);
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  let h = 0;
  let min = 0;
  let sec = 0;
  const t = s.match(TIME);
  if (t) {
    h = Number(t[1]);
    min = Number(t[2]);
    sec = Number(t[3] || 0);
    const half = (t[4] || '').toLowerCase();
    if (half === 'p' && h < 12) h += 12;
    if (half === 'a' && h === 12) h = 0;
    if (h > 23 || min > 59 || sec > 59) { h = 0; min = 0; sec = 0; }
  }
  return new Date(y, m - 1, d, h, min, sec).getTime();
}

// A timestamp → its local date, "29 Jul 2026". Written out by hand rather
// than through a locale, so it reads the same in every browser and export.
export function fmtDate(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// The local calendar day a timestamp falls on, as a day count — what "days
// between" compares, so 23:50 → 00:10 the next morning is 1 day, not 0.
const dayNumber = (ts) => {
  const d = new Date(ts);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
};

// a − b in whole calendar days.
export const daysBetween = (a, b) => dayNumber(a) - dayNumber(b);

// A date moved by `days` (whole days keep the clock time; a fraction is hours).
export function addDays(ts, days) {
  const whole = Math.trunc(days);
  const d = new Date(ts);
  d.setDate(d.getDate() + whole);
  return d.getTime() + Math.round((days - whole) * DAY);
}

// Midnight today, local time — what TODAY() is.
export function startOfToday(now = Date.now()) {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// 1 → "1 day", 3 → "3 days", -2 → "-2 days".
export function fmtDays(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  const shown = Math.round(v * 100) / 100;
  return `${shown} day${Math.abs(shown) === 1 ? '' : 's'}`;
}

// One Date header's value for a GROUP of sheet rows (a SKU's rows, an
// overview node's): `values` = that column on each row. Every row on the
// same day → that date. Several days → the earliest is the value (what
// formulas, sorting and filters use — so TODAY() − [Order Date] on a group
// is its longest wait) and the cell shows the range. Text that isn't a date
// at all is shown as written, never dropped.
export function dateGroupValue(values) {
  let min = null;
  let max = null;
  const texts = [];
  for (const v of values) {
    if (v == null || String(v).trim() === '') continue;
    const ts = parseDateTime(v);
    if (ts == null) { texts.push(String(v).trim()); continue; }
    if (min == null || ts < min) min = ts;
    if (max == null || ts > max) max = ts;
  }
  if (min == null) {
    const uniq = [...new Set(texts)];
    const raw = uniq.length <= 1 ? (uniq[0] ?? '') : `${uniq[0]} +${uniq.length - 1} more`;
    return { raw, display: raw };
  }
  const first = fmtDate(min);
  const last = fmtDate(max);
  return { raw: min, display: first === last ? first : `${first} – ${last}` };
}
