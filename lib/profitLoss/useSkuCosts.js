'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isLoggedIn } from '@/lib/tokenStore';
import { listSkuCosts, saveSkuCosts } from './apiClient';
import { failureMessage } from './templatesApi';
import { createSaveQueue } from './saveQueue';
import { changedCostItems, costCellKey, costCellOf, mergeSkuCosts, skuCostsFromList, withSkuCostField } from './skuCosts';

// Each SKU's DEFAULT costs (lib/profitLoss/skuCosts.js) for the dashboard:
// the live copy everything is priced from, and its home in the hub's
// profit_loss_sku_costs table — one row per SKU.
//
//  - Loaded once for a signed-in user. Signed out it starts empty and lives
//    for the session only, like the rest of the dashboard's state.
//  - A typed cost (`onCostChange(sku, field, text)` — one table cell at a
//    time, components/dashboard/CostCell.jsx) is live at once and saved as a
//    request of its own carrying just that one cost. Saves go out one after
//    another in the order typed (lib/profitLoss/saveQueue.js).
//    `dirtyCostCells` (a Set of costCellKey) = typed and not saved yet — a
//    cell leaves it when the save carrying ITS latest value lands, so it
//    stays marked while a save is on its way, after one fails, and for good
//    when signed out (nothing is saved then). `dirtySkuKeys` = the SKUs
//    those belong to.
//  - An uploaded SKU Cost sheet (`applyCostSheet(incoming)`, the shape
//    mergeSkuCosts takes) is laid over the live costs and only the costs it
//    actually changed are sent, in batches.
//  - Costs used to live in the settings row (preferences.skuCosts).
//    `adoptLegacyCosts(saved)` hands those over once the settings have
//    loaded: with the table still empty they become the live costs and are
//    written into it; `legacyMoved` turns true once the table holds them (or
//    already did), which is the caller's cue to drop the settings copy.
//    Should the table be unreachable they are at least shown, and the
//    settings copy is left alone.
export function useSkuCosts({ addToast } = {}) {
  const [loggedIn] = useState(() => isLoggedIn());
  const [skuCosts, setSkuCosts] = useState({});
  const [dirtyCostCells, setDirtyCostCells] = useState(() => new Set());
  const [legacyMoved, setLegacyMoved] = useState(false);

  // The costs as of the last change — two changes made before the next
  // render (a page of rows leaving the screen mid-edit) must build on each
  // other, not both on the same render's copy.
  const live = useRef({});
  const apply = useCallback((next) => {
    live.current = next;
    setSkuCosts(next);
  }, []);

  // costCellKey → the value last typed there and not confirmed saved.
  const wanted = useRef(new Map());
  // Everything changed here before the table's costs arrived — laid back
  // over them when they do, or the load would undo it on screen.
  const early = useRef({});
  const table = useRef('loading'); // 'loading' | 'filled' | 'empty' | 'failed'
  const legacy = useRef(undefined); // preferences.skuCosts, once the settings have loaded
  const legacyDone = useRef(false);

  const toast = useRef(addToast);
  useEffect(() => { toast.current = addToast; });

  // The one queue every save here goes through — made on first use (an edit,
  // a sheet, the old costs being moved), never while rendering.
  const queueRef = useRef(null);
  const saves = useCallback(() => {
    if (!queueRef.current) {
      queueRef.current = createSaveQueue({
        send: (job) => saveSkuCosts(job.items),
        onSaved: (job) => {
          job.onSaved?.();
          if (job.key == null || !Object.is(wanted.current.get(job.key), job.value)) return; // a newer value is on its way
          wanted.current.delete(job.key);
          setDirtyCostCells((prev) => {
            const next = new Set(prev);
            next.delete(job.key);
            return next;
          });
        },
        // Said once per run of failures, not on every retry.
        onFailed: (job, res, { first }) => {
          if (first) toast.current?.(failureMessage(res.thrown || res, 'Could not save your SKU costs'), 'error');
        },
      });
    }
    return queueRef.current;
  }, []);
  useEffect(() => () => queueRef.current?.cancelRetry(), []);

  const remember = useCallback((incoming) => {
    if (table.current !== 'loading') return;
    for (const [sku, fields] of Object.entries(incoming)) early.current[sku] = { ...early.current[sku], ...fields };
  }, []);

  // Runs when the table's costs and the old settings copy are both known —
  // whichever arrives second calls it.
  const reconcile = useCallback(() => {
    const old = legacy.current;
    if (legacyDone.current || old === undefined || table.current === 'loading') return;
    legacyDone.current = true;
    if (!Object.keys(old).length) return;
    if (table.current === 'filled') { setLegacyMoved(true); return; } // the table is the truth already
    // The old costs, under anything changed here since the page opened —
    // and that is what goes into the table, so a cost typed in the meantime
    // isn't overwritten by its old value.
    const next = Object.entries(live.current).reduce((costs, [sku, rec]) => mergeSkuCosts(costs, { [sku]: rec }), old);
    apply(next);
    if (table.current === 'empty') saves().push({ items: changedCostItems({}, next), onSaved: () => setLegacyMoved(true) });
  }, [apply, saves]);

  useEffect(() => {
    if (!loggedIn) return undefined;
    let cancelled = false;
    const loaded = (state, costs = null) => {
      if (cancelled) return;
      if (costs) apply(mergeSkuCosts(costs, early.current));
      table.current = state;
      reconcile();
    };
    listSkuCosts()
      .then((res) => {
        if (!res.ok) {
          toast.current?.(failureMessage(res, 'Could not load your SKU costs'), 'error');
          loaded('failed');
          return;
        }
        const costs = skuCostsFromList(res.data?.costs);
        loaded(Object.keys(costs).length ? 'filled' : 'empty', costs);
      })
      .catch(() => loaded('failed'));
    return () => { cancelled = true; };
  }, [loggedIn, apply, reconcile]);

  const adoptLegacyCosts = useCallback((saved) => {
    legacy.current = saved || {};
    reconcile();
  }, [reconcile]);

  const onCostChange = useCallback((sku, field, rawValue) => {
    const next = withSkuCostField(live.current, sku, field, rawValue);
    if (next === live.current) return; // not a number — nothing to take in
    const key = costCellKey(sku, field);
    const value = next[sku]?.[field] ?? null;
    const same = (live.current[sku]?.[field] ?? null) === value;
    if (same && !wanted.current.has(key)) return; // typed what is already there, and saved
    if (!same) {
      apply(next);
      remember({ [sku]: { [field]: value } });
    }
    wanted.current.set(key, value);
    setDirtyCostCells((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    if (loggedIn) saves().push({ key, value, items: [{ sku, [field]: value }] });
  }, [apply, remember, loggedIn, saves]);

  const applyCostSheet = useCallback((incoming) => {
    const before = live.current;
    const next = mergeSkuCosts(before, incoming);
    apply(next);
    remember(incoming);
    const items = changedCostItems(before, next);
    if (loggedIn && items.length) saves().push({ items });
  }, [apply, remember, loggedIn, saves]);

  const dirtySkuKeys = useMemo(() => new Set([...dirtyCostCells].map((key) => costCellOf(key)[0])), [dirtyCostCells]);

  return { skuCosts, onCostChange, applyCostSheet, adoptLegacyCosts, legacyMoved, dirtyCostCells, dirtySkuKeys };
}
