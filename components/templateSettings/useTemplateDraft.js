'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { makeEmptyMarketplaceConfig, validateMarketplaceConfig } from '@/data/templateSchema';
import { getTemplate, createTemplate, putTemplateConfig, patchTemplate } from '@/lib/profitLoss/templatesApi';

// Owns one MARKETPLACE's config draft — files + column mapping only
// (Headers/Title Cards/Graphs/Tabs/Overview Tabs live in the global config,
// see useGlobalTemplateDraft.js, the one thing that still versions).
// Marketplaces save directly and are active the instant they're saved —
// "always show, no hide": no draft/publish distinction, no Version Page.
// `templateId` null = create mode (first Save creates the template).
// `globalHeaderIds` (from the global draft) is what mappings validate
// against.
const LS_PREFIX = 'mp-tpl-draft:';

function initialConfig(templateId) {
  if (!templateId) {
    try {
      const raw = typeof window !== 'undefined' && localStorage.getItem(`${LS_PREFIX}new`);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
  }
  return makeEmptyMarketplaceConfig();
}

export default function useTemplateDraft(templateId, { globalHeaderIds } = {}) {
  const [loading, setLoading] = useState(!!templateId);
  const [loadError, setLoadError] = useState(false);
  const [template, setTemplate] = useState(null);
  const [config, setConfig] = useState(() => initialConfig(templateId));
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(makeEmptyMarketplaceConfig()));
  const [saving, setSaving] = useState(false);

  const lsKey = `${LS_PREFIX}${templateId || 'new'}`;

  // ── load existing ───────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    if (!templateId) return () => { alive = false; }; // create mode — config seeded from LS at init
    (async () => {
      const { ok, data } = await getTemplate(templateId);
      if (!alive) return;
      if (!ok || !data?.template) { setLoadError(true); setLoading(false); return; }
      setTemplate(data.template);
      const cfg = data.template.config && Object.keys(data.template.config).length
        ? data.template.config
        : makeEmptyMarketplaceConfig(data.template.marketplaceName);
      setConfig(cfg);
      setSavedJson(JSON.stringify(cfg));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [templateId]);

  // ── local crash backup ─────────────────────────────────────────────────
  const lsTimer = useRef(null);
  useEffect(() => {
    clearTimeout(lsTimer.current);
    lsTimer.current = setTimeout(() => {
      try { localStorage.setItem(lsKey, JSON.stringify(config)); } catch { /* ignore */ }
    }, 600);
    return () => clearTimeout(lsTimer.current);
  }, [config, lsKey]);

  const dirty = JSON.stringify(config) !== savedJson;
  const validation = useMemo(
    () => validateMarketplaceConfig(config, globalHeaderIds || new Set()),
    [config, globalHeaderIds],
  );

  // ── generic mutators ───────────────────────────────────────────────────
  const patchConfig = useCallback((patch) => {
    setConfig((c) => ({ ...c, ...(typeof patch === 'function' ? patch(c) : patch) }));
  }, []);
  const addItem = useCallback((key, item) => {
    setConfig((c) => ({ ...c, [key]: [...(c[key] || []), item] }));
  }, []);
  const patchItem = useCallback((key, id, patch) => {
    setConfig((c) => ({
      ...c,
      [key]: (c[key] || []).map((it) => (it.id === id ? { ...it, ...(typeof patch === 'function' ? patch(it) : patch) } : it)),
    }));
  }, []);
  const removeItem = useCallback((key, id) => {
    setConfig((c) => ({ ...c, [key]: (c[key] || []).filter((it) => it.id !== id) }));
  }, []);
  const updateMarketplace = useCallback((patch) => {
    setConfig((c) => ({ ...c, marketplace: { ...c.marketplace, ...patch } }));
  }, []);

  // ── save (direct — no versions) ─────────────────────────────────────────
  const save = useCallback(async () => {
    setSaving(true);
    try {
      if (!templateId) {
        const name = (config.marketplace?.name || '').trim() || 'Untitled Marketplace';
        const { ok, status, data } = await createTemplate({ marketplaceName: name, description: '', config });
        if (!ok) return { ok: false, status, error: data?.error, details: data?.details };
        try { localStorage.removeItem(lsKey); } catch { /* ignore */ }
        return { ok: true, created: true, templateId: data.template.id };
      }
      const { ok, status, data } = await putTemplateConfig(templateId, config);
      if (!ok) return { ok: false, status, error: data?.error, details: data?.details };
      setTemplate(data.template);
      setSavedJson(JSON.stringify(config));
      return { ok: true };
    } finally {
      setSaving(false);
    }
  }, [templateId, config, lsKey]);

  const savePatchTemplate = useCallback(async (patch) => {
    const res = await patchTemplate(templateId, patch);
    if (res.ok) setTemplate((t) => ({ ...t, ...res.data.template }));
    return res;
  }, [templateId]);

  return {
    loading, loadError, saving,
    template,
    config, dirty, errors: validation.errors, valid: validation.ok,
    setConfig, patchConfig, addItem, patchItem, removeItem,
    updateMarketplace,
    save, patchTemplate: savePatchTemplate,
  };
}
