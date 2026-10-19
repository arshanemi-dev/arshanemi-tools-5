// Coins for an upload (lib/profitLoss/useUploadBilling.js) — which of the
// admin panel's Tools Catalog features an upload is charged against, and how
// much a signed-out visitor can try. The coin PRICES are not here: each is
// that feature's Coin Cost (admin panel → Settings → Tools Catalog → Profit &
// Loss → Features), read by the hub's /api/wallet/deduct on every charge,
// which also writes the coin history. A feature that isn't in the catalog, or
// is switched off there, is simply not charged.
//
// Signed in, nothing is free: every new order and every account is charged.
// A new user's start is the joining bonus coins the hub gives at sign-up.
export const PL_BILLING = {
  toolSlug: 'profit-loss',
  orderFeature: 'pl-orders',     // Coin Cost = coins per order, charged per new unique Order Id
  accountFeature: 'pl-account',  // Coin Cost = coins per account (Marketplace + Brand) per month — every account, the first one too
  // Signed out: nothing is charged or saved, and the dashboard takes at most
  // this much at once.
  guestOrders: 500,              // unique Order Ids
  guestAccounts: 1,              // Marketplace + Brand
};
