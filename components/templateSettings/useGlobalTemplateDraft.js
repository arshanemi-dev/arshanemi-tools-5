'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { makeEmptyGlobalConfig, validateGlobalConfig } from '@/data/templateSchema';
import { withFixedHeaders } from '@/data/fixedHeaders';
import {
  getGlobalTemplateMeta, getTemplate, getVersion,
  saveDraftVersion, publishVersion, deleteVersion,
  listTemplates, listHeaderGroups,
} from '@/lib/profitLoss/templatesApi';
import { withVersionGroups } from '@/lib/profitLoss/headerGroups';
import { withVersionMarketplaces } from '@/lib/profitLoss/versionMarketplaces';

// Owns the singleton Global Settings draft — and with it EVERYTHING
// Template Settings edits, all of it versioned together: Headers (each with
// its group and Show / Hide flag — lib/profitLoss/headerGroups.js), the
// header groups, Title Cards, Graphs, Tabs, Overview Tabs, and every
// marketplace with its files, sheet settings and column mappings
// (lib/profitLoss/versionMarketplaces.js). Nothing in Template Settings saves
// on its own any more: Save New Version stores it all, and switching a
// version Live puts exactly that version's setup on the dashboard. Under the
// hood it's a marketplace_templates row (is_global = true, lazily created —
// see getGlobalTemplateMeta) with its versions in marketplace_template_details.
//
// A version saved before marketplaces and groups were versioned has neither:
// it opens with the marketplace rows and the header group tables as they
// were (read once, at load — `legacy`), shown as an unsaved change, so the
// next Save New Version keeps them in the version.
//
// The version dropdown at the top of Global Settings (GlobalVersion.jsx)
// picks which saved version is loaded into the editor (`activeVersionId`;
// null = nothing saved open). Saving ALWAYS creates a NEW version from what
// is in the editor — a draft the dashboard doesn't show until it is switched
// Live on the Version Page (`publish`, the only place a version goes live or
// off). A saved version is never overwritten, the live one included.
const LS_KEY = 'mp-tpl-draft:global';

// "v94" — every save is the next whole number — or "v93.21" for a version
// saved back when versions had a sub-version too (the hub's
// marketplaceVersionLabel is the same rule).
export const versionName = (v) => (v ? `v${v.versionNumber}${v.subVersionNumber > 1 ? `.${v.subVersionNumber}` : ''}` : '');

// Which version the editor opens: the newest one saved, live or not
// (`versions` comes newest-first from the hub). Every save is a new
// version, so that is always the last thing anyone saved. It used to be
// "the newest draft" — but a version switched Live stops being a draft, so
// the editor kept reopening an older draft and the next save dropped
// everything added since (v93.39 was v93.31 + one header; v93.38's three
// headers were gone). Shared by the first load and by removeVersion,
// exported so the Version Page can tell the user where the editor will land.
export function versionToOpen(versions = []) {
  return versions[0] || null;
}

// What a stored version's config looks like in the editor → { cfg, saved
// (the JSON `dirty` compares against) }, or null when it can't be shown
// whole. withFixedHeaders: a version saved before Account Name / the SKU
// Cost headers were built in opens with them locked in place — as the
// loaded state, not as an unsaved change (the dashboard reads them the same
// way). A version with no marketplaces / groups of its own gets `legacy`'s
// (see above) — as an unsaved change; with the marketplace rows unreadable
// it can't be opened at all (null), or a save would store no marketplaces.
function editorConfig(stored, legacy) {
  const base = withFixedHeaders(stored && Object.keys(stored).length ? stored : makeEmptyGlobalConfig());
  if (!Array.isArray(base.marketplaces) && !legacy?.rows) return null;
  const cfg = withVersionGroups(withVersionMarketplaces(base, legacy?.rows || []), legacy?.groups || null);
  return { cfg, saved: JSON.stringify(base) };
}

// A save the hub turned down, in the shape the builder's toasts read.
const failed = (res) => ({ ok: false, status: res.status, error: res.data?.error, details: res.data?.details });

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
  const legacy = useRef({ rows: null, groups: null }); // the marketplace rows + header group tables, read once at load
  // Open a stored version's config in the editor → false when it can't be.
  const openConfig = useCallback((stored) => {
    const opened = editorConfig(stored, legacy.current);
    if (!opened) return false;
    setConfig(opened.cfg);
    setSavedJson(opened.saved);
    return true;
  }, []);

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
  // then load the newest saved version (versionToOpen).
  useEffect(() => {
    let alive = true;
    (async () => {
      const [meta, rows, groups] = await Promise.all([getGlobalTemplateMeta(), listTemplates({ scopeAll: true }), listHeaderGroups()]);
      if (!alive) return;
      legacy.current = { rows: rows.ok ? rows.data?.templates || [] : null, groups: groups.ok ? groups.data : null };
      if (!meta.ok || !meta.data?.template?.id) { setLoadError(true); setLoading(false); return; }
      const tid = meta.data.template.id;
      setTemplateId(tid);
      setTemplate(meta.data.template);

      const data = await reloadMeta(tid);
      if (!alive || !data) { setLoading(false); return; }
      const target = versionToOpen(data.versions || []);
      if (target) {
        const res = await getVersion(tid, target.id);
        if (alive && res.ok) {
          if (openConfig(res.data.version?.config)) setActiveVersionId(target.id);
          else setLoadError(true);
        }
      } else if (alive && !openConfig(null)) {
        setLoadError(true);
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
    if (!openConfig(res.data.version?.config)) return { ok: false, error: 'The marketplaces could not be loaded — reload the page' };
    setActiveVersionId(versionId);
    setBaseVersionId(null);
    return res;
  }, [templateId, activeVersionId, reloadMeta, openConfig]);

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

  // ── generic mutators (the shape every section editor expects) ─────────────
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
  // What is in the editor as a NEW version — a draft, numbered by the hub
  // as the next whole number (v94, v95, …), which becomes the selected
  // version. → { ok, created: true, version }
  const saveNewVersion = useCallback(async ({ note = '' } = {}) => {
    if (!templateId) return { ok: false, error: 'Global Settings not loaded yet' };
    setSaving(true);
    try {
      const res = await saveDraftVersion(templateId, { config, note });
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

    const target = versionToOpen(data?.versions || []);
    let stored = null;
    if (target) {
      const loaded = await getVersion(templateId, target.id);
      // Deleted fine, but its replacement didn't load — say so (the builder's
      // "reload the page" state) rather than leave a blank editor that a
      // save would then store as if it were real work.
      if (!loaded.ok) { setLoadError(true); return res; }
      stored = loaded.data.version?.config;
    }
    if (!openConfig(stored)) { setLoadError(true); return res; }
    setActiveVersionId(target?.id ?? null); // nothing left = a New draft, empty
    setBaseVersionId(null);
    return res;
  }, [templateId, activeVersionId, reloadMeta, openConfig]);

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
    selectVersion, saveNewVersion, publish, removeVersion, reloadMeta,
  };
}
