'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { withFixedHeaders } from '@/data/fixedHeaders';
import { failureMessage, listLiveTemplates } from './templatesApi';

// The dashboard's templates — Global Settings (Headers / Title Cards / Graphs
// / Tabs / Overview Tabs, shared by every marketplace) plus each
// marketplace's own files + mappings. There is no built-in fallback config:
// with nothing published `templates` is empty and the dashboard shows "No
// marketplaces yet".
//
// A returning visitor's dashboard is drawn straight away from the copy their
// last visit saved in this browser, while the server is asked — in the
// background — whether that copy is still the current one. Usually it is (an
// empty 304, nothing changes on screen); when it isn't, the new templates
// replace it. A first visit just loads them.
const STORE_KEY = 'pl-live-templates';
const NO_TEMPLATES = [];
const noSubscribe = () => () => {};

// What the last visit saved — { etag, data } — or null. Read once per page
// load: useSyncExternalStore needs the same object back every time, and this
// visit's own answer from the server is held in state instead.
let lastVisit;
function readLastVisit() {
  if (lastVisit === undefined) {
    lastVisit = null;
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved?.etag && saved.data) lastVisit = saved;
    } catch { /* nothing saved, or storage is blocked */ }
  }
  return lastVisit;
}

function saveForNextVisit(entry) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(entry)); } catch { /* full or blocked — the next visit just loads them */ }
}

// → templates / globalConfig, and:
//   templatesReady    there is something to draw (or the load has finished with nothing)
//   templatesChecked  the server has answered this visit — until then what's
//                     on screen may be the last visit's copy
//   templatesError    the load failed and there is no saved copy to show instead
export function useLiveTemplates({ addToast } = {}) {
  const saved = useSyncExternalStore(noSubscribe, readLastVisit, () => null);
  const [loaded, setLoaded] = useState(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState(null);
  const live = loaded || saved;

  // State is only set inside the promise callbacks (never synchronously) —
  // the first load runs from the mount effect with the initial "not checked,
  // no error" state already in place; retryTemplates resets that state itself.
  const load = useCallback(() => {
    // A failed load is its own state — never "zero marketplaces". With a
    // saved copy on screen it isn't a dead end either: say so and carry on.
    const failed = (res) => {
      const message = failureMessage(res, 'Could not load the marketplaces');
      if (readLastVisit()) addToast?.(`${message} — showing the layout from your last visit`, 'error');
      else setError(message);
    };
    return listLiveTemplates({ etag: readLastVisit()?.etag })
      .then((res) => {
        if (res.status === 304) return; // the saved copy is still the current one
        if (!res.ok) { failed(res); return; }
        const entry = { etag: res.etag, data: res.data };
        if (entry.etag) saveForNextVisit(entry);
        setLoaded(entry);
      })
      .catch(failed)
      .finally(() => setChecked(true));
  }, [addToast]);

  useEffect(() => { load(); }, [load]);
  const retryTemplates = () => {
    setChecked(false);
    setError(null);
    load();
  };

  const templates = useMemo(
    () => (Array.isArray(live?.data?.templates) ? live.data.templates : NO_TEMPLATES),
    [live],
  );
  // The built-in Account Name + SKU Cost headers are recognised on the way in
  // (withFixedHeaders), so a version published before they existed fills
  // them the same as one saved since.
  const globalConfig = useMemo(() => (live ? withFixedHeaders(live.data?.global || {}) : null), [live]);

  return {
    templates,
    globalConfig,
    templatesReady: !!live || checked,
    templatesChecked: checked,
    templatesError: error,
    retryTemplates,
  };
}
