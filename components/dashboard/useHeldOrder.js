'use client';

import { useMemo, useState } from 'react';
import { flattenTree } from '@/lib/profitLoss/overviewTree';
import { heldRows, heldTree, holdRows, holdTree, keySignature, sameOrder } from '@/lib/profitLoss/heldOrder';

// Rows that stay put while costs are typed (lib/profitLoss/heldOrder.js).
// `all` = every row (or the whole tree, `tree`), `fresh` = them filtered and
// sorted the way the table's settings say. Returns:
//  - `view` — what to show: `fresh`, or while held the rows as they were
//    when the first cost was typed (fresh values, held order and set);
//  - `hold()` — call as a cost is handed over (CostCell, the fill handle);
//  - `release()` — the user asks for an order again: a sort, a filter, the
//    "Sort rows again" button;
//  - `moved` — held, and the sort / filters would now show it differently
//    (what the button is there for);
//  - `rowSet` — the rows' keys, in any order: a hold ends by itself when it
//    changes (an upload, a delete, another date range or company), and it's
//    what the page goes back to 1 on — not every change of a value.
export default function useHeldOrder(all, fresh, tree = false) {
  const rowSet = useMemo(() => keySignature((tree ? flattenTree(all) : all).map((n) => n.key)), [all, tree]);
  const [held, setHeld] = useState(null); // { rowSet, snap }
  const active = held && held.rowSet === rowSet ? held : null;

  const view = useMemo(
    () => (active ? (tree ? heldTree(all, active.snap) : heldRows(all, active.snap)) : fresh),
    [active, all, fresh, tree],
  );
  const moved = useMemo(() => !!active && !sameOrder(view, fresh, tree), [active, view, fresh, tree]);

  // What's on screen right now is what stays — unless it's already held.
  const hold = () => setHeld((prev) => (prev && prev.rowSet === rowSet ? prev : { rowSet, snap: tree ? holdTree(fresh) : holdRows(fresh) }));
  const release = () => setHeld(null);

  return { view, moved, hold, release, rowSet };
}
