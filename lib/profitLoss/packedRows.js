// The Transactions result travels from the calculation worker column by
// column instead of as one { raw, display } object per cell: copying a long
// history's million little cell objects across cost nearly as much as
// working them out (~0.9 s for 20,000 orders, against ~0.1 s for the same
// values in one array per column). Pure.
//
//   packRows({ headers, rows, rowCount })   in the worker
//   unpackRows(result)                      on the page → { headers, rows, rowCount }
//
// An unpacked row is { key, company, cells } like any resolved row, but its
// `cells` read straight from the column arrays: `cells[headerId]` gives a
// fresh { raw, display } from a getter on one prototype shared by every row
// — nothing is rebuilt per cell. The getters aren't own properties, so
// `{ ...row.cells }` copies nothing: lay changed cells over a row with
// withCells instead.

export function packRows(result) {
  const rows = result?.rows || [];
  const ids = (result?.headers || []).map((h) => h.id);
  const n = rows.length;
  const keys = [];
  const companies = [];
  const raw = ids.map(() => []);
  const display = ids.map(() => []);
  // One pass over the rows, each row's cells read once. Grown with push, not
  // new Array(n): a pre-sized ("holey") array is several times slower to copy
  // across to the page.
  for (let i = 0; i < n; i += 1) {
    const { key, company, cells } = rows[i];
    keys.push(key);
    companies.push(company);
    for (let c = 0; c < ids.length; c += 1) {
      const cell = cells[ids[c]];
      raw[c].push(cell?.raw);
      display[c].push(cell?.display);
    }
  }
  return { headers: result?.headers || [], rowCount: result?.rowCount ?? n, packed: { ids, keys, companies, raw, display } };
}

const unpacked = new WeakMap();

export function unpackRows(result) {
  if (!result?.packed) return result;
  let out = unpacked.get(result);
  if (out) return out;
  const { ids, keys, companies, raw, display } = result.packed;
  const proto = {};
  ids.forEach((id, col) => {
    Object.defineProperty(proto, id, {
      get() { return { raw: raw[col][this.i], display: display[col][this.i] }; },
      enumerable: false,
    });
  });
  const rows = keys.map((key, i) => ({ key, company: companies[i], cells: Object.create(proto, { i: { value: i } }) }));
  out = { headers: result.headers, rowCount: result.rowCount, rows };
  unpacked.set(result, out);
  return out;
}

// `cells` with some of its cells replaced (`changes` = { [headerId]: { raw,
// display } }) — works for packed and plain cells alike.
export function withCells(cells, changes) {
  const out = Object.create(cells);
  for (const [id, cell] of Object.entries(changes)) Object.defineProperty(out, id, { value: cell, enumerable: true });
  return out;
}
