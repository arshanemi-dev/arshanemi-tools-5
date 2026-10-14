'use client';

import { useCallback, useEffect, useRef } from 'react';

const EDGE = 36; // px from the scroll area's top / bottom where a drag scrolls it
const STEP = 14; // px it scrolls per frame there

// Excel's fill handle for a table's cost boxes (CostCell). Grab the small
// square at a box's corner, drag up or down, let go: every box passed over
// in that column takes the grabbed box's value — copied, the way Excel
// copies one cell. Esc while dragging cancels.
//
// Like Excel the drag follows the pointer's height only (it needn't stay
// over the column), and near the table's scroll area's top or bottom edge
// it scrolls it. Boxes are found in the DOM by the attributes CostCell puts
// on them — `data-fill-col` (the cost field) and `data-fill-sku` — so rows
// without a box (an Overview parent row, a non-SKU row) are simply skipped.
// The range being dragged over is marked `data-fill-on` for CostCell to
// tint, straight on the DOM — no table re-render per pointer move.
//
// Returns `start(event, { field, text })` for the handle's onPointerDown.
// `onFill(field, skus, text)` gets the SKUs filled, never the grabbed one.
export default function useCostFill(onFill) {
  const fill = useRef(onFill);
  useEffect(() => { fill.current = onFill; });
  const cancel = useRef(null);
  useEffect(() => () => cancel.current?.(), []);

  return useCallback((event, { field, text }) => {
    const source = event.currentTarget.closest('[data-fill-col]');
    const table = source?.closest('table');
    if (!table || event.button !== 0) return;
    event.preventDefault(); // no text selection, and the box keeps its focus
    cancel.current?.();

    const cells = [...table.querySelectorAll('[data-fill-col]')].filter((el) => el.dataset.fillCol === field);
    const rows = cells.map((el) => el.closest('tr') || el);
    const from = cells.indexOf(source);
    const scroller = table.closest('[data-table-scroll]');
    let to = from;
    let y = event.clientY;
    let frame = 0;

    // The last box whose row starts at or above the pointer (rows are in
    // top-to-bottom order) — above the first row, the first.
    const rowAt = () => {
      let lo = 0;
      let hi = rows.length - 1;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (rows[mid].getBoundingClientRect().top <= y) lo = mid; else hi = mid - 1;
      }
      return lo;
    };
    const mark = () => {
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      cells.forEach((el, i) => {
        if (i >= lo && i <= hi) el.dataset.fillOn = ''; else delete el.dataset.fillOn;
      });
    };
    const tick = () => {
      if (scroller) {
        const box = scroller.getBoundingClientRect();
        if (y < box.top + EDGE) scroller.scrollTop -= STEP;
        else if (y > box.bottom - EDGE) scroller.scrollTop += STEP;
      }
      const at = rowAt();
      if (at !== to) { to = at; mark(); }
      frame = requestAnimationFrame(tick);
    };

    const onMove = (e) => { y = e.clientY; };
    const finish = (apply) => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
      cancel.current = null;
      for (const el of cells) delete el.dataset.fillOn;
      if (!apply || to === from) return;
      const picked = cells.slice(Math.min(from, to), Math.max(from, to) + 1).filter((el) => el !== source);
      fill.current?.(field, picked.map((el) => el.dataset.fillSku), text);
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (e) => { if (e.key === 'Escape') finish(false); };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    cancel.current = () => finish(false);
    mark();
    frame = requestAnimationFrame(tick);
  }, []);
}
