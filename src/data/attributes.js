// Per-item packing attributes: `stackLevel` (0–10) and `openTop`.
//
// stackLevel controls what an item may rest on: 0 means it must rest on the truck floor (base);
// level N may rest on the floor or on top of any item with a strictly lower level (0…N-1).
// Lower = heavier / bottom-of-load, higher = light enough to ride on top of more things.
// openTop is whether OTHER items may be stacked on top of this one.
//
// Seeded from furniture.csv; the /dimensions editor writes overrides to objectAttributes.json,
// which take precedence (see resolveAttributes). Keyed by item id (not asset) — the same model
// can appear as several items with different ratings.

import furnitureCsvRaw from './furniture.csv?raw';

const parseFurnitureCsv = (raw) => {
  const map = {};
  const lines = raw.trim().split(/\r?\n/);
  if (!lines.length) return map;
  const headers = lines[0].split(',').map((h) => h.trim());
  const nameIdx = headers.indexOf('name');
  const levelIdx = headers.indexOf('stack_level');
  const openTopIdx = headers.indexOf('open_top');
  for (let i = 1; i < lines.length; i += 1) {
    const cells = lines[i].split(',').map((c) => c.trim());
    if (!cells[nameIdx]) continue;
    map[cells[nameIdx]] = {
      stackLevel: clampLevel(Number(cells[levelIdx])),
      openTop: String(cells[openTopIdx]).toLowerCase() === 'true',
    };
  }
  return map;
};

export const MAX_STACK_LEVEL = 10;

export const clampLevel = (v) => {
  const n = Math.round(Number(v));
  if (Number.isNaN(n)) return 5;
  return Math.min(MAX_STACK_LEVEL, Math.max(0, n));
};

export const defaultAttributeRow = { stackLevel: 5, openTop: true };

// Defaults straight from the CSV, keyed by item id.
export const csvAttributes = parseFurnitureCsv(furnitureCsvRaw);

// Resolve an item's attributes: saved override → CSV default → fallback.
export const resolveAttributes = (id, overrides = {}) =>
  overrides[id] || csvAttributes[id] || defaultAttributeRow;
