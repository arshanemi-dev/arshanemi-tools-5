import { normHeader } from './canonical.js';
import meesho from './meesho.js';
import amazon from './amazon.js';
import flipkart from './flipkart.js';
import myntra from './myntra.js';
import jiomart from './jiomart.js';
import manual from './manual.js';

// Registry — order matters only for the picker; detection is by fingerprint.
export const PLATFORMS = [flipkart, meesho, amazon, myntra, jiomart, manual];
export const PLATFORM_BY_ID = Object.fromEntries(PLATFORMS.map((p) => [p.id, p]));

export function getPlatform(id) {
  return PLATFORM_BY_ID[id] ?? manual;
}

// headerRow: string[] (the sheet's header cells). fileName: optional string.
// Returns a platform id, or 'manual' if nothing fingerprints.
export function detectPlatform(headerRow = [], fileName = '') {
  const normSet = new Set(headerRow.map(normHeader));
  const fname = normHeader(fileName);
  for (const p of PLATFORMS) {
    if (p.id === 'manual') continue;
    if (p.matches(normSet, fname)) return p.id;
  }
  return 'manual';
}
