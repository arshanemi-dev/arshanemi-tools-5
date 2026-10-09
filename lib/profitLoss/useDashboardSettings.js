'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isLoggedIn } from '@/lib/tokenStore';
import { getSettings, putSettings } from './apiClient';
import { failureMessage } from './templatesApi';

// Centralizes the per-user /api/profit-loss/settings row: the "My Details"
// column ticks (preferences.myDetails — see below), ads/date preferences, the dashboard
// personalization layout (preferences.layout — which tabs/title-cards/
// graphs/columns show and in what order, edited via the sidebar's
// Settings -> Save toggle), the saved Brand list (preferences.brands —
// created ad hoc from the toolbar's Brand picker), the manually-typed
// per-SKU cost overrides (preferences.skuCosts — typed straight into the
// table's Cost column, see DetailsTable), and every mapped header's last-
// known value per SKU (preferences.extractedData — see
// lib/profitLoss/extractedDataStore.js; unlike skuCosts this is never
// hand-typed, it's a standing snapshot of whatever the table last computed,
// so a returning user's table isn't blank on headers this session's upload
// doesn't happen to cover). All of them live in the same preferences JSONB
// blob and PUT replaces it wholesale (see upsertProfitLossSettings in the
// hub's lib/db.js) — every write path here must resend the others or it
// silently wipes them, hence `latest` + `save()` funnelling every write.
//
// "My Details" ticks are kept per tab — preferences.myDetails:
// { [tabId]: [headerId, ...] } — because each tab starts from its own
// default (the headers the template picked for it, see myDetailColumns in
// lib/profitLoss/tabColumns.js), so one tab's ticks can't be another's. The
// row's own headers[] is the older single list shared by every tab; it's
// still honoured for a tab that has no ticks of its own yet, and cleared —
// along with every per-tab list — by Reset Position. Overview tabs keep
// their ticks in the same map, under their own id.
//
// A tab's ticks are saved with the default headers they were made against
// (preferences.myDetailsBase: { [tabId]: [headerId, ...] }). When Template
// Settings changes which headers that tab shows and the version is
// published, the newer change wins: the ticks stop applying and the tab
// shows its new default — same rule as a re-positioned order in
// lib/profitLoss/layoutSections.js.
const NO_TICKS = [];
const plainObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const sameSet = (a, b) => {
  const A = new Set(a);
  const B = new Set(b);
  return A.size === B.size && [...A].every((x) => B.has(x));
};

export function useDashboardSettings({ ads, dateRange, onLoadedPreferences, addToast }) {
  const [loggedIn] = useState(() => isLoggedIn());
  const [myColumns, setMyColumns] = useState([]);
  const [myDetails, setMyDetails] = useState({});
  const [myDetailsBase, setMyDetailsBase] = useState({});
  const [layout, setLayout] = useState({});
  const [brands, setBrands] = useState([]);
  const [skuCosts, setSkuCosts] = useState({});
  const [extractedData, setExtractedData] = useState({});
  const [editMode, setEditMode] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);

  const latest = useRef({ ads, dateRange, layout, brands, skuCosts, extractedData });
  useEffect(() => {
    latest.current = { ads, dateRange, layout, brands, skuCosts, extractedData };
  }, [ads, dateRange, layout, brands, skuCosts, extractedData]);

  // The per-tab ticks as of the last change — a toggle builds the next map
  // from this, not from a render's copy, so two quick toggles can't drop one.
  const myDetailsRef = useRef({ ticks: {}, base: {} });
  const applyMyDetails = useCallback((ticks, base) => {
    myDetailsRef.current = { ticks, base };
    setMyDetails(ticks);
    setMyDetailsBase(base);
  }, []);

  // A save the hub turned down must not look like one that landed. Returns
  // whether it did; says why when it didn't (at most once every few seconds,
  // so a save that keeps failing while typing doesn't stack toasts).
  const lastFailureAt = useRef(0);
  const landed = useCallback((res, what) => {
    if (!res || res.ok) return true;
    if (Date.now() - lastFailureAt.current > 8000) {
      lastFailureAt.current = Date.now();
      addToast?.(failureMessage(res, what), 'error');
    }
    return false;
  }, [addToast]);

  useEffect(() => {
    if (!loggedIn) return;
    getSettings().then(({ ok, data }) => {
      if (!ok) return;
      if (Array.isArray(data.headers)) setMyColumns(data.headers);
      const p = data.preferences || {};
      applyMyDetails(plainObject(p.myDetails), plainObject(p.myDetailsBase));
      setLayout(p.layout && typeof p.layout === 'object' ? p.layout : {});
      if (Array.isArray(p.brands)) setBrands(p.brands);
      if (p.skuCosts && typeof p.skuCosts === 'object') setSkuCosts(p.skuCosts);
      if (p.extractedData && typeof p.extractedData === 'object') setExtractedData(p.extractedData);
      onLoadedPreferences?.(p);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  const save = useCallback((partial = {}) => {
    if (!loggedIn) return Promise.resolve();
    const { ads: a, dateRange: dr, layout: l, brands: b, skuCosts: sc, extractedData: ed } = latest.current;
    return putSettings({
      headers: partial.headers ?? myColumns,
      preferences: {
        adsMode: a.mode,
        adsValue: a.value,
        defaultDatePreset: dr.preset,
        myDetails: partial.myDetails ?? myDetailsRef.current.ticks,
        myDetailsBase: partial.myDetailsBase ?? myDetailsRef.current.base,
        layout: partial.layout ?? l,
        brands: partial.brands ?? b,
        skuCosts: partial.skuCosts ?? sc,
        extractedData: partial.extractedData ?? ed,
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

  // One tab's My Details ticks: its own list, else the older shared one.
  // That shared list only ever applied to regular Tabs — an Overview tab
  // passes `shared = false` and gets nothing until it has ticks of its own.
  // `defaultIds` = the headers the template picks for this tab right now:
  // ticks made against a different set are out of date and don't apply.
  const myColumnsFor = useCallback((tabId, defaultIds = null, shared = true) => {
    const own = tabId ? myDetails[tabId] : null;
    if (Array.isArray(own)) {
      const base = myDetailsBase[tabId];
      return defaultIds && Array.isArray(base) && !sameSet(base, defaultIds) ? NO_TICKS : own;
    }
    return shared ? myColumns : NO_TICKS;
  }, [myDetails, myDetailsBase, myColumns]);

  const putTimer = useRef(null);
  const onMyColumnsChange = useCallback((tabId, next, defaultIds = []) => {
    if (!tabId) return;
    const ticks = { ...myDetailsRef.current.ticks, [tabId]: next };
    const base = { ...myDetailsRef.current.base, [tabId]: [...(defaultIds || [])] };
    applyMyDetails(ticks, base);
    if (!loggedIn) return;
    clearTimeout(putTimer.current);
    putTimer.current = setTimeout(() => {
      save({ myDetails: ticks, myDetailsBase: base }).then((res) => landed(res, 'Could not save your My Details columns'));
    }, 800);
  }, [loggedIn, save, applyMyDetails, landed]);

  // Cost column edits fire on every keystroke — debounce the network write
  // (not the local state, which feeds the live P&L recompute immediately)
  // so typing a unit cost doesn't PUT on every digit. Session-only when
  // signed out, same as every other piece of this hook's state — for a
  // guest there's genuinely nothing to save, so `skuCostsSaveTick` never
  // advances and DashboardWorkspace's "unsaved" row highlight stays on,
  // which is the correct signal (it really won't persist for them).
  // `skuCostsSaveTick` increments only once the debounced PUT actually
  // succeeds — DashboardWorkspace watches it to clear its per-row "unsaved"
  // (light blue) highlight back to normal.
  const [skuCostsSaveTick, setSkuCostsSaveTick] = useState(0);
  const costTimer = useRef(null);
  const onSkuCostsChange = useCallback((nextMap) => {
    setSkuCosts(nextMap);
    if (!loggedIn) return;
    clearTimeout(costTimer.current);
    costTimer.current = setTimeout(() => {
      save({ skuCosts: nextMap }).then((res) => { if (landed(res, 'Could not save your SKU costs')) setSkuCostsSaveTick((n) => n + 1); });
    }, 800);
  }, [loggedIn, save, landed]);

  // Fires whenever the table recomputes with something new to remember (see
  // DashboardWorkspace, which merges fresh values in before calling this —
  // never wholesale-replaces, so a header this session's upload doesn't
  // touch keeps whatever was saved before). Background/automatic, not a
  // user action, so — unlike skuCosts — there's no "unsaved" UI tied to it.
  const dataTimer = useRef(null);
  const onExtractedDataChange = useCallback((nextData) => {
    setExtractedData(nextData);
    if (!loggedIn) return;
    clearTimeout(dataTimer.current);
    dataTimer.current = setTimeout(() => save({ extractedData: nextData }), 800);
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

  // putSettings resolves on an HTTP error too ({ ok: false, status }) — the
  // hub can turn a save down (too large, access removed, unreachable), and
  // that used to still toast "saved" and close edit mode.
  const saveLayout = useCallback(async () => {
    setSavingLayout(true);
    try {
      const res = await save({});
      if (res && !res.ok) { addToast?.(failureMessage(res, 'Could not save your layout'), 'error'); return; }
      addToast?.('Dashboard layout saved');
      setEditMode(false);
    } catch (err) {
      addToast?.(failureMessage(err, 'Could not save your layout'), 'error');
    } finally {
      setSavingLayout(false);
    }
  }, [save, addToast]);

  // Reset Position: every show/hide + reorder override — and every My
  // Details tick, on every tab — back to the marketplace template's own
  // arrangement (its tab order, each tab showing the headers the template
  // picked for it). Saved straight away and edit mode is left: a reset that
  // only held until the next reload unless Save Position was pressed after
  // it read as "reset doesn't work". The screen changes only once the save
  // has landed, so it can't show a reset that didn't happen. A My Details
  // save still waiting on its debounce is dropped, or it would write the old
  // ticks back right after. Resolves true / false.
  const resetLayout = useCallback(async () => {
    clearTimeout(putTimer.current);
    setSavingLayout(true);
    try {
      const res = await save({ headers: [], layout: {}, myDetails: {}, myDetailsBase: {} });
      if (res && !res.ok) { addToast?.(failureMessage(res, 'Could not reset your layout'), 'error'); return false; }
      setLayout({});
      setMyColumns([]);
      applyMyDetails({}, {});
      setEditMode(false);
      addToast?.('Dashboard reset to the template’s default layout');
      return true;
    } catch (err) {
      addToast?.(failureMessage(err, 'Could not reset your layout'), 'error');
      return false;
    } finally {
      setSavingLayout(false);
    }
  }, [save, addToast, applyMyDetails]);

  return {
    loggedIn,
    myColumnsFor,
    onMyColumnsChange,
    layout,
    setTopSection,
    setTabSection,
    resetLayout,
    brands,
    addBrand,
    skuCosts,
    onSkuCostsChange,
    skuCostsSaveTick,
    extractedData,
    onExtractedDataChange,
    editMode,
    setEditMode,
    saveLayout,
    savingLayout,
  };
}
