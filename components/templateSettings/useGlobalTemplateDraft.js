'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { makeEmptyGlobalConfig, validateGlobalConfig } from '@/data/templateSchema';
import { withFixedHeaders } from '@/data/fixedHeaders';
import {
  getGlobalTemplateMeta, getTemplate, getVersion,
  saveDraftVersion, updateDraftVersion, publishVersion, deleteVersion,
} from '@/lib/profitLoss/templatesApi';

// Owns the singleton Global Settings draft — Headers, Title Cards, Graphs,
// Tabs, Overview Tabs — every marketplace's dashboard renders identically.
// This is the one thing in Template Settings that still versions — it's
// literally a marketplace_templates row under the hood (is_global = true,
// lazily created — see getGlobalTemplateMeta), so it reuses the exact same
// version calls a marketplace draft used to. See useTemplateDraft.js for the
// marketplace counterpart, which dropped all of this in favor of a direct
// save ("always show, no hide").
//
// What is in the editor always belongs to one of two things, picked from
// the version dropdown at the top of Global Settings (GlobalVersion.jsx):
//  - a saved version (`activeVersionId`) — saving UPDATES that version in
//    place, whatever its status. When it is the live one, that is what the
//    dashboard shows from then on: there is no publish step.
//  - "New draft" (`activeVersionId` null) — saving creates a NEW version, a
//    draft the dashboard doesn't show until it is switched Live on the
//    Version Page (`publish`, the only place a version goes live or off).
const LS_KEY = 'mp-tpl-draft:global';

export const versionName = (v) => (v ? `v${v.versionNumber}.${v.subVersionNumber}` : '');

// Which version the editor opens: the newest draft, else the live one, else
// the newest of what's there (`versions` comes newest-first from the hub).
// Shared by the first load and by removeVersion, exported so the Version
// Page can tell the user where the editor will land.
export function versionToOpen(versions = [], template = null) {
  return versions.find((v) => v.status === 'draft') || versions.find((v) => v.id === template?.liveVersionId) || versions[0] || null;
}

// What a stored version's config looks like in the editor. withFixedHeaders:
// a version saved before Account Name / the SKU Cost headers were built in
// opens with them locked in place — as the loaded state, not as an unsaved
// change (the dashboard reads them the same way, saved yet or not).
const editorConfig = (stored) => withFixedHeaders(stored && Object.keys(stored).length ? stored : makeEmptyGlobalConfig());

export default function useGlobalTemplateDraft() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [templateId, setTemplateId] = useState(null);
  const [template, setTemplate] = useState(null);
  const [versions, setVersions] = useState([]);
  const [activeVersionId, setActiveVersionId] = useState(null); // null = "New draft"
  const [baseVersionId, setBaseVersionId] = useState(null); // New draft only: the version its content started from
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
          const cfg = editorConfig(res.data.version?.config);
          setConfig(cfg);
          setSavedJson(JSON.stringify(cfg));
          setActiveVersionId(target.id);
        }
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The version dropdown. A saved version's id loads that version into the
  // editor, replacing what is there (the caller asks first when there are
  // unsaved changes). null = "New draft": the editor keeps what it has — a
  // new version always starts from something — and only what saving does
  // changes. Resolves { ok } (false: that version could not be loaded, and
  // nothing changed).
  const selectVersion = useCallback(async (versionId) => {
    if (!versionId) {
      setBaseVersionId((base) => activeVersionId ?? base);
      setActiveVersionId(null);
      return { ok: true };
    }
    const res = await getVersion(templateId, versionId);
    if (!res.ok) {
      if (res.status === 404) await reloadMeta(); // deleted elsewhere — show what is really there
      return res;
    }
    const cfg = editorConfig(res.data.version?.config);
    setConfig(cfg);
    setSavedJson(JSON.stringify(cfg));
    setActiveVersionId(versionId);
    setBaseVersionId(null);
    return res;
  }, [templateId, activeVersionId, reloadMeta]);

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

  // ── save ───────────────────────────────────────────────────────────────
  const failed = (res) => ({ ok: false, status: res.status, error: res.data?.error, details: res.data?.details });

  // What is in the editor as a NEW version — a draft, which becomes the
  // selected version. `major` starts the next version number (v3.1) instead
  // of the next sub-version (v2.5). → { ok, created: true, version }
  const saveNewVersion = useCallback(async ({ major = false, note = '' } = {}) => {
    if (!templateId) return { ok: false, error: 'Global Settings not loaded yet' };
    setSaving(true);
    try {
      const res = await saveDraftVersion(templateId, { config, note, major });
      if (!res.ok) return failed(res);
      const v = res.data.version;
      setActiveVersionId(v.id);
      setBaseVersionId(null);
      setSavedJson(JSON.stringify(config));
      await reloadMeta();
      return { ok: true, created: true, version: v };
    } finally {
      setSaving(false);
    }
  }, [templateId, config, reloadMeta]);

  // What is in the editor over the selected version itself. A version that
  // was deleted elsewhere since it was loaded (404) has nothing left to
  // update — the work is saved as a new version instead of being refused,
  // and the result says so (`replaced` = the version that is gone).
  // → { ok, version, live } — `live`: it is the dashboard's version.
  const updateVersion = useCallback(async () => {
    if (!templateId) return { ok: false, error: 'Global Settings not loaded yet' };
    if (!activeVersionId) return saveNewVersion();
    const gone = versions.find((v) => v.id === activeVersionId) || null;
    setSaving(true);
    try {
      const res = await updateDraftVersion(templateId, activeVersionId, { config });
      if (res.status === 404) {
        const saved = await saveNewVersion();
        return saved.ok ? { ...saved, replaced: gone } : saved;
      }
      if (!res.ok) return failed(res);
      setSavedJson(JSON.stringify(config));
      const data = await reloadMeta();
      const v = res.data.version;
      return { ok: true, version: v, live: v.status === 'live' || data?.template?.liveVersionId === v.id };
    } finally {
      setSaving(false);
    }
  }, [templateId, config, activeVersionId, versions, saveNewVersion, reloadMeta]);

  // The Version Page's Live switch — the one place a version goes onto the
  // dashboard (`live`) or off it.
  const publish = useCallback(async (versionId, live = true) => {
    if (!templateId) return { ok: false, error: 'Global Settings not loaded yet' };
    const res = await publishVersion(templateId, versionId, { live });
    if (res.ok) await reloadMeta();
    return res;
  }, [templateId, reloadMeta]);

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
      // save would then store as if it were real work.
      if (!loaded.ok) { setLoadError(true); return res; }
      cfg = editorConfig(loaded.data.version?.config);
    }
    setConfig(cfg);
    setSavedJson(JSON.stringify(cfg));
    setActiveVersionId(target?.id ?? null); // nothing left = a New draft, empty
    setBaseVersionId(null);
    return res;
  }, [templateId, activeVersionId, reloadMeta]);

  // What the dashboard shows (the live version) vs. what's in the editor —
  // the dashboard ONLY ever reads the live version, so any other saved
  // version is invisible there until it is switched Live.
  const liveVersion = versions.find((v) => v.id === template?.liveVersionId) || versions.find((v) => v.status === 'live') || null;
  const activeVersion = versions.find((v) => v.id === activeVersionId) || null;
  const baseVersion = versions.find((v) => v.id === baseVersionId) || null;

  return {
    loading, loadError, saving,
    template, versions, activeVersionId,
    config, dirty, errors: validation.errors, valid: validation.ok,
    headerIds,
    setConfig, patchConfig, addItem, patchItem, removeItem,
    liveVersion, activeVersion, baseVersion,
    selectVersion, saveNewVersion, updateVersion, publish, removeVersion, reloadMeta,
  };
}
