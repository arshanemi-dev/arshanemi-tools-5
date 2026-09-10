'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { makeEmptyConfig, validateConfig } from '@/data/templateSchema';
import {
  getTemplate, getVersion, createTemplate, saveDraftVersion, updateDraftVersion,
  publishVersion, patchTemplate,
} from '@/lib/profitLoss/templatesApi';

// Owns the whole builder `config` draft + the save / publish flow. `templateId`
// null = create mode (first Save creates the template). Generic array mutators
// (`add`/`patch`/`remove`) keep the 8 section editors from each needing their
// own copy.
const LS_PREFIX = 'mp-tpl-draft:';

function initialConfig(templateId) {
  if (!templateId) {
    try {
      const raw = typeof window !== 'undefined' && localStorage.getItem(`${LS_PREFIX}new`);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
  }
  return makeEmptyConfig();
}

export default function useTemplateDraft(templateId) {
  const [loading, setLoading] = useState(!!templateId);
  const [loadError, setLoadError] = useState(false);
  const [template, setTemplate] = useState(null);
  const [versions, setVersions] = useState([]);
  const [activeVersionId, setActiveVersionId] = useState(null);
  const [editingDraft, setEditingDraft] = useState(false);
  const [config, setConfig] = useState(() => initialConfig(templateId));
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(makeEmptyConfig()));
  const [saving, setSaving] = useState(false);

  const lsKey = `${LS_PREFIX}${templateId || 'new'}`;

  // ── load existing ───────────────────────────────────────────────────────
  const reloadMeta = useCallback(async () => {
    if (!templateId) return null;
    const { ok, data } = await getTemplate(templateId);
    if (!ok || !data?.template) { setLoadError(true); return null; }
    setTemplate(data.template);
    setVersions(data.versions || []);
    return data;
  }, [templateId]);

  useEffect(() => {
    let alive = true;
    if (!templateId) return () => { alive = false; }; // create mode — config seeded from LS at init
    (async () => {
      const data = await reloadMeta();
      if (!alive || !data) { setLoading(false); return; }
      const vs = data.versions || [];
      const newestDraft = vs.find((v) => v.status === 'draft');
      const target = newestDraft || vs.find((v) => v.id === data.template.liveVersionId) || vs[0];
      if (target) {
        const res = await getVersion(templateId, target.id);
        if (alive && res.ok) {
          const cfg = res.data.version?.config && Object.keys(res.data.version.config).length
            ? res.data.version.config
            : makeEmptyConfig(data.template.marketplaceName);
          setConfig(cfg);
          setSavedJson(JSON.stringify(cfg));
          setActiveVersionId(target.id);
          setEditingDraft(target.status === 'draft');
        }
      } else {
        const cfg = makeEmptyConfig(data.template.marketplaceName);
        setConfig(cfg);
        setSavedJson(JSON.stringify(cfg));
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [templateId, reloadMeta, lsKey]);

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
  const validation = useMemo(() => validateConfig(config), [config]);

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
  const updateOverview = useCallback((patch) => {
    setConfig((c) => ({ ...c, overviewTab: { ...c.overviewTab, ...patch } }));
  }, []);
  const setTabVisible = useCallback((tabId, visible) => {
    setConfig((c) => ({ ...c, visibility: { ...c.visibility, tabs: { ...(c.visibility?.tabs || {}), [tabId]: visible } } }));
  }, []);
  const setMarketplaceVisible = useCallback((visible) => {
    setConfig((c) => ({ ...c, visibility: { ...c.visibility, marketplaceInSidebar: visible } }));
  }, []);

  // ── save / publish ─────────────────────────────────────────────────────
  const saveDraft = useCallback(async ({ major = false, note = '' } = {}) => {
    setSaving(true);
    try {
      if (!templateId) {
        const name = (config.marketplace?.name || '').trim() || 'Untitled Marketplace';
        const { ok, status, data } = await createTemplate({ marketplaceName: name, description: '', config });
        if (!ok) return { ok: false, status, error: data?.error, details: data?.details };
        try { localStorage.removeItem(lsKey); } catch { /* ignore */ }
        return { ok: true, created: true, templateId: data.template.id };
      }
      let res;
      if (activeVersionId && editingDraft && !major) {
        res = await updateDraftVersion(templateId, activeVersionId, { config, note });
      } else {
        res = await saveDraftVersion(templateId, { config, note, major });
      }
      if (!res.ok) return { ok: false, status: res.status, error: res.data?.error, details: res.data?.details };
      const v = res.data.version;
      setActiveVersionId(v.id);
      setEditingDraft(true);
      setSavedJson(JSON.stringify(config));
      await reloadMeta();
      return { ok: true, version: v };
    } finally {
      setSaving(false);
    }
  }, [templateId, config, activeVersionId, editingDraft, reloadMeta, lsKey]);

  const publish = useCallback(async (versionId, live = true) => {
    const res = await publishVersion(templateId, versionId, { live });
    if (res.ok) await reloadMeta();
    return res;
  }, [templateId, reloadMeta]);

  const savePatchTemplate = useCallback(async (patch) => {
    const res = await patchTemplate(templateId, patch);
    if (res.ok) setTemplate((t) => ({ ...t, ...res.data.template }));
    return res;
  }, [templateId]);

  return {
    loading, loadError, saving,
    template, versions, activeVersionId, editingDraft,
    config, dirty, errors: validation.errors, valid: validation.ok,
    setConfig, patchConfig, addItem, patchItem, removeItem,
    updateMarketplace, updateOverview, setTabVisible, setMarketplaceVisible,
    saveDraft, publish, patchTemplate: savePatchTemplate, reloadMeta,
  };
}
