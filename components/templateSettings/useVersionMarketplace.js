'use client';

import { useCallback, useMemo } from 'react';
import { makeEmptyMarketplaceConfig } from '@/data/templateSchema';
import { marketplaceConfigOf, withMarketplaceConfig } from '@/lib/profitLoss/versionMarketplaces';

// One marketplace of the Global Settings draft (`draft` =
// useGlobalTemplateDraft), in the shape the Market Place section has always
// edited a marketplace in — { template, config: { marketplace, fileSlots },
// setConfig, patchItem, … }. Every marketplace lives IN the version now
// (lib/profitLoss/versionMarketplaces.js), so an edit here is an edit of the
// draft: Save New Version is what keeps it, and the dashboard shows the live
// version's files and mappings. `marketplaceId` null / not in the version →
// `template` null and an empty marketplace that edits nothing.
export default function useVersionMarketplace(draft, marketplaceId) {
  const { config: globalConfig, setConfig: setGlobal } = draft;
  const entry = useMemo(() => (globalConfig.marketplaces || []).find((m) => m.id === marketplaceId) || null, [globalConfig.marketplaces, marketplaceId]);
  const config = useMemo(() => (entry ? marketplaceConfigOf(entry) : makeEmptyMarketplaceConfig()), [entry]);

  const setConfig = useCallback((next) => {
    if (!marketplaceId) return;
    setGlobal((c) => withMarketplaceConfig(c, marketplaceId, (mc) => (typeof next === 'function' ? next(mc) : next)));
  }, [marketplaceId, setGlobal]);
  const patchConfig = useCallback((patch) => setConfig((c) => ({ ...c, ...(typeof patch === 'function' ? patch(c) : patch) })), [setConfig]);
  const addItem = useCallback((key, item) => setConfig((c) => ({ ...c, [key]: [...(c[key] || []), item] })), [setConfig]);
  const patchItem = useCallback((key, id, patch) => setConfig((c) => ({
    ...c,
    [key]: (c[key] || []).map((it) => (it.id === id ? { ...it, ...(typeof patch === 'function' ? patch(it) : patch) } : it)),
  })), [setConfig]);
  const removeItem = useCallback((key, id) => setConfig((c) => ({ ...c, [key]: (c[key] || []).filter((it) => it.id !== id) })), [setConfig]);
  const updateMarketplace = useCallback((patch) => setConfig((c) => ({ ...c, marketplace: { ...c.marketplace, ...patch } })), [setConfig]);

  return {
    loading: draft.loading, loadError: draft.loadError,
    template: entry ? { id: entry.id, marketplaceName: entry.name, templateNumber: entry.templateNumber || '' } : null,
    config, dirty: draft.dirty, errors: draft.errors, valid: draft.valid,
    setConfig, patchConfig, addItem, patchItem, removeItem, updateMarketplace,
  };
}
