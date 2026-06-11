// Per-object packing attributes: `stackLevel` (0–10), `openTop`, and `orientations`.
//
// stackLevel controls what an item may rest on: 0 means it must rest on the truck floor (base);
// level N may rest on the floor or on top of any item with a strictly lower level (0…N-1).
// Lower = heavier / bottom-of-load, higher = light enough to ride on top of more things.
// openTop is whether OTHER items may be stacked on top of this one.
// orientations is which faces the item may be laid down on when packing (see FACES below) —
// e.g. ticking a bed's side/end faces lets the packer stand it up to save floor space.
//
// Seeded from furniture.csv; the /dimensions editor writes overrides to objectAttributes.json,
// which take precedence (see resolveAttributes). Keyed by ASSET (the GLTF model), so every item
// that reuses a model — e.g. every room's "Wine box", all on the `boxMedium` asset — shares one
// rating. There is no per-room divergence: the physical object is what determines how it packs.

import furnitureCsvRaw from './furniture.csv?raw';

export const MAX_STACK_LEVEL = 10;

// The six faces an object can be laid on. Opposite faces pack identically (same footprint), so
// they collapse to a single "flip" rest pose for the packer (see faceToFlip / orientedShapes).
export const FACES = [
  { key: 'bottom', label: 'Base (flat)', flip: 'flat' },
  { key: 'top', label: 'Top (upside down)', flip: 'flat' },
  { key: 'front', label: 'Front face', flip: 'end' },
  { key: 'back', label: 'Back face', flip: 'end' },
  { key: 'left', label: 'Left side', flip: 'side' },
  { key: 'right', label: 'Right side', flip: 'side' },
];

// Default: an object only sits on its base.
export const defaultOrientations = () => ({
  bottom: true, top: false, front: false, back: false, left: false, right: false,
});

export const clampLevel = (v) => {
  const n = Math.round(Number(v));
  if (Number.isNaN(n)) return 5;
  return Math.min(MAX_STACK_LEVEL, Math.max(0, n));
};

// Coerce any saved/partial orientations object into a complete one (base is always allowed).
export const normalizeOrientations = (orientations) => {
  const base = defaultOrientations();
  if (orientations && typeof orientations === 'object') {
    for (const { key } of FACES) if (orientations[key]) base[key] = true;
  }
  base.bottom = true;
  return base;
};

// The distinct rest poses the packer should try, derived from the ticked faces.
// Always includes 'flat'; adds 'end' (front/back down) and 'side' (left/right down) as ticked.
export const allowedFlips = (orientations) => {
  const norm = normalizeOrientations(orientations);
  const flips = new Set(['flat']);
  for (const { key, flip } of FACES) if (norm[key]) flips.add(flip);
  return [...flips];
};

export const defaultAttributeRow = { stackLevel: 5, openTop: true, orientations: defaultOrientations() };

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
      orientations: defaultOrientations(),
    };
  }
  return map;
};

// Defaults straight from the CSV, keyed by asset.
export const csvAttributes = parseFurnitureCsv(furnitureCsvRaw);

// Resolve an asset's attributes: saved override → CSV default → built-in default. Always returns a
// complete, normalized row (stackLevel clamped, orientations filled in).
export const resolveAttributes = (asset, overrides = {}) => {
  const row = (asset && overrides[asset]) || (asset && csvAttributes[asset]) || defaultAttributeRow;
  return {
    stackLevel: clampLevel(row.stackLevel),
    openTop: row.openTop !== false,
    orientations: normalizeOrientations(row.orientations),
  };
};
