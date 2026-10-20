'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  assignHeaderGroup, createHeaderGroup, deleteHeaderGroup, failureMessage, listHeaderGroups, renameHeaderGroup, setHeadersHidden,
} from '@/lib/profitLoss/templatesApi';
import { GENERAL_GROUP_ID, groupIdOf, hiddenHeaderIds } from '@/lib/profitLoss/headerGroups';

// Template Settings' copy of the header groups and each header's Show /
// Hide switch (lib/profitLoss/headerGroups.js). Every change saves straight
// to the hub: neither is part of a Global Settings version, so it shows on
// the dashboard at once, with no Save New Version. A move or a switch shows
// at once; if the hub refuses it, what the hub really has is read back. Each
// failure says so in a toast.
//
// → { loading, error, groups, members, headerGroups, groupOf(headerId) →
//     group, hiddenIds, isHidden(headerId), create(name), rename(id, name),
//     remove(id), assign(headerIds, groupId), setHidden(headerIds, isHidden),
//     reload }. The calls resolve true / false.
export default function useHeaderGroups(addToast) {
  const [state, setState] = useState({ loading: true, error: null, groups: [], members: {}, hiddenHeaderIds: [] });

  const loaded = useCallback((res) => {
    if (!res.ok) setState((s) => ({ ...s, loading: false, error: failureMessage(res, 'Header groups could not be loaded') }));
    else setState({ loading: false, error: null, groups: res.data?.groups || [], members: res.data?.members || {}, hiddenHeaderIds: res.data?.hiddenHeaderIds || [] });
  }, []);
  const reload = useCallback(() => listHeaderGroups().then(loaded), [loaded]);
  useEffect(() => {
    let alive = true;
    listHeaderGroups().then((res) => { if (alive) loaded(res); });
    return () => { alive = false; };
  }, [loaded]);

  const fail = useCallback((res, what) => { addToast?.(failureMessage(res, what), 'error'); return false; }, [addToast]);

  const create = useCallback(async (name) => {
    const res = await createHeaderGroup(name);
    if (!res.ok) return fail(res, 'Could not create the group');
    setState((s) => ({ ...s, groups: [...s.groups, res.data.group] }));
    addToast?.(`Group “${res.data.group.name}” created`);
    return true;
  }, [addToast, fail]);

  const rename = useCallback(async (id, name) => {
    const res = await renameHeaderGroup(id, name);
    if (!res.ok) return fail(res, 'Could not rename the group');
    setState((s) => ({ ...s, groups: s.groups.map((g) => (g.id === id ? res.data.group : g)) }));
    addToast?.(`Group renamed to “${res.data.group.name}”`);
    return true;
  }, [addToast, fail]);

  // Its headers go back to General (the hub does the same).
  const remove = useCallback(async (id) => {
    const name = state.groups.find((g) => g.id === id)?.name || 'group';
    const res = await deleteHeaderGroup(id);
    if (!res.ok) return fail(res, 'Could not delete the group');
    setState((s) => ({
      ...s,
      groups: s.groups.filter((g) => g.id !== id),
      members: Object.fromEntries(Object.entries(s.members).map(([h, g]) => [h, g === id ? GENERAL_GROUP_ID : g])),
    }));
    const moved = res.data?.moved || 0;
    addToast?.(`Group “${name}” deleted${moved ? ` — ${moved} header${moved === 1 ? '' : 's'} back to General` : ''}`);
    return true;
  }, [state.groups, addToast, fail]);

  const assign = useCallback(async (headerIds, groupId) => {
    const ids = [...new Set(headerIds || [])];
    if (!ids.length) return true;
    setState((s) => ({ ...s, members: { ...s.members, ...Object.fromEntries(ids.map((h) => [h, groupId])) } }));
    const res = await assignHeaderGroup(ids, groupId);
    if (res.ok) return true;
    await reload();
    return fail(res, 'Could not move the headers');
  }, [fail, reload]);

  const setHidden = useCallback(async (headerIds, isHidden) => {
    const ids = [...new Set(headerIds || [])];
    if (!ids.length) return true;
    setState((s) => {
      const next = new Set(s.hiddenHeaderIds);
      for (const id of ids) { if (isHidden) next.add(id); else next.delete(id); }
      return { ...s, hiddenHeaderIds: [...next] };
    });
    const res = await setHeadersHidden(ids, isHidden);
    if (res.ok) return true;
    await reload();
    return fail(res, isHidden ? 'Could not hide the header' : 'Could not show the header');
  }, [fail, reload]);

  const headerGroups = useMemo(
    () => ({ groups: state.groups, members: state.members, hiddenHeaderIds: state.hiddenHeaderIds }),
    [state.groups, state.members, state.hiddenHeaderIds],
  );
  const hiddenIds = useMemo(() => hiddenHeaderIds(state.error ? null : headerGroups), [headerGroups, state.error]);
  const groupOf = useCallback((headerId) => {
    const id = groupIdOf(headerGroups, headerId);
    return headerGroups.groups.find((g) => g.id === id) || null;
  }, [headerGroups]);
  const isHidden = useCallback((headerId) => hiddenIds.has(headerId), [hiddenIds]);

  return {
    loading: state.loading, error: state.error, groups: state.groups, members: state.members, headerGroups,
    groupOf, hiddenIds, isHidden, create, rename, remove, assign, setHidden, reload,
  };
}
