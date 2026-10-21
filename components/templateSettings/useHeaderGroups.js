'use client';

import { useCallback, useMemo } from 'react';
import { newId } from '@/data/templateSchema';
import {
  GENERAL_GROUP_ID, groupIdOf, headerGroupsOf, hiddenHeaderIds,
  withGroupAdded, withGroupRemoved, withGroupRenamed, withHeadersHidden, withHeadersInGroup,
} from '@/lib/profitLoss/headerGroups';

// The header groups and each header's Show / Hide switch, as Template
// Settings edits them — inside the Global Settings draft (`draft` =
// useGlobalTemplateDraft), like everything else there: a change is an
// unsaved edit until Save New Version keeps it in a version, and the
// dashboard shows the live version's (lib/profitLoss/headerGroups.js).
//
// → { loading, error, groups, headerGroups, groupOf(headerId) → group,
//     hiddenIds, isHidden(headerId), create(name), rename(id, name),
//     remove(id), assign(headerIds, groupId), setHidden(headerIds, isHidden) }.
// The calls resolve true (nothing here can fail — it's the draft).
const LATER = ' — Save New Version to keep it';

export default function useHeaderGroups(draft, addToast) {
  const { config, setConfig } = draft;
  const headerGroups = useMemo(() => headerGroupsOf(config) || { groups: [], members: {}, hiddenHeaderIds: [] }, [config]);
  const hiddenIds = useMemo(() => hiddenHeaderIds(headerGroups), [headerGroups]);

  const create = useCallback(async (name) => {
    setConfig((c) => withGroupAdded(c, { id: newId('grp'), name }));
    addToast?.(`Group “${name}” created${LATER}`);
    return true;
  }, [setConfig, addToast]);

  const rename = useCallback(async (id, name) => {
    setConfig((c) => withGroupRenamed(c, id, name));
    addToast?.(`Group renamed to “${name}”${LATER}`);
    return true;
  }, [setConfig, addToast]);

  const remove = useCallback(async (id) => {
    const group = headerGroups.groups.find((g) => g.id === id);
    const moved = (config.headers || []).filter((h) => h.groupId === id).length;
    setConfig((c) => withGroupRemoved(c, id));
    addToast?.(`Group “${group?.name || 'group'}” deleted${moved ? ` — ${moved} header${moved === 1 ? '' : 's'} back to General` : ''}${LATER}`);
    return true;
  }, [headerGroups.groups, config.headers, setConfig, addToast]);

  const assign = useCallback(async (headerIds, groupId) => {
    if (headerIds?.length) setConfig((c) => withHeadersInGroup(c, headerIds, groupId));
    return true;
  }, [setConfig]);

  const setHidden = useCallback(async (headerIds, isHidden) => {
    if (headerIds?.length) setConfig((c) => withHeadersHidden(c, headerIds, isHidden));
    return true;
  }, [setConfig]);

  const groupOf = useCallback((headerId) => {
    const id = groupIdOf(headerGroups, headerId);
    return headerGroups.groups.find((g) => g.id === id) || headerGroups.groups.find((g) => g.id === GENERAL_GROUP_ID) || null;
  }, [headerGroups]);
  const isHidden = useCallback((headerId) => hiddenIds.has(headerId), [hiddenIds]);

  return {
    loading: false, error: null, groups: headerGroups.groups, headerGroups,
    groupOf, hiddenIds, isHidden, create, rename, remove, assign, setHidden,
  };
}
