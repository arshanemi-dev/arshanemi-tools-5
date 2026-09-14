import { normHeader, num, absNum, toISODate, classifyStatus, canonicalRow } from './canonical.js';
import { getPlatform, detectPlatform } from './detect.js';

export { PLATFORMS, PLATFORM_BY_ID, getPlatform, detectPlatform } from './detect.js';

// Which tab of a multi-sheet workbook to read when the user hasn't explicitly
// chosen one in Sheet Settings: the tab whose header set best fingerprints
// this platform, else the biggest tab, else the first.
export function pickBestTab(platformId, byTab, sheetNames) {
  const plat = getPlatform(platformId);
  let best = sheetNames[0];
  let bestScore = -1;
  for (const name of sheetNames) {
    const t = byTab[name];
    if (!t) continue;
    const normSet = new Set(t.headerRow.map(normHeader));
    const fp = plat.matches ? plat.matches(normSet, normHeader(name)) : false;
    const score = (fp ? 1000 : 0) + t.rows.length;
    if (score > bestScore) {
      bestScore = score;
      best = name;
    }
  }
  return best;
}

// Map a batch of raw sheet rows to canonical rows for one platform, then apply
// the user's Sheet Settings header-map overrides on top. `mapping` is only
// consulted by the 'manual' platform's own mapper; `headerMap` is the generic
// override layer that works for every platform. `tag` (the brand picked in
// the toolbar before this upload, plus the "MarketPlace_Brand" combo derived
// from it) is stamped onto every row the same way regardless of platform.
export function mapRowsForPlatform(platformId, rawRows, { headerMap = {}, mapping, tag } = {}) {
  const plat = getPlatform(platformId);
  const hasOverrides = headerMap && Object.keys(headerMap).length > 0;
  const out = [];
  rawRows.forEach((raw, idx) => {
    let c = plat.toCanonical(raw, mapping);
    // The platform mapper bailed (its ID column isn't in this file — e.g. an
    // "Orders" export vs a "Payments" export). If the user has mapped columns
    // in Sheet Settings, drive it from a blank row instead so their mapping
    // still works.
    if (!c && hasOverrides) {
      c = canonicalRow({ platform: platformId, rowId: `${platformId}:r${idx}`, orderId: `r${idx}` });
    }
    if (!c) return;
    if (hasOverrides) c = applyHeaderMap(c, raw, headerMap);
    if (tag) { c.brand = tag.brand ?? c.brand; c.company = tag.company ?? c.company; }
    // Drop rows that carry no usable signal at all.
    if ((c.sku === '—' || !c.sku) && !c.settlement && !c.grossSale && !c.qty) return;
    out.push(c);
  });
  return out;
}

// Re-read the mapped columns straight from the raw row and overwrite whatever
// the platform mapper produced. Every field is optional.
function applyHeaderMap(c, raw, hm) {
  const get = (h) => (h && h in raw ? raw[h] : undefined);

  if (get(hm.orderId) !== undefined) {
    c.orderId = String(get(hm.orderId));
    c.orderItemId = c.orderId;
    c.rowId = `${c.platform}:${c.orderId}`;
  }
  if (get(hm.sku) !== undefined) c.sku = String(get(hm.sku)).trim() || c.sku;
  if (get(hm.orderDate) !== undefined) c.orderDate = toISODate(get(hm.orderDate)) ?? c.orderDate;
  if (get(hm.settlementDate) !== undefined) c.settlementDate = toISODate(get(hm.settlementDate)) ?? c.settlementDate;
  if (get(hm.qty) !== undefined) c.qty = Math.round(num(get(hm.qty))) || c.qty;
  if (get(hm.status) !== undefined) c.status = classifyStatus(get(hm.status));
  if (get(hm.grossSale) !== undefined) c.grossSale = num(get(hm.grossSale));
  if (get(hm.settlement) !== undefined) c.settlement = num(get(hm.settlement));
  if (get(hm.commission) !== undefined) c.fees = { ...c.fees, commission: absNum(get(hm.commission)) };
  if (get(hm.shippingLogistics) !== undefined) c.fees = { ...c.fees, shippingLogistics: absNum(get(hm.shippingLogistics)) };
  if (get(hm.tcs) !== undefined) c.taxes = { ...c.taxes, tcs: absNum(get(hm.tcs)) };
  if (get(hm.tds) !== undefined) c.taxes = { ...c.taxes, tds: absNum(get(hm.tds)) };

  return c;
}
