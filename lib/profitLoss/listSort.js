// Name / Created sorting for the builder's Header and Title Card lists.
//
// "Created" reads `createdAt` (stamped by makeHeader / makeTitleCard). Items
// made before that field existed have none — they count as older than any
// stamped one and keep their array position among themselves, which is their
// creation order (addItem always appends). Name sort is natural ("2Profit"
// before "10Tex") and case-insensitive; ties fall back to array order.
export const LIST_SORTS = [
  { value: 'created-asc', label: 'Created · oldest first' },
  { value: 'created-desc', label: 'Created · newest first' },
  { value: 'name-asc', label: 'Name · A → Z' },
  { value: 'name-desc', label: 'Name · Z → A' },
];
export const DEFAULT_LIST_SORT = 'created-asc';

const byName = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });

export function sortItems(items, sort = DEFAULT_LIST_SORT, nameOf = (it) => it.name) {
  const [field, dir] = String(sort).split('-');
  const sign = dir === 'desc' ? -1 : 1;
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => sign * ((field === 'name'
      ? byName(nameOf(a.it), nameOf(b.it))
      : String(a.it.createdAt || '').localeCompare(String(b.it.createdAt || ''))) || a.i - b.i))
    .map(({ it }) => it);
}

export function matchesQuery(text, query) {
  const q = String(query ?? '').trim().toLowerCase();
  return !q || String(text ?? '').toLowerCase().includes(q);
}
