// The diagnostic screens — the dashboard's "Merged Extracted Common Headers
// Data" table and the extraction debugger embedded under it, plus Template
// Settings' Sheet Debugger page (/profit-loss/debug) — are for building and
// checking templates, not for sellers. Shown while developing (`npm run
// dev`), hidden in a production build.
//
// NEXT_PUBLIC_SHOW_DEBUG_TOOLS overrides that either way: "true" keeps them
// in production (to diagnose a live problem), "false" hides them in
// development too (to see the production look). Build-time, like every
// NEXT_PUBLIC_ flag — rebuild after changing.
const FLAG = process.env.NEXT_PUBLIC_SHOW_DEBUG_TOOLS;

export const DEBUG_TOOLS = FLAG === 'true' || (FLAG !== 'false' && process.env.NODE_ENV !== 'production');
