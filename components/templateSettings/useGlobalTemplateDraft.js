'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { makeEmptyGlobalConfig, validateGlobalConfig } from '@/data/templateSchema';
import {
  getGlobalTemplateMeta, getTemplate, getVersion,
  saveDraftVersion, updateDraftVersion, publishVersion, deleteVersion,
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

// Which version the editor opens: the newest draft, else the live one, else
// the newest of what's there (`versions` comes newest-first from the hub).
// Shared by the first load and by removeVersion, exported so the Version
// Page can tell the user where the editor will land.
export function versionToOpen(versions = [], template = null) {
  return versions.find((v) => v.status === 'draft') || versions.find((v) => v.id === template?.liveVersionId) || versions[0] || null;
}

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
      const target = versionToOpen(data.versions || [], data.template);
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
        // Published elsewhere since it was loaded (another tab, the Version
        // Page) — a live version can't be edited — or deleted elsewhere
        // (404): either way the work is saved as a new draft instead.
        if (res.status === 409 || res.status === 404) res = await saveDraftVersion(templateId, { config, note, major });
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

  // After a publish/unpublish, `editingDraft` follows the edited version's
  // real status — otherwise publishing the version being edited left the
  // next Save Draft trying to overwrite a live version (hub 409).
  const publish = useCallback(async (versionId, live = true) => {
    if (!templateId) return { ok: false, error: 'Global Settings not loaded yet' };
    const res = await publishVersion(templateId, versionId, { live });
    if (res.ok) {
      const data = await reloadMeta();
      const edited = (data?.versions || []).find((v) => v.id === activeVersionId);
      if (edited) setEditingDraft(edited.status === 'draft');
    }
    return res;
  }, [templateId, reloadMeta, activeVersionId]);

  // Delete one saved version. The hub refuses the live one (409) — and a
  // version someone else already deleted is a 404 — so on either the list is
  // re-read to show what's really there. When the deleted version is the one
  // open in the editor, the editor moves to whatever the first load would
  // have picked from what's left (versionToOpen), or back to an empty config
  // when nothing is: what was on screen belonged to a version that no longer
  // exists.
  const removeVersion = useCallback(async (versionId) => {
    if (!templateId) return { ok: false, error: 'Global Settings not loaded yet' };
    const res = await deleteVersion(templateId, versionId);
    if (!res.ok) {
      if (res.status === 404 || res.status === 409) await reloadMeta();
      return res;
    }
    const data = await reloadMeta();
    if (versionId !== activeVersionId) return res;

    const target = versionToOpen(data?.versions || [], data?.template);
    let cfg = makeEmptyGlobalConfig();
    if (target) {
      const loaded = await getVersion(templateId, target.id);
      // Deleted fine, but its replacement didn't load — say so (the builder's
      // "reload the page" state) rather than leave a blank editor that a
      // Save Draft would then store as if it were real work.
      if (!loaded.ok) { setLoadError(true); return res; }
      if (loaded.data.version?.config && Object.keys(loaded.data.version.config).length) cfg = loaded.data.version.config;
    }
    setConfig(cfg);
    setSavedJson(JSON.stringify(cfg));
    setActiveVersionId(target?.id ?? null);
    setEditingDraft(target?.status === 'draft');
    return res;
  }, [templateId, activeVersionId, reloadMeta]);

  // What the dashboard shows (the live version) vs. what's being edited —
  // the dashboard ONLY ever reads the live version, so a saved draft is
  // invisible there until published.
  const liveVersion = versions.find((v) => v.id === template?.liveVersionId) || versions.find((v) => v.status === 'live') || null;
  const activeVersion = versions.find((v) => v.id === activeVersionId) || null;
  const onDashboard = !dirty && !!activeVersion && activeVersion.id === liveVersion?.id;

  // One click to get the builder's current state onto the dashboard: save
  // (only if there's something unsaved) then publish that version.
  const saveAndPublish = useCallback(async () => {
    let versionId = activeVersionId;
    if (dirty || !versionId) {
      const saved = await saveDraft();
      if (!saved.ok) return saved;
      versionId = saved.version.id;
    }
    const res = await publishVersion(templateId, versionId, { live: true });
    if (!res.ok) return { ok: false, status: res.status, error: res.data?.error || 'Publish failed' };
    await reloadMeta();
    setEditingDraft(false);
    return { ok: true, versionId };
  }, [templateId, activeVersionId, dirty, saveDraft, reloadMeta]);

  return {
    loading, loadError, saving,
    template, versions, activeVersionId, editingDraft,
    config, dirty, errors: validation.errors, valid: validation.ok,
    headerIds,
    setConfig, patchConfig, addItem, patchItem, removeItem,
    liveVersion, activeVersion, onDashboard,
    saveDraft, publish, saveAndPublish, removeVersion, reloadMeta,
  };
}
