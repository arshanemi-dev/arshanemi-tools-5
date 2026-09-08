import { configureStore } from '@reduxjs/toolkit';
import sheetSettings from './sheetSettingsSlice';

const LS_KEY = 'barmeto-pl-sheet-settings';

function loadPersisted() {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    return parsed && parsed.byPlatform ? { sheetSettings: parsed } : undefined;
  } catch {
    return undefined;
  }
}

// One store per browser session. Created inside StoreProvider (client only), so
// localStorage is always available here.
export function makeStore() {
  const store = configureStore({
    reducer: { sheetSettings },
    preloadedState: loadPersisted(),
    middleware: (getDefault) => getDefault({ serializableCheck: true }),
  });

  if (typeof window !== 'undefined') {
    let last = store.getState().sheetSettings;
    store.subscribe(() => {
      const next = store.getState().sheetSettings;
      if (next === last) return;
      last = next;
      try {
        window.localStorage.setItem(LS_KEY, JSON.stringify(next));
      } catch {
        /* quota / private mode — settings just won't persist */
      }
    });
  }

  return store;
}
