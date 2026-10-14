'use client';

import { useEffect, useRef, useState } from 'react';

const COMMIT_MS = 600; // a pause in typing this long hands the cost over

const isBlank = (text) => String(text).trim() === '';
const isNumber = (text) => !isBlank(text) && Number.isFinite(Number(text));
// Is what's in the box the cost that's already there?
const sameCost = (text, value) => (isBlank(text) ? !Number.isFinite(value) : Number(text) === value);

// One SKU's one DEFAULT cost, typed straight into the table — the body of a
// cost header's cell (COGS (Product Cost), Cost GST in, Final Product Cost,
// Other Expense (per order) — data/fixedHeaders.js) on a SKU's row. No Save
// button: the box keeps what is being typed to itself and hands it over
// (`onCommit(text)`) once the typing pauses, on Enter, or on leaving the box
// — so the dashboard isn't recomputed and re-saved on every digit — and a
// row that leaves the screen mid-edit (next page, a filter, another tab)
// still hands its value over. An empty box clears the cost; text that isn't
// a number is flagged and changes nothing (the box goes back to the cost on
// leaving it).
//
// `value` = the SKU's default (a number, or nothing) — what its next upload
// is priced at. `dirty` = handed over but not saved yet — the box stays
// tinted from the first keystroke until its own save lands
// (lib/profitLoss/useSkuCosts.js). `total` = the column's cell for this row
// ({ raw, display }): the cost across all of the SKU's orders, each at the
// price it was uploaded with — so after a default is changed it still adds
// up the old price for the old orders. Shown beside the box whenever it
// isn't the typed number itself; it is what the column's sort, filter and
// formulas go by. Without `onCommit` (Template Settings' preview) the box is
// read-only.
//
// `fill` = { col, sku, start } adds Excel's fill handle: a small square on
// the box's corner (shown on hover / focus) to drag up or down and copy this
// box's value into the boxes passed over — see useCostFill.js, which also
// marks the range being dragged over (`data-fill-on`, tinted here).
export default function CostCell({ value, total = null, onCommit, label, dirty = false, fill = null }) {
  const [text, setText] = useState(null); // what's being typed; null = showing `value`
  const timer = useRef(null);
  const waiting = useRef(null); // typed text not handed over yet
  const commit = useRef(onCommit);
  useEffect(() => { commit.current = onCommit; });

  const flush = () => {
    clearTimeout(timer.current);
    if (waiting.current == null) return;
    const typed = waiting.current;
    waiting.current = null;
    commit.current?.(typed);
  };

  useEffect(() => () => {
    clearTimeout(timer.current);
    if (waiting.current != null) commit.current?.(waiting.current);
  }, []);

  const onType = (next) => {
    setText(next);
    waiting.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, COMMIT_MS);
  };

  const saved = Number.isFinite(value) ? String(value) : '';
  const bad = text != null && !isBlank(text) && !isNumber(text);
  const unsaved = !bad && (dirty || (text != null && !sameCost(text, value)));
  const sum = total?.raw;
  const showTotal = typeof sum === 'number' && Number.isFinite(sum) && sum !== 0 && sum !== value;

  const fillable = !!(fill && onCommit);
  // Hand over what's typed first, so the grabbed box is saved with the same
  // value it is copied out with. Text that isn't a number has nothing to copy.
  const startFill = (e) => {
    if (bad) return;
    flush();
    fill.start(e, { field: fill.col, text: text ?? saved });
  };

  return (
    <div
      data-fill-col={fillable ? fill.col : undefined}
      data-fill-sku={fillable ? fill.sku : undefined}
      className="group/fill flex flex-wrap items-center justify-center gap-2"
    >
      <span className="relative inline-flex">
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text ?? saved}
          readOnly={!onCommit}
          onChange={(e) => onType(e.target.value)}
          onBlur={() => { flush(); setText(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') flush(); }}
          placeholder="—"
          aria-label={label}
          aria-invalid={bad || undefined}
          title={bad ? 'Not a number — nothing is changed' : unsaved ? 'Edited — not saved yet' : 'Default price for this SKU — used for orders uploaded from now on'}
          className={`w-24 rounded-lg border px-2 py-1 text-sm tabular-nums focus:outline-none group-data-[fill-on]/fill:border-dashed group-data-[fill-on]/fill:border-action group-data-[fill-on]/fill:bg-action-soft ${
            bad ? 'border-neg bg-background' : unsaved ? 'border-link bg-link/10' : 'border-divider bg-background focus:border-accent'
          }`}
        />
        {fillable && (
          <span
            role="presentation"
            onPointerDown={startFill}
            title="Drag up or down to copy this value into those rows"
            className="absolute -bottom-1 -right-1 hidden h-2.5 w-2.5 cursor-crosshair touch-none rounded-[2px] border border-background bg-action group-hover/fill:block group-focus-within/fill:block"
          />
        )}
      </span>
      {showTotal && (
        <span className="text-[11px] tabular-nums text-subtle" title="Across this SKU’s orders, each at the price it was uploaded with — what this column’s sort, filter and formulas use">
          Total {total.display}
        </span>
      )}
    </div>
  );
}
