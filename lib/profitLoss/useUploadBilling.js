'use client';

import { useCallback, useState } from 'react';
import { chargeFeature } from './apiClient';
import { countNewOrders, isPaidAccount, accountKey, ordersKey } from './uploadBilling';
import { todayISO } from './dateRanges';
import { PL_BILLING } from '@/data/billing';

// Same switch as lib/toolBilling.js: off → every upload is free, no calls.
const PAID = process.env.NEXT_PUBLIC_IS_PAID === 'true';
// Refusals that open BillingGateModal; any other failure is a toast.
const ALERTS = ['access_denied', 'activation_required', 'insufficient_coins', 'coins_expired'];

// Coins for an upload, checked after its sheets are read and BEFORE its rows
// go onto the dashboard — like tools-4, the tool only counts and fires the
// charge (POST /api/profit-loss/billing → the hub's /api/wallet/deduct with
// a feature + quantity); the price, the cut and the coin history are the
// admin panel's. What is counted: lib/profitLoss/uploadBilling.js.
//  - signed in: the extra account (once a month) and the billable new
//    orders are charged in turn; a refusal opens the coins alert (`gate`, for
//    BillingGateModal) and the upload is left out.
//  - signed out: nothing is charged or saved, but only the free tier fits —
//    past it the free-limit alert opens (`freeLimit`, for FreeTierLimitModal).
//
// → { checkUpload, billed, gate, closeGate, freeLimit, closeFreeLimit }.
// checkUpload({ rows, existingRows, savedCompanies, company }) resolves
// { ok: true, charge } (charge = { newOrders, billableOrders, coins,
// accountCoins }, null when nothing was counted) or { ok: false } once it
// has said why. `billed` = this user's uploads are charged (the upload
// window shows a coins step).
export function useUploadBilling({ loggedIn, orderIdHeader, addToast }) {
  const [gate, setGate] = useState(null);
  const [freeLimit, setFreeLimit] = useState(null);

  const checkUpload = useCallback(async ({ rows, existingRows, savedCompanies = [], company }) => {
    if (!PAID) return { ok: true, charge: null };

    const thisMonth = todayISO().slice(0, 7);
    const orders = countNewOrders({
      existingRows, newRows: rows, orderIdHeader, freePerMonth: PL_BILLING.freeOrdersPerMonth, thisMonth,
    });
    // An account is charged only when the upload brings it new orders.
    const paidAccount = orders.newOrders > 0
      && isPaidAccount({ company, savedCompanies, existingRows, freeAccounts: PL_BILLING.freeAccounts });

    if (!loggedIn) {
      if (orders.billableOrders > 0 || paidAccount) {
        setFreeLimit({ ...orders, paidAccount, freeOrders: PL_BILLING.freeOrdersPerMonth, freeAccounts: PL_BILLING.freeAccounts });
        return { ok: false };
      }
      return { ok: true, charge: null };
    }

    const charges = [];
    if (paidAccount) {
      charges.push({ account: true, featureApiIdentifier: PL_BILLING.accountFeature, quantity: 1, idempotencyKey: accountKey(company, thisMonth) });
    }
    if (orders.billableOrders > 0) {
      charges.push({ featureApiIdentifier: PL_BILLING.orderFeature, quantity: orders.billableOrders, idempotencyKey: await ordersKey(orders.newOrderIds) });
    }

    let coins = 0;
    let accountCoins = 0;
    for (const { account, ...charge } of charges) {
      const res = await chargeFeature(charge);
      if (res.ok) {
        const cost = res.data?.duplicate ? 0 : res.data?.coinsCost || 0; // a repeat was paid for already
        coins += cost;
        if (account) accountCoins += cost;
        continue;
      }
      const reason = res.data?.reason;
      // Not in the Tools Catalog, or switched off there → not charged.
      if (res.status === 402 && reason === 'feature_unavailable') continue;
      if (res.status === 401) return { ok: false }; // authFetch already asked them to log in
      if (res.status === 402 && ALERTS.includes(reason)) {
        setGate({
          reason,
          data: {
            ...res.data.data,
            note: "Nothing from this upload was added. Add coins and upload it again — you won't be charged twice for the same orders.",
          },
        });
      } else {
        addToast(`Upload not added — your coins couldn't be checked (${res.data?.data?.message || res.data?.error || `HTTP ${res.status}`}). Try again.`, 'error');
      }
      return { ok: false };
    }
    return { ok: true, charge: { newOrders: orders.newOrders, billableOrders: orders.billableOrders, coins, accountCoins } };
  }, [loggedIn, orderIdHeader, addToast]);

  const closeGate = useCallback(() => setGate(null), []);
  const closeFreeLimit = useCallback(() => setFreeLimit(null), []);

  return { checkUpload, billed: PAID && loggedIn, gate, closeGate, freeLimit, closeFreeLimit };
}
