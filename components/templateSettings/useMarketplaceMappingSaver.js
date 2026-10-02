'use client';

import { useCallback, useRef, useState } from 'react';
import { makeEmptyMarketplaceConfig } from '@/data/templateSchema';
import { failureMessage, putTemplateConfig } from '@/lib/profitLoss/templatesApi';

// The global Header section's mapping edits (Mapped button, × on a mapped
// column). Marketplaces are direct-save ("always show, no hide"), so each
// edit saves that marketplace at once — optimistic in the builder's
// `templates` list, rolled back on failure. Saves to the same marketplace are
// chained so quick edits land in order. `update(mid, fn)` applies
// `fn(config) → nextConfig`; `saving` is true while any save is in flight.
export default function useMarketplaceMappingSaver(templates, setTemplates, addToast) {
  const [inFlight, setInFlight] = useState(0);
  const queueRef = useRef({});

  const update = useCallback((mid, fn) => {
    const t = (templates || []).find((x) => x.id === mid);
    if (!t) return Promise.resolve(false);
    const base = t.config && Object.keys(t.config).length ? t.config : makeEmptyMarketplaceConfig(t.marketplaceName);
    const next = fn(base);
    setTemplates((list) => (list || []).map((x) => (x.id === mid ? { ...x, config: next } : x)));
    setInFlight((n) => n + 1);
    const run = (queueRef.current[mid] || Promise.resolve()).then(async () => {
      const res = await putTemplateConfig(mid, next);
      if (!res.ok) {
        setTemplates((list) => (list || []).map((x) => (x.id === mid ? { ...x, config: base } : x)));
        addToast(failureMessage(res, `Could not save the mapping for ${t.marketplaceName}`), 'error');
      }
      return res.ok;
    });
    queueRef.current[mid] = run.catch(() => {});
    return run
      .catch((err) => {
        setTemplates((list) => (list || []).map((x) => (x.id === mid ? { ...x, config: base } : x)));
        addToast(failureMessage(err, `Could not save the mapping for ${t.marketplaceName}`), 'error');
        return false;
      })
      .finally(() => setInFlight((n) => n - 1));
  }, [templates, setTemplates, addToast]);

  return { saving: inFlight > 0, update };
}
