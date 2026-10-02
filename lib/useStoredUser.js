'use client';

import { useSyncExternalStore } from 'react';
import { getStoredUser, isLoggedIn } from '@/lib/tokenStore';

// The signed-in user from localStorage, safe to render on the server.
//
// Reading localStorage in a useState initializer (what ProfitLossShell /
// TemplateSettingsChrome used to do) made the server render "Log in" while
// the browser's first render showed the user menu — a hydration error on
// every page load. Here the server and the hydration render both get
// `undefined` ("not known yet" — render a placeholder), then the browser
// switches to the stored user object, or `null` when signed out. Also
// follows sign-in / sign-out in another tab (the `storage` event).
let cache = { key: undefined, user: null };

function read() {
  const user = isLoggedIn() ? getStoredUser() : null;
  const key = user ? JSON.stringify(user) : '';
  if (key !== cache.key) cache = { key, user }; // same object while unchanged — required by useSyncExternalStore
  return cache.user;
}

function subscribe(onChange) {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

export function useStoredUser() {
  return useSyncExternalStore(subscribe, read, () => undefined);
}
