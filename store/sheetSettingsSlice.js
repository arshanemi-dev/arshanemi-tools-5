import { createSlice } from '@reduxjs/toolkit';

// Per-marketplace parsing config the user controls from the Sheet Settings
// panel. Persisted to localStorage (see store/index.js).
//
//  byPlatform[platformId] = {
//    tabs:        string[]   // sheet-tab names to read; [] = auto (pick the best one)
//    headerMap:   { [canonicalField]: sheetHeaderName }   // column-mapping overrides
//    knownTabs:   string[]   // last workbook's tab names   (UI hint only)
//    knownHeaders:string[]   // last workbook's header cells (UI hint only)
//    touched:     boolean    // has the user ever edited this platform's config
//  }

const emptyPlatform = () => ({
  tabs: [],
  headerMap: {},
  knownTabs: [],
  knownHeaders: [],
  touched: false,
});

const initialState = { byPlatform: {} };

const slice = createSlice({
  name: 'sheetSettings',
  initialState,
  reducers: {
    // Record what a freshly-uploaded workbook contained. Never clobbers the
    // user's own tab/header-map choices — only refreshes the "known" hints.
    observeWorkbook(state, { payload }) {
      const { platformId, tabs = [], headers = [] } = payload;
      const p = state.byPlatform[platformId] || emptyPlatform();
      p.knownTabs = tabs;
      p.knownHeaders = [...new Set([...(p.knownHeaders || []), ...headers])];
      state.byPlatform[platformId] = p;
    },
    setTabs(state, { payload }) {
      const { platformId, tabs } = payload;
      const p = state.byPlatform[platformId] || emptyPlatform();
      p.tabs = tabs;
      p.touched = true;
      state.byPlatform[platformId] = p;
    },
    setHeaderMap(state, { payload }) {
      const { platformId, field, header } = payload;
      const p = state.byPlatform[platformId] || emptyPlatform();
      p.headerMap = { ...p.headerMap };
      if (header) p.headerMap[field] = header;
      else delete p.headerMap[field];
      p.touched = true;
      state.byPlatform[platformId] = p;
    },
    addKnownHeader(state, { payload }) {
      const { platformId, header } = payload;
      if (!header) return;
      const p = state.byPlatform[platformId] || emptyPlatform();
      p.knownHeaders = [...new Set([...(p.knownHeaders || []), header])];
      state.byPlatform[platformId] = p;
    },
    resetPlatform(state, { payload }) {
      const { platformId } = payload;
      const known = state.byPlatform[platformId] || emptyPlatform();
      state.byPlatform[platformId] = {
        ...emptyPlatform(),
        knownTabs: known.knownTabs || [],
        knownHeaders: known.knownHeaders || [],
      };
    },
    hydrate(state, { payload }) {
      if (payload && typeof payload === 'object' && payload.byPlatform) {
        state.byPlatform = payload.byPlatform;
      }
    },
  },
});

export const {
  observeWorkbook,
  setTabs,
  setHeaderMap,
  addKnownHeader,
  resetPlatform,
  hydrate,
} = slice.actions;

export default slice.reducer;

// Selector helper — always returns a fully-shaped object.
export function selectPlatformSettings(state, platformId) {
  return state.sheetSettings.byPlatform[platformId] || emptyPlatform();
}
