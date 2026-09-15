'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { makeEmptyGlobalConfig, validateGlobalConfig } from '@/data/templateSchema';
import {
  getGlobalTemplateMeta, getTemplate, getVersion,
  saveDraftVersion, updateDraftVersion, publishVersion,
} from '@/lib/profitLoss/templatesApi';

// Owns the singleton Global Settings draft — Headers, Title Cards, Graphs,
// Tabs, Overview Tabs — every marketplace's dashboard renders identically.
// This is the one thing in Template Settings that still versions (draft ->
// save version -> publish/live, with a Version Page + change log) — it's
// literally a marketplace_templates row under the hood (is_global = true,
// lazily created — see getGlobalTemplateMeta), so it reuses the exact same
// version/publish calls a marketplace draft used to. See useTemplateDraft.js
// for the marketplace counterpart, which dropped all of this in favor of a
// direct save ("always show, no hide").
const LS_KEY = 'mp-tpl-draft:global';

export default function useGlobalTemplateDraft() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [templateId, setTemplateId] = useState(null);
  const [template, setTemplate] = useState(null);
  const [versions, setVersions] = useState([]);
  const [activeVersionId, setActiveVersionId] = useState(null);
  const [editingDraft, setEditingDraft] = useState(false);
  const [config, setConfig] = useState(() => makeEmptyGlobalConfig());
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(makeEmptyGlobalConfig()));
  const [saving, setSaving] = useState(false);

  const reloadMeta = useCallback(async (id) => {
    const tid = id ?? templateId;
    if (!tid) return null;
    const { ok, data } = await getTemplate(tid);
    if (!ok || !data?.template) { setLoadError(true); return null; }
    setTemplate(data.template);
    setVersions(data.versions || []);
    return data;
  }, [templateId]);

  // Discover the singleton's id (lazily created hub-side on first touch),
  // then load whichever version is relevant — same "newest draft, else the
  // live one, else the newest" pick useTemplateDraft used to make.
  useEffect(() => {
    let alive = true;
    (async () => {
      const meta = await getGlobalTemplateMeta();
      if (!alive) return;
      if (!meta.ok || !meta.data?.template?.id) { setLoadError(true); setLoading(false); return; }
      const tid = meta.data.template.id;
      setTemplateId(tid);
      setTemplate(meta.data.template);

      const data = await reloadMeta(tid);
      if (!alive || !data) { setLoading(false); return; }
      const vs = data.versions || [];
      const newestDraft = vs.find((v) => v.status === 'draft');
      const target = newestDraft || vs.find((v) => v.id === data.template.liveVersionId) || vs[0];
      if (target) {
        const res = await getVersion(tid, target.id);
        if (alive && res.ok) {
          const cfg = res.data.version?.config && Object.keys(res.data.version.config).length
            ? res.data.version.config
            : makeEmptyGlobalConfig();
          setConfig(cfg);
          setSavedJson(JSON.stringify(cfg));
          setActiveVersionId(target.id);
          setEditingDraft(target.status === 'draft');
        }
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── local crash backup ─────────────────────────────────────────────────
  const lsTimer = useRef(null);
  useEffect(() => {
    clearTimeout(lsTimer.current);
    lsTimer.current = setTimeout(() => {
      try { localStorage.setItem(LS_KEY, JSON.stringify(config)); } catch { /* ignore */ }
    }, 600);
    return () => clearTimeout(lsTimer.current);
  }, [config]);

  const dirty = JSON.stringify(config) !== savedJson;
  const validation = useMemo(() => validateGlobalConfig(config), [config]);
  const headerIds = useMemo(() => new Set((config.headers || []).map((h) => h.id)), [config.headers]);

  // ── generic mutators (same shape useTemplateDraft's section editors expect) ─
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

  // ── save / publish ─────────────────────────────────────────────────────
  const saveDraft = useCallback(async ({ major = false, note = '' } = {}) => {
    if (!templateId) return { ok: false, error: 'Global Settings not loaded yet' };
    setSaving(true);
    try {
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
  }, [templateId, config, activeVersionId, editingDraft, reloadMeta]);

  const publish = useCallback(async (versionId, live = true) => {
    if (!templateId) return { ok: false, error: 'Global Settings not loaded yet' };
    const res = await publishVersion(templateId, versionId, { live });
    if (res.ok) await reloadMeta();
    return res;
  }, [templateId, reloadMeta]);

  return {
    loading, loadError, saving,
    template, versions, activeVersionId, editingDraft,
    config, dirty, errors: validation.errors, valid: validation.ok,
    headerIds,
    setConfig, patchConfig, addItem, patchItem, removeItem,
    saveDraft, publish, reloadMeta,
  };
}
