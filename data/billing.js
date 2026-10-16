// Coins for an upload (lib/profitLoss/useUploadBilling.js) — which of the
// admin panel's Tools Catalog features an upload is charged against, and what
// stays free. The coin PRICES are not here: each is that feature's Coin Cost
// (admin panel → Settings → Tools Catalog → Profit & Loss → Features), read by
// the hub's /api/wallet/deduct on every charge, which also writes the coin
// history. A feature that isn't in the catalog, or is switched off there, is
// simply not charged.
export const PL_BILLING = {
  toolSlug: 'profit-loss',
  orderFeature: 'pl-orders',     // Coin Cost = coins per order (e.g. 0.2), charged per new unique Order Id
  accountFeature: 'pl-account',  // Coin Cost = coins per extra account (Marketplace + Brand) per month (e.g. 100)
  freeOrdersPerMonth: 500,       // per order month (the order's own date)
  freeAccounts: 1,
};
