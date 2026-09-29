// One colour per Overview hierarchy level (--color-lvl1…6 in app/globals.css,
// light + dark). Depth is 0-based: Level 1 = LEVEL_STYLES[0]. Every class is
// written out in full so Tailwind's scanner sees it — never build these
// strings dynamically.
//   dot     solid swatch (legend / nav bullet)
//   text    level-coloured text (chevrons, active label)
//   badge   soft pill (legend chip, child-count badge, "L1" tag)
//   soft    active / hover highlight in the nav
//   tint    light row tint in the tree table — lighter the deeper it goes
//   stripe  left accent bar on the table's hierarchy cell / editor row
//   guide   the vertical connector under an open nav node
//   ring    focused table row outline
//   indent  hierarchy-cell padding in the tree table
//   step    editor-row offset in Template Settings (visual nesting)
export const LEVEL_STYLES = [
  { dot: 'bg-lvl1', text: 'text-lvl1', badge: 'bg-lvl1/15 text-lvl1', soft: 'bg-lvl1/15', tint: 'bg-lvl1/10', stripe: 'border-l-lvl1', guide: 'border-lvl1/35', ring: 'ring-lvl1/60', indent: 'pl-2', step: 'ml-0' },
  { dot: 'bg-lvl2', text: 'text-lvl2', badge: 'bg-lvl2/15 text-lvl2', soft: 'bg-lvl2/15', tint: 'bg-lvl2/8', stripe: 'border-l-lvl2', guide: 'border-lvl2/35', ring: 'ring-lvl2/60', indent: 'pl-7', step: 'ml-4' },
  { dot: 'bg-lvl3', text: 'text-lvl3', badge: 'bg-lvl3/15 text-lvl3', soft: 'bg-lvl3/15', tint: 'bg-lvl3/6', stripe: 'border-l-lvl3', guide: 'border-lvl3/35', ring: 'ring-lvl3/60', indent: 'pl-12', step: 'ml-8' },
  { dot: 'bg-lvl4', text: 'text-lvl4', badge: 'bg-lvl4/15 text-lvl4', soft: 'bg-lvl4/15', tint: 'bg-lvl4/6', stripe: 'border-l-lvl4', guide: 'border-lvl4/35', ring: 'ring-lvl4/60', indent: 'pl-17', step: 'ml-12' },
  { dot: 'bg-lvl5', text: 'text-lvl5', badge: 'bg-lvl5/15 text-lvl5', soft: 'bg-lvl5/15', tint: 'bg-lvl5/5', stripe: 'border-l-lvl5', guide: 'border-lvl5/35', ring: 'ring-lvl5/60', indent: 'pl-22', step: 'ml-16' },
  { dot: 'bg-lvl6', text: 'text-lvl6', badge: 'bg-lvl6/15 text-lvl6', soft: 'bg-lvl6/15', tint: 'bg-lvl6/5', stripe: 'border-l-lvl6', guide: 'border-lvl6/35', ring: 'ring-lvl6/60', indent: 'pl-27', step: 'ml-20' },
];

export function levelStyle(depth) {
  return LEVEL_STYLES[Math.max(0, depth) % LEVEL_STYLES.length];
}
