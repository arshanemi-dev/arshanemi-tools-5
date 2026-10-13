// Resolves once the browser has painted what was just rendered. Reading a
// large sheet and recalculating the dashboard both hold the page for a
// moment; awaiting this first is what lets the progress window appear (and
// each of its steps tick over) BEFORE that work starts, instead of the page
// simply freezing with nothing on it. A tab in the background gets no
// frames, so it doesn't wait for one for long — the upload must carry on
// while the user looks at something else.
const NO_FRAME_MS = 120;

export function nextPaint() {
  return new Promise((resolve) => {
    setTimeout(resolve, NO_FRAME_MS);
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}
