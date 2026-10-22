'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isLoggedIn } from '@/lib/tokenStore';
import { getSettings, putSettings } from './apiClient';
import { failureMessage } from './templatesApi';
import { reconcileLayout, reconcileTicks } from './reconcileLayout';

// Centralizes the per-user /api/profit-loss/settings row: the "My Details"
// column ticks (preferences.myDetails — see below), ads/date preferences, the dashboard
// personalization layout (preferences.layout — which tabs/title-cards/
// graphs/columns show and in what order, edited on the Position Settings
// page — components/positionSettings/), the saved Brand list (preferences.brands —
// created ad hoc from the toolbar's Brand picker), and every mapped header's
// last-known value per SKU (preferences.extractedData — see
// lib/profitLoss/extractedDataStore.js; never hand-typed, it's a standing
// snapshot of whatever the table last computed,
// so a returning user's table isn't blank on headers this session's upload
// doesn't happen to cover). All of them live in the same preferences JSONB
// blob and PUT replaces it wholesale (see upsertProfitLossSettings in the
// hub's lib/db.js) — every write path here must resend the others or it
// silently wipes them, hence `latest` + `save()` funnelling every write.
// `ads` / `dateRange` are the dashboard's own; a page that doesn't show
// them (Position Settings) leaves them out and the saved ones are resent.
//
// The per-SKU costs used to be in that blob too (preferences.skuCosts). They
// have a table of their own now (lib/profitLoss/useSkuCosts.js); what an
// account still has here is handed over on load (`onLoadedPreferences`) and
// resent untouched with every save — a wholesale PUT that left it out would
// delete it — until `dropLegacySkuCosts()` says the table holds it.
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
// (preferences.myDetailsBase: { [tabId]: [headerId, ...] }). When a newer
// version changes which headers that tab shows, the ticks follow it: a
// header the version added to the tab is ticked, one it took off (or
// deleted) is unticked — unless the user ticked it themselves — and every
// other tick stays (reconcileTicks, lib/profitLoss/reconcileLayout.js).
//
// `reconcile(config, marketplaceIds)` does that for the whole saved row —
// the marketplaces' order, the tab strip (tabs and overview tabs), each
// tab's title cards, graphs and columns, the ticks — against the
// version the dashboard has loaded, and saves the row straight away when it
// changed anything (DashboardWorkspace calls it once the live version is in).
const NO_TICKS = [];
const LOAD_RETRY_MS = [1500, 4000, 10000]; // pauses before the 2nd, 3rd and 4th try at loading the saved row
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
  const [legacySkuCosts, setLegacySkuCosts] = useState(null); // preferences.skuCosts as loaded, until the table has it
  const [extractedData, setExtractedData] = useState({});
  const [savingLayout, setSavingLayout] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const latest = useRef({ ads, dateRange, layout, brands, legacySkuCosts, extractedData });
  useEffect(() => {
    latest.current = { ads, dateRange, layout, brands, legacySkuCosts, extractedData };
  }, [ads, dateRange, layout, brands, legacySkuCosts, extractedData]);

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

  // The saved row is loaded once. A request that got no answer — this app
  // restarting, the page reloading under it, the hub down for a moment — is
  // tried again a few times: left at one try, a dropped request showed a
  // returning user an empty dashboard for the whole visit. `loaded` says
  // whether the row has landed; until it has, nothing is SAVED either (see
  // save).
  const loaded = useRef(false);
  const loadedPrefs = useRef({}); // the row's preferences as loaded — the ads / date ones a page without them resends
  useEffect(() => {
    if (!loggedIn) return undefined;
    let cancelled = false;
    let timer = null;
    const load = (attempt) => getSettings().then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        // Signed out or access removed won't get better by asking again.
        const worthRetrying = !res.status || res.status >= 500;
        if (worthRetrying && attempt < LOAD_RETRY_MS.length) timer = setTimeout(() => load(attempt + 1), LOAD_RETRY_MS[attempt]);
        else if (worthRetrying) addToast?.(failureMessage(res, 'Could not load your saved settings'), 'error');
        return;
      }
      loaded.current = true;
      const { data } = res;
      if (Array.isArray(data.headers)) setMyColumns(data.headers);
      const p = data.preferences || {};
      loadedPrefs.current = p;
      applyMyDetails(plainObject(p.myDetails), plainObject(p.myDetailsBase));
      setLayout(p.layout && typeof p.layout === 'object' ? p.layout : {});
      if (Array.isArray(p.brands)) setBrands(p.brands);
      if (p.skuCosts && typeof p.skuCosts === 'object' && Object.keys(p.skuCosts).length) setLegacySkuCosts(p.skuCosts);
      if (p.extractedData && typeof p.extractedData === 'object') setExtractedData(p.extractedData);
      onLoadedPreferences?.(p);
      setSettingsLoaded(true);
    });
    load(0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  const save = useCallback((partial = {}) => {
    if (!loggedIn) return Promise.resolve();
    // The PUT below replaces the saved row wholesale with what this hook
    // holds. Before the row has loaded that is nothing at all — saving then
    // would overwrite the account's brands, layout and ticks with blanks.
    if (!loaded.current) return Promise.resolve({ ok: false, status: 0, data: { error: 'Your saved settings have not loaded — reload the page' } });
    const { ads: a, dateRange: dr, layout: l, brands: b, legacySkuCosts: old, extractedData: ed } = latest.current;
    const oldCosts = 'skuCosts' in partial ? partial.skuCosts : old;
    const kept = loadedPrefs.current;
    return putSettings({
      headers: partial.headers ?? myColumns,
      preferences: {
        adsMode: a ? a.mode : kept.adsMode,
        adsValue: a ? a.value : kept.adsValue,
        defaultDatePreset: dr ? dr.preset : kept.defaultDatePreset,
        myDetails: partial.myDetails ?? myDetailsRef.current.ticks,
        myDetailsBase: partial.myDetailsBase ?? myDetailsRef.current.base,
        layout: partial.layout ?? l,
        brands: partial.brands ?? b,
        ...(oldCosts ? { skuCosts: oldCosts } : {}),
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
  // ticks made against a different set follow the change (reconcileTicks) —
  // the same thing `reconcile` saves.
  const myColumnsFor = useCallback((tabId, defaultIds = null, shared = true) => {
    const own = tabId ? myDetails[tabId] : null;
    if (Array.isArray(own)) {
      const base = myDetailsBase[tabId];
      return defaultIds && Array.isArray(base) && !sameSet(base, defaultIds) ? reconcileTicks(own, base, defaultIds).ticks : own;
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

  // The SKU costs this account still had in preferences.skuCosts are in the
  // profit_loss_sku_costs table now (useSkuCosts says when) — stop carrying
  // the old copy, and take it out of the saved row straight away: left there
  // it would be picked up as "costs to move" again if the table were ever
  // emptied. If this save fails the copy simply stays, and the next visit
  // (the table already filled) drops it again.
  const dropLegacySkuCosts = useCallback(() => {
    if (!latest.current.legacySkuCosts) return;
    setLegacySkuCosts(null);
    save({ skuCosts: null }).catch(() => {});
  }, [save]);

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

  // The saved row against the version on screen (`config` — the dashboard's
  // merged config): what that version added joins it, what it deleted
  // leaves it, and the row is saved at once when anything changed. Signed in
  // only, after the row has loaded — never against an unloaded one.
  const reconcile = useCallback((config, marketplaceIds = null) => {
    if (!loggedIn || !loaded.current) return;
    const saved = { layout: latest.current.layout, myDetails: myDetailsRef.current.ticks, myDetailsBase: myDetailsRef.current.base, headers: myColumns };
    const next = reconcileLayout(saved, config, marketplaceIds);
    if (!next.changed) return;
    latest.current = { ...latest.current, layout: next.layout };
    setLayout(next.layout);
    applyMyDetails(next.myDetails, next.myDetailsBase);
    setMyColumns(next.headers);
    save({ layout: next.layout, myDetails: next.myDetails, myDetailsBase: next.myDetailsBase, headers: next.headers })
      .then((res) => landed(res, 'Could not update your saved layout for the new version'));
  }, [loggedIn, myColumns, save, applyMyDetails, landed]);

  const setTopSection = useCallback((key, next) => {
    setLayout((prev) => ({ ...prev, [key]: next }));
  }, []);

  const setTabSection = useCallback((tabId, kind, next) => {
    setLayout((prev) => ({
      ...prev,
      perTab: { ...prev.perTab, [tabId]: { ...prev.perTab?.[tabId], [kind]: next } },
    }));
  }, []);

  // The Position Settings page's Save: its whole arrangement in one go —
  // `layout` (every section) and `ticks` ({ [tabId]: { ticks, base } }, the
  // tabs whose columns it changed; the others keep theirs). Nothing on
  // screen changes until the hub has it: putSettings resolves on an HTTP
  // error too ({ ok: false, status }) — too large, access removed,
  // unreachable — and that must not read as saved. Resolves true / false.
  const saveArrangement = useCallback(async ({ layout: nextLayout, ticks = {} }) => {
    clearTimeout(putTimer.current);
    const nextTicks = { ...myDetailsRef.current.ticks };
    const nextBase = { ...myDetailsRef.current.base };
    for (const [tabId, t] of Object.entries(ticks)) {
      nextTicks[tabId] = t.ticks;
      nextBase[tabId] = t.base;
    }
    setSavingLayout(true);
    try {
      const res = await save({ layout: nextLayout, myDetails: nextTicks, myDetailsBase: nextBase });
      if (res && !res.ok) { addToast?.(failureMessage(res, 'Could not save your layout'), 'error'); return false; }
      latest.current = { ...latest.current, layout: nextLayout };
      setLayout(nextLayout);
      applyMyDetails(nextTicks, nextBase);
      addToast?.('Dashboard layout saved');
      return true;
    } catch (err) {
      addToast?.(failureMessage(err, 'Could not save your layout'), 'error');
      return false;
    } finally {
      setSavingLayout(false);
    }
  }, [save, addToast, applyMyDetails]);

  // Reset Position: every show/hide + reorder override — and every My
  // Details tick, on every tab — back to the marketplace template's own
  // arrangement (its tab order, each tab showing the headers the template
  // picked for it). Saved straight away: a reset that only held until the
  // next reload unless Save Position was pressed after it read as "reset
  // doesn't work". The screen changes only once the save
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
    settingsLoaded,
    reconcile,
    myColumnsFor,
    onMyColumnsChange,
    layout,
    setTopSection,
    setTabSection,
    resetLayout,
    brands,
    addBrand,
    dropLegacySkuCosts,
    extractedData,
    onExtractedDataChange,
    saveArrangement,
    savingLayout,
  };
}
