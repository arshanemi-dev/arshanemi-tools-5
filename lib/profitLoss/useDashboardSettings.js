'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isLoggedIn } from '@/lib/tokenStore';
import { getSettings, putSettings } from './apiClient';

// Centralizes the per-user /api/profit-loss/settings row: the "My Details"
// column subset (headers[]), ads/date preferences, the dashboard
// personalization layout (preferences.layout — which tabs/title-cards/
// graphs/columns show and in what order, edited via the sidebar's
// Settings -> Save toggle), the saved Brand list (preferences.brands —
// created ad hoc from the toolbar's Brand picker), and the manually-typed
// per-SKU cost overrides (preferences.skuCosts — typed straight into the
// table's Cost column, see DetailsTable). All five live in the same
// preferences JSONB blob and PUT replaces it wholesale (see
// upsertProfitLossSettings in the hub's lib/db.js) — every write path here
// must resend the others or it silently wipes them, hence `latest` + `save()`
// funnelling every write.
export function useDashboardSettings({ ads, dateRange, onLoadedPreferences, addToast }) {
  const [loggedIn] = useState(() => isLoggedIn());
  const [myColumns, setMyColumns] = useState([]);
  const [layout, setLayout] = useState({});
  const [brands, setBrands] = useState([]);
  const [skuCosts, setSkuCosts] = useState({});
  const [editMode, setEditMode] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);

  const latest = useRef({ ads, dateRange, layout, brands, skuCosts });
  useEffect(() => {
    latest.current = { ads, dateRange, layout, brands, skuCosts };
  }, [ads, dateRange, layout, brands, skuCosts]);

  useEffect(() => {
    if (!loggedIn) return;
    getSettings().then(({ ok, data }) => {
      if (!ok) return;
      if (Array.isArray(data.headers)) setMyColumns(data.headers);
      const p = data.preferences || {};
      setLayout(p.layout && typeof p.layout === 'object' ? p.layout : {});
      if (Array.isArray(p.brands)) setBrands(p.brands);
      if (p.skuCosts && typeof p.skuCosts === 'object') setSkuCosts(p.skuCosts);
      onLoadedPreferences?.(p);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  const save = useCallback((partial = {}) => {
    if (!loggedIn) return Promise.resolve();
    const { ads: a, dateRange: dr, layout: l, brands: b, skuCosts: sc } = latest.current;
    return putSettings({
      headers: partial.headers ?? myColumns,
      preferences: {
        adsMode: a.mode,
        adsValue: a.value,
        defaultDatePreset: dr.preset,
        layout: partial.layout ?? l,
        brands: partial.brands ?? b,
        skuCosts: partial.skuCosts ?? sc,
      },
    });
  }, [loggedIn, myColumns]);

  // Adds a brand to the saved list (case-insensitive de-dupe) — works signed
  // out too (session-only, like every other piece of this hook's state), and
  // persists immediately for a signed-in user since creating a brand is a
  // deliberate one-off action, not something to debounce.
  const addBrand = useCallback((name) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return;
    setBrands((prev) => {
      if (prev.some((b) => b.toLowerCase() === trimmed.toLowerCase())) return prev;
      const next = [...prev, trimmed];
      if (loggedIn) save({ brands: next }).catch(() => addToast?.('Could not save the new brand', 'error'));
      return next;
    });
  }, [loggedIn, save, addToast]);

  const putTimer = useRef(null);
  const onMyColumnsChange = useCallback((next) => {
    setMyColumns(next);
    if (!loggedIn) return;
    clearTimeout(putTimer.current);
    putTimer.current = setTimeout(() => save({ headers: next }), 800);
  }, [loggedIn, save]);

  // Cost column edits fire on every keystroke — debounce the network write
  // (not the local state, which feeds the live P&L recompute immediately)
  // so typing a unit cost doesn't PUT on every digit. Session-only when
  // signed out, same as every other piece of this hook's state.
  const costTimer = useRef(null);
  const onSkuCostsChange = useCallback((nextMap) => {
    setSkuCosts(nextMap);
    if (!loggedIn) return;
    clearTimeout(costTimer.current);
    costTimer.current = setTimeout(() => save({ skuCosts: nextMap }), 800);
  }, [loggedIn, save]);

  const setTopSection = useCallback((key, next) => {
    setLayout((prev) => ({ ...prev, [key]: next }));
  }, []);

  const setTabSection = useCallback((tabId, kind, next) => {
    setLayout((prev) => ({
      ...prev,
      perTab: { ...prev.perTab, [tabId]: { ...prev.perTab?.[tabId], [kind]: next } },
    }));
  }, []);

  const saveLayout = useCallback(async () => {
    setSavingLayout(true);
    try {
      await save({});
      addToast?.('Dashboard layout saved');
      setEditMode(false);
    } catch {
      addToast?.('Could not save layout', 'error');
    } finally {
      setSavingLayout(false);
    }
  }, [save, addToast]);

  // Clears every show/hide + reorder override back to the marketplace
  // template's own default arrangement. Only touches local state — like the
  // dropdown edits themselves, it takes effect on screen immediately but
  // isn't written to /api/profit-loss/settings until Save is clicked, so a
  // reset can still be backed out of by leaving edit mode without saving.
  const resetLayout = useCallback(() => setLayout({}), []);

  return {
    loggedIn,
    myColumns,
    onMyColumnsChange,
    layout,
    setTopSection,
    setTabSection,
    resetLayout,
    brands,
    addBrand,
    skuCosts,
    onSkuCostsChange,
    editMode,
    setEditMode,
    saveLayout,
    savingLayout,
  };
}
