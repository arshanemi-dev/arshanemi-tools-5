'use client';

import { useState } from 'react';
import { Check, CircleDot, Loader2 } from 'lucide-react';
import { useToast } from '@/components/admin/Toast';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import SearchSelect from '@/components/dashboard/SearchSelect';
import { failureMessage, validationMessage } from '@/lib/profitLoss/templatesApi';
import { versionName } from './useGlobalTemplateDraft';

// Which version of Global Settings is in the editor, and what saving does to
// it — the bar at the top of Global Settings plus the save buttons in the
// builder's footer. There is no Publish anywhere:
//  - the dropdown picks a saved version, or "New draft";
//  - with a saved version picked, the button is "Update v2.3" and saves over
//    that version. The live one is what the dashboard shows, so updating it
//    changes every seller's dashboard straight away;
//  - with "New draft" picked, the button is "Save New Version": a new draft,
//    which the dashboard doesn't show until it is switched Live on the
//    Version Page — the one place a version goes live or off.

const NEW_DRAFT = 'new'; // the dropdown's value for "New draft" (a saved version's is its id)

const isLive = (v, liveVersion) => !!v && (v.id === liveVersion?.id || v.status === 'live');

// The names the hub will give the next saved version — the next sub-version
// of the newest version number, or (major) the next version number. Only for
// what the buttons say on hover: the hub does the real numbering.
function nextNames(versions) {
  const top = versions.reduce((m, v) => Math.max(m, v.versionNumber), 0) || 1;
  const sub = versions.filter((v) => v.versionNumber === top).reduce((m, v) => Math.max(m, v.subVersionNumber), 0);
  return { next: `v${top}.${sub + 1}`, major: `v${top + 1}.1` };
}

// Saving, with every outcome said out loud. `save()` does what the footer's
// main button says: updates the picked version, or saves a new one for a New
// draft; `save({ major: true })` always starts a new version number.
export function useGlobalSave(draft) {
  const { addToast } = useToast();
  const save = async ({ major = false } = {}) => {
    if (!draft.valid) { addToast(validationMessage(draft.errors), 'error'); return; }
    let res;
    try {
      res = draft.activeVersionId && !major ? await draft.updateVersion() : await draft.saveNewVersion({ major });
    } catch (err) {
      addToast(failureMessage(err, 'Save failed'), 'error');
      return;
    }
    if (!res.ok) {
      addToast(failureMessage(res, 'Save failed'), 'error');
      if (res.details?.length) console.error('global config validation:', res.details);
      return;
    }
    const name = versionName(res.version);
    if (res.replaced) addToast(`${versionName(res.replaced)} no longer exists — saved as new version ${name} (a draft)`);
    else if (res.created) addToast(`Saved new version ${name} — a draft, switch it Live on the Version Page to show it on the dashboard`);
    else addToast(res.live ? `Updated ${name} — it is live, the dashboard shows it now` : `Updated ${name}`);
  };
  return { save, saving: draft.saving };
}

// The footer's save buttons for Global Settings.
export function GlobalSaveButtons({ draft, save }) {
  const { activeVersion, activeVersionId, liveVersion, versions = [], dirty, saving } = draft;
  const spinner = saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />;
  const primary = 'inline-flex items-center gap-1.5 rounded-full bg-action px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-action-hover disabled:opacity-50';

  if (activeVersionId) {
    const name = versionName(activeVersion);
    return (
      <button
        type="button"
        onClick={() => save.save()}
        disabled={saving || !dirty}
        title={!dirty
          ? `No changes to save to ${name}`
          : isLive(activeVersion, liveVersion)
            ? `Saves over ${name} — it is live, so the dashboard shows the change straight away`
            : `Saves over ${name}`}
        className={primary}
      >
        {spinner} Update {name}
      </button>
    );
  }

  const names = nextNames(versions);
  return (
    <>
      <button
        type="button"
        onClick={() => save.save({ major: true })}
        disabled={saving}
        title={`Saves a new draft that starts the next version number — ${names.major}`}
        className="rounded-full border border-divider px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-card-hover disabled:opacity-50"
      >
        New major version
      </button>
      <button
        type="button"
        onClick={() => save.save()}
        disabled={saving}
        title={`Saves what is in the editor as a new draft version — ${names.next}`}
        className={primary}
      >
        {spinner} Save New Version
      </button>
    </>
  );
}

// The bar at the top of Global Settings: the version dropdown, whether what
// is in the editor has changed since it was loaded or saved, which version
// the dashboard is on, and one line on what saving will do right now.
export function GlobalVersionBar({ draft, onOpenVersionPage }) {
  const { addToast } = useToast();
  const { versions = [], activeVersion, activeVersionId, baseVersion, liveVersion, dirty, loading, saving, selectVersion } = draft;
  const [pendingId, setPendingId] = useState(null); // a version picked while there are unsaved changes — awaiting the confirm
  const [switching, setSwitching] = useState(false);
  if (loading) return null;

  const statusOf = (v) => (isLive(v, liveVersion) ? 'live' : v.status);
  const options = [
    { value: NEW_DRAFT, label: 'New draft' },
    ...versions.map((v) => ({ value: v.id, label: `${versionName(v)} · ${statusOf(v)}` })),
  ];

  const open = async (versionId) => {
    setSwitching(true);
    try {
      const res = await selectVersion(versionId);
      if (!res.ok) addToast(failureMessage(res, 'Could not open that version'), 'error');
    } catch (err) {
      addToast(failureMessage(err, 'Could not open that version'), 'error');
    } finally {
      setSwitching(false);
      setPendingId(null);
    }
  };
  // "New draft" keeps what is in the editor, so there is nothing to lose;
  // a saved version replaces it.
  const pick = (value) => {
    if (value === NEW_DRAFT) { selectVersion(null); return; }
    if (dirty) setPendingId(value);
    else open(value);
  };
  const pending = versions.find((v) => v.id === pendingId) || null;

  const live = isLive(activeVersion, liveVersion);
  const name = versionName(activeVersion);
  const versionPage = (
    <button type="button" onClick={onOpenVersionPage} className="font-semibold text-action underline-offset-2 hover:underline">Version Page</button>
  );

  return (
    <div className={`rounded-xl border px-3.5 py-2.5 ${live ? 'border-accent/30 bg-accent/5' : 'border-divider bg-background'}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[12.5px] font-semibold text-foreground">Version</span>
        <SearchSelect
          value={activeVersionId || NEW_DRAFT}
          options={options}
          onChange={pick}
          disabled={switching || saving}
          ariaLabel="Version"
          searchPlaceholder="Search versions…"
          className="w-52"
        />
        {switching ? (
          <span className="inline-flex items-center gap-1 text-[12px] text-subtle"><Loader2 size={12} className="animate-spin" /> Opening…</span>
        ) : dirty ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11.5px] font-semibold text-accent">
            <CircleDot size={11} /> Changed — not saved
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-[11.5px] font-medium text-subtle">
            <Check size={11} /> No changes
          </span>
        )}
        <span className="ml-auto text-[12px] text-muted">
          On the dashboard: <span className="font-semibold text-foreground">{liveVersion ? versionName(liveVersion) : 'nothing yet'}</span>
        </span>
      </div>
      <p className="mt-1.5 text-[12px] text-muted">
        {!activeVersionId ? (
          <>
            A new version{baseVersion ? `, started from ${versionName(baseVersion)}` : ''}. <span className="font-semibold text-foreground">Save New Version</span> stores
            it as a draft — the dashboard doesn&rsquo;t show a draft until it is switched Live on the {versionPage}.
          </>
        ) : live ? (
          <>
            <span className="font-semibold text-foreground">{name} is what the dashboard shows</span> — Update changes it for every seller straight away.
            To try something first, pick New draft.
          </>
        ) : (
          <>
            {name} is {activeVersion?.status === 'archived' ? 'archived' : 'a draft'} — the dashboard doesn&rsquo;t show it. Update saves over it; switch it Live on
            the {versionPage} to show it.
          </>
        )}
      </p>

      <ConfirmDialog
        open={!!pending}
        title={`Open ${pending ? versionName(pending) : ''} and lose your changes?`}
        description={`What you changed${activeVersionId ? ` in ${name}` : ' in this new draft'} has not been saved, and opening ${pending ? versionName(pending) : 'another version'} replaces it. To keep it, cancel and save first.`}
        confirmLabel="Open it"
        loadingLabel="Opening…"
        loading={switching}
        onConfirm={() => open(pendingId)}
        onCancel={() => { if (!switching) setPendingId(null); }}
      />
    </div>
  );
}
