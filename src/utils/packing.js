// 3D voxel packer + truck-fleet selector.
//
// Each truck has a flat Uint16Array `voxels` indexed by (z * D * W + y * W + x) holding either
// 0 (empty) or 1 + index into the per-truck items array. Items expose a precomputed voxel mask
// (list of [dx, dy, dz]) plus a `footprint` (every column the item occupies — its full vertical
// shadow) and a `bottomFootprint` (the subset whose lowest voxel touches dz=0 — the contact feet).
//
// Packing rules:
//   - Each item has a `stackLevel` 0–10. An item may rest on the truck floor (base), or on top
//     of an item whose stackLevel is EQUAL OR LOWER than its own — so identical stackables (e.g.
//     boxes on boxes) pile up. The one exception is level 0: those are heavy base items (sofas,
//     beds, fridges) that ride the floor and never stack on their own kind.
//   - Lowest stackLevel goes first, so floor-bound items claim the base before anything stacks.
//   - An item can only rest on items whose `openTop` is true.
//   - ≥70% contact: when stacked (not on the floor), at least 70% of an item's footprint columns
//     must be supported by item(s) directly below — a little overhang is allowed for leeway, but a
//     clear majority must be carried so nothing topples or floats off an edge.
//   - Placement builds walls from the back forward: it scores by (x, then y, then z), so the load
//     fills each back cross-section — column by column across the width, stacking up — before
//     advancing toward the doors, the way a removalist loads a truck.
//
// Fleet selection (the part that used to live half in App.vue, half in a retry loop here):
//   1. Derive lower bounds on the truck count from the load's real minimum requirements —
//      the dimensional floor (an item that only fits a Large forces a Large), the volume bound
//      (ceil(totalVolume / capacity)), and the floor-area bound (stackLevel-0 base items each
//      need floor footprint).
//   2. Search fleets upward from that floor, cheapest first by the strict objective:
//        (a) fewest trucks, (b) smallest total truck size, (c) lowest wasted space / height.
//      The first fleet that fully packs wins.

import { orientedShapes } from './shapes.js';

const idx = (W, D, x, y, z) => z * D * W + y * W + x;

// Fraction of a stacked item's footprint columns that must rest on a supporter directly below. 1.0
// is full contact (nothing hangs); 0.7 gives real loads some leeway so an item may overhang a gap
// by up to 30% of its footprint and still be accepted.
const SUPPORT_FRACTION = 0.7;

const makeTruckGrid = (cellsX, cellsY, cellsZ) => ({
  W: cellsX,
  D: cellsY,
  H: cellsZ,
  voxels: new Uint16Array(cellsX * cellsY * cellsZ),
  columnTop: new Uint16Array(cellsX * cellsY), // highest occupied dz + 1 per (x, y) — fast lower bound for z_rest
  items: [], // 1-indexed in voxels; items[0] is sentinel
  // Candidate (x, y) anchors for the next item's back-left corner. Rather than scan every cell
  // (O(W·D) per item — far too slow at 50–150 items), we only try a handful of "extreme points"
  // seeded from the back-left corner and grown as items land. This is the standard fast bin-pack
  // heuristic and keeps packing interactive.
  anchors: [[0, 0]],
});

const cellEmpty = (grid, x, y, z) => grid.voxels[idx(grid.W, grid.D, x, y, z)] === 0;

const itemAt = (grid, x, y, z) => {
  const v = grid.voxels[idx(grid.W, grid.D, x, y, z)];
  return v === 0 ? null : grid.items[v - 1];
};

const writeVoxel = (grid, x, y, z, itemIndex) => {
  grid.voxels[idx(grid.W, grid.D, x, y, z)] = itemIndex + 1;
};

// Orientations are pure functions of the shape, so cache them keyed by the shape object — the
// same item objects are re-tried across several trucks, seeds and fleets within one pack.
const orientationCache = new WeakMap();
const orientationsFor = (item) => {
  let cached = orientationCache.get(item.shape);
  if (!cached) {
    cached = orientedShapes(item.shape, item.orientationFlips || ['flat']);
    orientationCache.set(item.shape, cached);
  }
  return cached;
};

// Returns the lowest z_rest at which the given oriented shape can be placed at (x, y),
// or null if it cannot fit anywhere in the column. Verifies bounds, voxel collisions, and
// the support contract (open_top + stack level) for every bottom-footprint cell.
//
// Fast rest height: rather than scan every z from the floor up, compute the lowest z at which no
// footprint column's bottom collides with the cargo already there — `zRest = max(columnTop[col] -
// bottomOffset[col])` over the footprint, an O(footprint) read of the truck's skyline. `placementOK`
// then validates that exact resting spot (collision + ≥70% support + open-top + stack level), bumping
// up only in the rare overhang case. This drops the old ~H× z-scan, which is the dominant pack cost.
//
// Trade-off vs the old floor-up scan: an item no longer settles into a CAVE *below* a column's top
// (e.g. the floor space under a table slab). That is a minor fill source and tuck-in anchors still
// target floor pockets; we accept it for the large speedup that funds a much wider search.
const findLowestZ = (grid, shape, x, y, item) => {
  if (x < 0 || y < 0) return null;
  if (x + shape.width > grid.W) return null;
  if (y + shape.depth > grid.D) return null;

  const maxZ = grid.H - shape.height;
  if (maxZ < 0) return null;

  const { W, columnTop } = grid;
  const fp = shape.footprint;
  const off = shape.bottomOffsets;
  let zRest = 0;
  for (let i = 0; i < fp.length; i += 1) {
    const need = columnTop[(y + fp[i][1]) * W + (x + fp[i][0])] - off[i];
    if (need > zRest) zRest = need;
  }
  if (zRest > maxZ) return null;

  // Fast path for solid blocks (the common case): at zRest a solid box is collision-free by
  // construction (every footprint column is clear from zRest up), so we skip the O(voxels) scan and
  // only verify the ≥70%-support contract in O(footprint) straight off the skyline. This is the hot
  // path that lets the GA run thousands of packs in the budget.
  if (shape.solid) {
    if (zRest === 0) return 0; // on the floor — always supported
    const lvl = item.stackLevel;
    let supported = 0;
    for (let i = 0; i < fp.length; i += 1) {
      const dx = fp[i][0];
      const dy = fp[i][1];
      // A column whose surface sits below the rest plane leaves a gap under the block: allowed as
      // overhang (counts as unsupported) as long as ≥70% of columns DO carry the block.
      if (columnTop[(y + dy) * W + (x + dx)] !== zRest) continue;
      const sup = itemAt(grid, x + dx, y + dy, zRest - 1);
      if (!sup || !sup.openTop) return null;
      if (sup.stackLevel > lvl) return null;
      if (sup.stackLevel === lvl && lvl === 0) return null;
      supported += 1;
    }
    return supported >= fp.length * SUPPORT_FRACTION ? zRest : null;
  }

  // General (composite) shapes: validate the resting spot with the full voxel/support check.
  for (let z = zRest; z <= maxZ; z += 1) {
    if (placementOK(grid, shape, x, y, z, item)) return z;
  }
  return null;
};

const placementOK = (grid, shape, x, y, z, item) => {
  // 1. No voxel collisions.
  for (const [dx, dy, dz] of shape.voxels) {
    if (!cellEmpty(grid, x + dx, y + dy, z + dz)) return false;
  }
  // 2. Support contract. The truck floor supports any item.
  if (z === 0) return true;
  // ≥70% contact: at least 70% of the columns the item occupies must sit on a supporting item
  // directly below; the remaining (up to 30%) may overhang a gap, giving real loads some leeway.
  // Any column that DOES rest on something must rest on an open-top item of equal-or-lower stack
  // level — so identical stackables (boxes on boxes) pile up, while resting on a closed-top or
  // heavier item is never allowed. The one exception is level 0: those are heavy "base" items
  // (sofas, beds, fridges) that ride the floor and never stack on their own kind.
  const fp = shape.footprint;
  let supported = 0;
  for (const [dx, dy] of fp) {
    const supporter = itemAt(grid, x + dx, y + dy, z - 1);
    if (!supporter) continue;                              // empty below → overhang, counts as unsupported
    if (!supporter.openTop) return false;                  // can't put anything on top of this item
    if (supporter.stackLevel > item.stackLevel) return false;
    if (supporter.stackLevel === item.stackLevel && item.stackLevel === 0) return false;
    supported += 1;
  }
  return supported >= fp.length * SUPPORT_FRACTION;
};

// Wall-building scoring (how a removalist actually loads a truck): start at the back wall and
// build it as full as possible — column by column across the width, stacking each column up —
// before advancing forward toward the doors. So the dominant key is the back position (x), then
// the across-width position (y), then height (z): an item prefers to climb the current back
// column over starting fresh floor further forward, which forms solid, stable walls of cargo.
// This is cheap — no per-candidate voxel scan — keeping placement interactive on big loads.
// orientBias: 'deep' favours a deep (along-length) footprint, 'wide' a wide (across-width) one,
// 'tall' favours the orientation that stands the item UP (maximising height) — this is what makes a
// bed/mirror/table tip onto its end or side and ride against the wall, when its attributes allow it.
const biasKey = (shape, orientBias) =>
  orientBias === 'deep' ? -shape.depth
    : orientBias === 'wide' ? -shape.width
      : orientBias === 'tall' ? -shape.height
        : 0;

// Items that should be loaded LAST (so they come off first and aren't buried under cargo) — e.g.
// potted plants: fragile and awkward. They still tuck against the nearest cargo with the normal
// back-building score; "last" is about load ORDER, not being pushed to the doors. Matched loosely
// by asset/id/name so the catalog's `pottedPlant*` assets qualify with no extra configuration.
const isLoadLast = (item) => /plant/i.test(`${item.asset || ''} ${item.id || ''} ${item.name || ''}`);

// Closed-top base items: pieces that can't be stacked onto (`openTop` false) and must ride the floor
// (level 0) — tall awkward things like a stood-up wardrobe or fridge. Like plants they load LAST and
// tallest-first so they aren't buried under stacks. Plants take precedence (matched first).
const isClosedBase = (item) => !isLoadLast(item) && !item.openTop && item.stackLevel === 0;

// All cargo hugs the BACK wall (low x) and builds forward, one column at a time. Load-last items
// (plants, closed-top base pieces) go in last by ORDER, but they still tuck against the nearest
// cargo with this same back-building score — never pushed off to the far (door) end of the truck.
const scorePlacement = (grid, shape, x, y, z, orientBias) => [
  x,                            // 1. hug the back wall
  y,                            // 2. fill across the width, one column at a time
  z,                            // 3. stack the current column up before starting a new one
  biasKey(shape, orientBias),   // 4. orientation bias (deep / wide / tall)
  x + shape.width,              // 5. keep the wall thin
];

const compareScores = (a, b) => {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
};

// Best legal placement of a single item inside one truck grid (or null if it does not fit).
// Only the grid's candidate anchors are tried (× each unique orientation), which keeps this fast.
const tryPlace = (grid, item, orientBias) => {
  let best = null;
  const orientations = orientationsFor(item);
  for (const [x, y] of grid.anchors) {
    for (const oriented of orientations) {
      if (x + oriented.width > grid.W || y + oriented.depth > grid.D || oriented.height > grid.H) continue;
      const z = findLowestZ(grid, oriented, x, y, item);
      if (z === null) continue;
      const score = scorePlacement(grid, oriented, x, y, z, orientBias);
      if (!best || compareScores(score, best.score) < 0) {
        best = { x, y, z, oriented, score };
      }
    }
  }
  return best;
};

const addAnchor = (grid, x, y) => {
  if (x < 0 || y < 0 || x >= grid.W || y >= grid.D) return;
  for (const [ax, ay] of grid.anchors) if (ax === x && ay === y) return;
  grid.anchors.push([x, y]);
};

const commitPlacement = (grid, item, placement) => {
  const { x, y, z, oriented } = placement;
  const itemIndex = grid.items.length;
  grid.items.push(item);
  for (const [dx, dy, dz] of oriented.voxels) {
    writeVoxel(grid, x + dx, y + dy, z + dz, itemIndex);
    const colIdx = (y + dy) * grid.W + (x + dx);
    const top = z + dz + 1;
    if (top > grid.columnTop[colIdx]) grid.columnTop[colIdx] = top;
  }
  // New extreme points: just past this item's right edge and front edge, so the next item tucks
  // against it. The back-left origin always stays available for stacking / gap-fill.
  addAnchor(grid, x + oriented.width, y);
  addAnchor(grid, x, y + oriented.depth);
  // Tuck-in anchors: the back-left corner of each empty floor pocket WITHIN this item's bounding
  // box — the space under a table slab, between chair legs, inside an L-sofa's notch. Without
  // these, the concavity gets no candidate position and is stranded; with them (plus the
  // floor-up search in findLowestZ) smaller items settle into the gap. Out-of-box neighbours
  // count as occupied so an edge-touching pocket still yields its corner.
  const occupiedFloor = (gx, gy) =>
    gx < 0 || gy < 0 || gx >= oriented.width || gy >= oriented.depth
      ? true
      : !cellEmpty(grid, x + gx, y + gy, 0);
  for (let dy = 0; dy < oriented.depth; dy += 1) {
    for (let dx = 0; dx < oriented.width; dx += 1) {
      if (occupiedFloor(dx, dy)) continue;
      if (occupiedFloor(dx - 1, dy) && occupiedFloor(dx, dy - 1)) addAnchor(grid, x + dx, y + dy);
    }
  }
  // Drop anchors whose column is now full to the roof, then keep only the most promising
  // back-left-low anchors. Capping the live set bounds per-item placement cost (each candidate
  // re-scans the item's voxel mask, which is thousands of cells for a bed or sofa) so packing
  // stays interactive on big loads without meaningfully hurting fill quality.
  grid.anchors = grid.anchors.filter(([ax, ay]) => grid.columnTop[ay * grid.W + ax] < grid.H);
  if (grid.anchors.length > ANCHOR_CAP) {
    grid.anchors.sort((a, b) =>
      grid.columnTop[a[1] * grid.W + a[0]] - grid.columnTop[b[1] * grid.W + b[0]]
      || a[1] - b[1]
      || a[0] - b[0]);
    grid.anchors.length = ANCHOR_CAP;
  }
  if (!grid.anchors.length) grid.anchors.push([0, 0]);
};

const ANCHOR_CAP = 400;

// ---------------------------------------------------------------------------------------------
// Minimum-requirement bounds
// ---------------------------------------------------------------------------------------------

const footprintCells = (item) => item.shape.width * item.shape.depth;
const volumeCells = (item) => item.shape.width * item.shape.depth * item.shape.height;
const floorArea = (size) => size.cellsX * size.cellsY;

// Does some orientation of the item fit inside this truck size's grid at all?
const fitsSize = (item, size) => {
  for (const oriented of orientationsFor(item)) {
    if (oriented.width <= size.cellsX && oriented.depth <= size.cellsY && oriented.height <= size.cellsZ) {
      return true;
    }
  }
  return false;
};

// Smallest catalog index (sizes sorted ascending) whose grid can hold the item, or -1 if none.
const minSizeIndex = (item, sizes) => {
  for (let i = 0; i < sizes.length; i += 1) {
    if (fitsSize(item, sizes[i])) return i;
  }
  return -1;
};

// Derive the lower bounds that seed and constrain the fleet search.
const computeBounds = (items, sizes) => {
  const largest = sizes[sizes.length - 1];
  // Level-0 items are the only ones that can never rest on anything (they ride the floor and
  // don't stack on their own kind), so their combined footprint is a hard lower bound on total
  // floor area, hence on truck count. Higher levels can pile on equal-or-lower items, so they
  // don't each demand floor and are excluded from this bound.
  let totalVolume = 0;
  let baseFootprint = 0;
  let reqIdx = 0;        // dimensional floor: the hardest single item to house
  for (const item of items) {
    totalVolume += item.volume;
    const minIdx = minSizeIndex(item, sizes);
    if (minIdx > reqIdx) reqIdx = minIdx; // (-1 unfittable items leave reqIdx untouched)
    if (item.stackLevel === 0) baseFootprint += footprintCells(item);
  }
  const volumeBound = Math.ceil(totalVolume / largest.capacity);
  const floorBound = Math.ceil(baseFootprint / floorArea(largest));
  const nMin = Math.max(1, volumeBound, floorBound);
  return { totalVolume, baseFootprint, reqIdx, nMin };
};

// All N-truck fleets (multisets over the catalog) that could conceivably hold the load, ordered
// by the objective tail-end: smallest total capacity first, then fewer big trucks. A fleet is
// only worth attempting if it covers the dimensional floor and meets the crude volume/floor-area
// budgets (cheap necessary conditions — the packer still has the final say).
const candidateFleets = (N, sizes, bounds) => {
  const { reqIdx, totalVolume, baseFootprint } = bounds;
  const fleets = [];
  // Enumerate counts per size summing to N (sizes ascending, so build index by index).
  const build = (i, left, chosen) => {
    if (i === sizes.length - 1) {
      chosen.push(left);
      const fleet = [];
      let maxIdx = -1;
      let capSum = 0;
      let floorSum = 0;
      for (let s = 0; s < sizes.length; s += 1) {
        for (let c = 0; c < chosen[s]; c += 1) fleet.push(sizes[s]);
        if (chosen[s] > 0) maxIdx = s;
        capSum += sizes[s].capacity * chosen[s];
        floorSum += floorArea(sizes[s]) * chosen[s];
      }
      chosen.pop();
      if (maxIdx >= reqIdx && capSum + 0.01 >= totalVolume && floorSum >= baseFootprint) {
        // bigTrucks weights toward fleets that lean on smaller trucks when capacity ties.
        let bigTrucks = 0;
        for (const t of fleet) bigTrucks += t.capacity;
        fleets.push({ fleet, capSum, bigTrucks });
      }
      return;
    }
    for (let c = 0; c <= left; c += 1) {
      chosen.push(c);
      build(i + 1, left - c, chosen);
      chosen.pop();
    }
  };
  build(0, N, []);
  fleets.sort((a, b) => a.capSum - b.capSum || a.bigTrucks - b.bigTrucks);
  return fleets.map((f) => f.fleet);
};

// ---------------------------------------------------------------------------------------------
// Packing a fixed fleet
// ---------------------------------------------------------------------------------------------

// Deterministic seeds: an item ordering paired with an orientation bias. Floor-bound (low
// stackLevel) items always go first so they claim base space; varying the tiebreak and bias gives
// a tight fleet several chances to pack fully before we escalate to a bigger one.
// Ordering: lowest stackLevel first (heavy bases claim the floor), but the awkward load-last groups
// are forced to the very end regardless of level — first closed-top base items, then plants — so they
// pack after everything else. Within a load-last group the TALLEST goes first (loads deepest / sits
// against the wall); normal cargo stays heavy-first by stack level. `loadOrder` is the fixed part of
// every ordering; callers append their own final tiebreak (volume, footprint, …).
const loadRank = (item) => (isLoadLast(item) ? 2 : isClosedBase(item) ? 1 : 0);
const loadOrder = (a, b) => {
  const ra = loadRank(a);
  const rb = loadRank(b);
  if (ra !== rb) return ra - rb;
  return ra > 0 ? b.shape.height - a.shape.height : a.stackLevel - b.stackLevel;
};
const byLevel = (cmp) => (items) => [...items].sort((a, b) => loadOrder(a, b) || cmp(a, b));

// "Effective wall height" of a floor-bound item — how tall a column it ultimately contributes to
// the back wall. An open-top base gets boxes piled on it up to the roof, so it effectively reaches
// full height (ranked above every closed item); a closed-top base only ever stands its own height,
// since nothing can rest above it. Ordering floor items by this descending — and placing them with
// the greedy back-hugging score — makes the load DESCEND back→front (open-top stacks deepest, then
// the tallest closed bases, down to the shortest at the doors), i.e. a clean wedge with no
// short-item-in-the-middle gaps and no tall-item stranded up front.
const EFFECTIVE_ROOF = 1e6;
const effectiveHeight = (item) => (item.openTop ? EFFECTIVE_ROOF : 0) + item.shape.height;

const longestDim = (item) => Math.max(item.shape.width, item.shape.depth, item.shape.height);

// Candidate orderings, all preserving heavy-first (lowest stackLevel placed first, so bases claim
// the floor before anything stacks). The exhaustive search crosses these with the orientation
// biases below, then with seeded-random restarts, and keeps whichever full pack scores best on
// layoutScore. Each is a deterministic comparator so the first (and usually best) candidates are
// fully reproducible run-to-run.
const COMPARATORS = [
  (a, b) => volumeCells(b) - volumeCells(a),
  (a, b) => footprintCells(b) - footprintCells(a) || b.shape.height - a.shape.height,
  (a, b) => b.shape.height - a.shape.height,
  (a, b) => longestDim(b) - longestDim(a),
  (a, b) => effectiveHeight(b) - effectiveHeight(a) || volumeCells(b) - volumeCells(a),
];
const BIASES = [null, 'wide', 'deep', 'tall'];

// Deterministic, ordered list of the "structured" seeds (comparator × bias) tried before any random
// restart, so a given load packs the same way every time it is small enough to exhaust them.
const STRUCTURED_SEEDS = [];
for (const cmp of COMPARATORS) {
  for (const bias of BIASES) STRUCTURED_SEEDS.push({ order: byLevel(cmp), bias });
}

// A small, diverse subset used only to decide feasibility (does the load fit a fleet?). Spans the
// comparators and biases so it rarely under-counts, but is ~5× cheaper than the full set — feasibility
// is run across several candidate fleets, so it must stay fast or it dominates the time budget.
const FEASIBILITY_SEEDS = [
  { order: byLevel(COMPARATORS[0]), bias: null },   // volume, neutral
  { order: byLevel(COMPARATORS[1]), bias: 'wide' }, // footprint, wide
  { order: byLevel(COMPARATORS[2]), bias: 'tall' }, // height, stand up
  { order: byLevel(COMPARATORS[4]), bias: 'deep' }, // effective-height, deep
];

// Tiny, fast, seedable PRNG (mulberry32) so random restarts are reproducible across runs/machines.
const mulberry32 = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const makeFleetTrucks = (fleetSizes) =>
  fleetSizes.map((size, index) => ({
    ...size,
    key: `${size.id}-${index}`,
    grid: makeTruckGrid(size.cellsX, size.cellsY, size.cellsZ),
    items: [],
    usedVolume: 0,
  }));

// Pack one ordering of items into the supplied (fresh) trucks. Items consolidate: an item only
// opens a fresh (empty) truck when it fits no already-opened one, so loads fill trucks densely
// rather than scattering thinly across them. Within the opened trucks it takes the lowest/tightest
// placement. Returns { trucks, unplaced, placed }.
const tryInTrucks = (item, trucks, opened, bias) => {
  let bestTruck = null;
  let bestPlacement = null;
  let bestScore = null;
  for (const truck of trucks) {
    if ((truck.items.length > 0) !== opened) continue;
    // Volume cap guards against the cell grid accepting items the real m3 figure can't fit.
    if (truck.usedVolume + item.volume > truck.capacity + 0.01) continue;
    if (!fitsSize(item, truck)) continue;
    const placement = tryPlace(truck.grid, item, bias);
    if (!placement) continue;
    const score = placement.score;
    if (!bestTruck || compareScores(score, bestScore) < 0) {
      bestTruck = truck;
      bestPlacement = placement;
      bestScore = score;
    }
  }
  return bestTruck ? { truck: bestTruck, placement: bestPlacement } : null;
};

const packOnce = (sortedItems, trucks, bias) => {
  const unplaced = [];
  for (const item of sortedItems) {
    // Prefer an already-opened truck; only break into an empty one if nothing open fits.
    const chosen = tryInTrucks(item, trucks, true, bias) || tryInTrucks(item, trucks, false, bias);
    if (!chosen) {
      unplaced.push(item);
      continue;
    }
    const bestTruck = chosen.truck;
    const bestPlacement = chosen.placement;
    commitPlacement(bestTruck.grid, item, bestPlacement);
    bestTruck.usedVolume += item.volume;
    bestTruck.items.push({
      ...item,
      x: bestPlacement.x,
      y: bestPlacement.y,
      z: bestPlacement.z,
      width: bestPlacement.oriented.width,
      depth: bestPlacement.oriented.depth,
      height: bestPlacement.oriented.height,
      rotation: bestPlacement.oriented.rotation,
      rotated: bestPlacement.oriented.rotation % 2 === 1,
      flip: bestPlacement.oriented.flip,
      yaw: bestPlacement.oriented.yaw,
      sequence: bestTruck.items.length,
    });
  }
  return { trucks, unplaced, placed: sortedItems.length - unplaced.length };
};

// ---------------------------------------------------------------------------------------------
// Layout quality — how to choose between layouts that ALL pack everything into the same fleet.
// ---------------------------------------------------------------------------------------------
//
// This encodes how a removalist actually wants the truck to look. It NEVER changes truck count or
// fleet size (decided first, deterministically) — it only ranks equally-feasible full packs. Lower
// is better. The drivers, in plain terms:
//   - trapped air: empty cells trapped under cargo → hollow, unstable. Penalize hard.
//   - roughness: how jagged the skyline is — the sum of height steps between neighbouring columns.
//     Minimizing it bans the "tall, short, tall, short" sawtooth and yields a smooth 10-9-6-2 ramp.
//   - back-load: mass hugging the back wall (the wedge: full at the back, tapering to the doors).
//   - stack height: reward piling occupied columns high (dense, few half-empty columns).
//   - wall contact: reward heavy floor items (low stackLevel — beds, fridges, sofas) whose footprint
//     touches a wall, and reward standing-up tall items, so the heavy/upright pieces ride the walls.
// Weights are gathered here so they are easy to retune against packing.diag.mjs.
const W_TRAPPED = 8;
const W_ROUGH = 3;
const W_BACKLOAD = 2;
const W_HEIGHT = 2;   // subtracted (reward)
const W_WALL = 1.5;   // subtracted (reward)
const HEAVY_LEVEL = 2; // stackLevel ≤ this counts as a "heavy base" for wall-contact scoring

const truckLayoutStats = (truck) => {
  const grid = truck.grid;
  const { W, D, H, voxels, columnTop } = grid;
  let occupied = 0;
  let trapped = 0;
  let backLoadSum = 0;
  let heightSum = 0;     // sum of column tops over NON-empty columns
  let nonEmptyCols = 0;
  for (let y = 0; y < D; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const top = columnTop[y * W + x];
      if (top > 0) { heightSum += top; nonEmptyCols += 1; }
      for (let z = 0; z < top; z += 1) {
        if (voxels[idx(W, D, x, y, z)] !== 0) {
          occupied += 1;
          backLoadSum += W > 1 ? x / (W - 1) : 0;
        } else {
          trapped += 1;
        }
      }
    }
  }
  // Skyline roughness: total absolute height step between horizontally adjacent columns (both axes).
  let roughness = 0;
  let pairs = 0;
  for (let y = 0; y < D; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const h = columnTop[y * W + x];
      if (x + 1 < W) { roughness += Math.abs(h - columnTop[y * W + x + 1]); pairs += 1; }
      if (y + 1 < D) { roughness += Math.abs(h - columnTop[(y + 1) * W + x]); pairs += 1; }
    }
  }
  // Wall contact: fraction of heavy floor items whose footprint touches a wall, with a bonus when a
  // tall item is actually standing up (its height is its largest dimension).
  let heavy = 0;
  let wallScore = 0;
  for (const it of truck.items) {
    if (it.z !== 0 || it.stackLevel > HEAVY_LEVEL) continue;
    heavy += 1;
    const touchesWall = it.x === 0 || it.y === 0 || it.x + it.width === W || it.y + it.depth === D;
    if (touchesWall) {
      const standingUp = it.height >= Math.max(it.width, it.depth);
      wallScore += standingUp ? 1.5 : 1;
    }
  }
  return {
    occupied,
    trapped,
    envelope: W * D * H,
    backLoadMean: occupied ? backLoadSum / occupied : 0,
    roughnessNorm: pairs ? roughness / (pairs * H) : 0,
    heightMean: nonEmptyCols ? heightSum / (nonEmptyCols * H) : 0,
    wallFrac: heavy ? wallScore / heavy : 0,
  };
};

// Returns [usedTrucks, aestheticScalar] — compared lexicographically (lower better). Keeping
// usedTrucks strictly first preserves consolidation; the scalar blends the weighted drivers above.
const layoutScore = (trucks) => {
  let used = 0;
  let trapped = 0;
  let envelope = 0;
  let occupied = 0;
  let backWeighted = 0;
  let roughWeighted = 0;
  let heightWeighted = 0;
  let wallWeighted = 0;
  for (const truck of trucks) {
    if (truck.items.length === 0) continue;
    used += 1;
    const s = truckLayoutStats(truck);
    trapped += s.trapped;
    envelope += s.envelope;
    occupied += s.occupied;
    backWeighted += s.backLoadMean * s.occupied;
    roughWeighted += s.roughnessNorm;
    heightWeighted += s.heightMean;
    wallWeighted += s.wallFrac;
  }
  const trappedNorm = envelope ? trapped / envelope : 0;
  const backMean = occupied ? backWeighted / occupied : 0;
  const roughMean = used ? roughWeighted / used : 0;
  const heightMean = used ? heightWeighted / used : 0;
  const wallMean = used ? wallWeighted / used : 0;
  const scalar =
    W_TRAPPED * trappedNorm +
    W_ROUGH * roughMean +
    W_BACKLOAD * backMean -
    W_HEIGHT * heightMean -
    W_WALL * wallMean;
  return [used, scalar];
};

// Fast feasibility pack: try a small diverse seed set and return the FIRST full pack (or the best
// partial). Used to decide truck count / fleet — cheap and deterministic, no aesthetic search.
const packFleetFast = (items, fleetSizes, seedList = FEASIBILITY_SEEDS) => {
  let bestPartial = null;
  for (const seed of seedList) {
    const result = packOnce(seed.order(items), makeFleetTrucks(fleetSizes), seed.bias);
    if (result.unplaced.length === 0) return result;
    if (!bestPartial || result.placed > bestPartial.placed) bestPartial = result;
  }
  return bestPartial;
};

// Map a bias gene (a key in [0,1)) to one of the orientation biases.
const biasFromKey = (k) => BIASES[Math.min(BIASES.length - 1, Math.floor(k * BIASES.length))];
const keyForBias = (bias) => (BIASES.indexOf(bias) + 0.5) / BIASES.length;

// BRKGA tuning. Population scales with load; the fractions are the standard BRKGA split.
const GA = { minPop: 16, maxPop: 48, eliteFrac: 0.2, mutantFrac: 0.2, rho: 0.7, stallGens: 25 };

// Time-budgeted Biased Random-Key Genetic Algorithm for the best-LOOKING full pack of a FIXED fleet.
//
// A genome is a vector of random keys (one per item) + one bias key. It DECODES to a packing by
// sorting items by (loadOrder, key asc) — so heavy bases and load-last groups stay fixed, but the search controls
// the order WITHIN each weight class — then greedily packing with the chosen orientation bias. Fitness
// is layoutScore (feasible packs always beat partial ones). Each generation keeps the elite genomes,
// injects fresh random "mutants" (exploration), and fills the rest with biased crossover of an elite
// and a non-elite parent (exploitation) — so good orderings are inherited and refined rather than
// rediscovered from scratch, which is the whole point over the old independent random restarts.
// Generation 0 is warm-started from the deterministic STRUCTURED_SEEDS, so it starts at least as good
// as the previous approach. Stops on time budget or a no-improvement stall. Seeded RNG → reproducible.
const searchBestLayout = (items, fleetSizes, { budgetMs = 1200, tick } = {}) => {
  const start = Date.now();
  const overBudget = () => Date.now() - start >= budgetMs;
  const n = items.length;
  const rng = mulberry32(0x9e3779b1);

  const pop = Math.max(GA.minPop, Math.min(GA.maxPop, n));
  const eliteCount = Math.max(1, Math.round(pop * GA.eliteFrac));
  const mutantCount = Math.max(1, Math.round(pop * GA.mutantFrac));

  // Fitness as a comparable tuple (lower better): feasible → [0, usedTrucks, aestheticScalar];
  // infeasible → [1, -placed, 0] so any feasible layout beats any partial, and fuller partials win.
  const evaluate = (g) => {
    const order = items
      .map((it, i) => ({ it, k: g.keys[i] }))
      .sort((a, b) => loadOrder(a.it, b.it) || a.k - b.k)
      .map((x) => x.it);
    const result = packOnce(order, makeFleetTrucks(fleetSizes), biasFromKey(g.biasKey));
    g.result = result;
    g.fitness = result.unplaced.length === 0 ? [0, ...layoutScore(result.trucks)] : [1, -result.placed, 0];
    return g;
  };

  const randomGenome = () => {
    const keys = new Float64Array(n);
    for (let i = 0; i < n; i += 1) keys[i] = rng();
    return evaluate({ keys, biasKey: rng() });
  };

  // Warm start: encode each structured seed's ordering as keys (global rank → key) so the genome
  // decodes back to that exact ordering, and set its bias gene to match.
  const encodeSeed = (seed) => {
    const ordered = seed.order(items);
    const rank = new Map();
    ordered.forEach((it, i) => rank.set(it, (i + 0.5) / n));
    const keys = new Float64Array(n);
    items.forEach((it, i) => { keys[i] = rank.get(it); });
    return evaluate({ keys, biasKey: keyForBias(seed.bias) });
  };

  let population = [];
  for (const seed of STRUCTURED_SEEDS) {
    if (population.length >= pop || overBudget()) break;
    population.push(encodeSeed(seed));
  }
  while (population.length < pop && !overBudget()) population.push(randomGenome());
  population.sort((a, b) => compareScores(a.fitness, b.fitness));

  let stall = 0;
  while (!overBudget() && stall < GA.stallGens) {
    const elites = population.slice(0, eliteCount);
    const next = elites.slice();
    for (let m = 0; m < mutantCount && !overBudget(); m += 1) next.push(randomGenome());
    while (next.length < pop && !overBudget()) {
      const elite = elites[Math.floor(rng() * eliteCount)];
      const other = population[eliteCount + Math.floor(rng() * (pop - eliteCount))] || population[0];
      const keys = new Float64Array(n);
      for (let i = 0; i < n; i += 1) keys[i] = rng() < GA.rho ? elite.keys[i] : other.keys[i];
      const biasKey = rng() < GA.rho ? elite.biasKey : other.biasKey;
      next.push(evaluate({ keys, biasKey }));
    }
    next.sort((a, b) => compareScores(a.fitness, b.fitness));
    const improved = compareScores(next[0].fitness, population[0].fitness) < 0;
    population = next;
    stall = improved ? 0 : stall + 1;
    if (tick) tick();
  }

  return population.length ? population[0].result : null;
};

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

// Smallest empty box (in 10cm cells) that counts as genuinely reusable free space. Anything smaller
// — slivers under the roof, notches between unevenly stacked boxes, thin gaps wedged between cargo —
// is space you can't actually fit another item into, so it's counted as USED. 5 cells ≈ a 50cm cube
// (about the smallest carton/nightstand). Bump this up to count more space as used, down for less.
const MIN_FREE_CELL = 5;

// "Usable-space" accounting for the capacity meter — what's actually consumed, not raw item volume.
// Free space is only the empty space you could really put another item into. Two filters:
//
//   1. Reachability. An empty cell is a free CANDIDATE only if it rests on the floor or on top of an
//      OPEN-TOP item — i.e. something could be placed/stacked there. Air above a CLOSED-TOP item (a
//      plant, lamp, anything you can't pile onto) is unreachable: the whole column above it is used.
//      Trapped air below cargo (the cave under a table) isn't a candidate either — it sits beneath
//      the column top, not on a support surface — so it's used too.
//
//   2. Large-rectangle test (morphological opening). A candidate cell only stays free if it belongs
//      to at least one fully-candidate MIN_FREE_CELL³ box — a rectangle actually big enough to hold
//      an item. Slivers and narrow notches fit no such box, so they fall back to used. A 3D prefix
//      sum makes the "is this whole box free?" test O(1) per anchor.
//
// Returns { used, total } in cells; used / total is the fill %.
const computeTruckUsage = (grid) => {
  const { W, D, H, columnTop } = grid;
  const total = W * D * H;

  // (1) Candidate-free mask.
  const candidate = new Uint8Array(total);
  for (let y = 0; y < D; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const top = columnTop[y * W + x];
      if (top > 0) {
        const topItem = itemAt(grid, x, y, top - 1);
        if (!topItem || !topItem.openTop) continue; // closed top → column above is unreachable
      }
      for (let z = top; z < H; z += 1) candidate[idx(W, D, x, y, z)] = 1;
    }
  }

  const m = MIN_FREE_CELL;
  if (W < m || D < m || H < m) return { used: total, total }; // no real item fits anywhere

  // (2) 3D prefix sum over the candidate mask: P[x,y,z] = candidates in [0,x)×[0,y)×[0,z).
  const pw = W + 1;
  const pd = D + 1;
  const P = new Int32Array(pw * pd * (H + 1));
  const pIdx = (x, y, z) => (z * pd + y) * pw + x;
  for (let z = 1; z <= H; z += 1) {
    for (let y = 1; y <= D; y += 1) {
      for (let x = 1; x <= W; x += 1) {
        P[pIdx(x, y, z)] = candidate[idx(W, D, x - 1, y - 1, z - 1)]
          + P[pIdx(x - 1, y, z)] + P[pIdx(x, y - 1, z)] + P[pIdx(x, y, z - 1)]
          - P[pIdx(x - 1, y - 1, z)] - P[pIdx(x - 1, y, z - 1)] - P[pIdx(x, y - 1, z - 1)]
          + P[pIdx(x - 1, y - 1, z - 1)];
      }
    }
  }
  const boxSum = (x0, y0, z0, x1, y1, z1) =>
    P[pIdx(x1, y1, z1)] - P[pIdx(x0, y1, z1)] - P[pIdx(x1, y0, z1)] - P[pIdx(x1, y1, z0)]
    + P[pIdx(x0, y0, z1)] + P[pIdx(x0, y1, z0)] + P[pIdx(x1, y0, z0)] - P[pIdx(x0, y0, z0)];

  // Dilate every fully-candidate m³ box back over its cells: a cell is truly free iff some such box
  // covers it (the opening of the candidate set by an m³ structuring element).
  const usable = new Uint8Array(total);
  const need = m * m * m;
  for (let z = 0; z + m <= H; z += 1) {
    for (let y = 0; y + m <= D; y += 1) {
      for (let x = 0; x + m <= W; x += 1) {
        if (boxSum(x, y, z, x + m, y + m, z + m) !== need) continue;
        for (let dz = 0; dz < m; dz += 1) {
          for (let dy = 0; dy < m; dy += 1) {
            for (let dx = 0; dx < m; dx += 1) usable[idx(W, D, x + dx, y + dy, z + dz)] = 1;
          }
        }
      }
    }
  }

  let freeCount = 0;
  for (let i = 0; i < total; i += 1) freeCount += usable[i];
  return { used: total - freeCount, total };
};

const collapsePlan = (trucks) => {
  const order = [];
  const byId = new Map();
  for (const truck of trucks) {
    let entry = byId.get(truck.id);
    if (!entry) {
      entry = { ...truck, count: 0 };
      delete entry.grid;
      delete entry.items;
      byId.set(truck.id, entry);
      order.push(entry);
    }
    entry.count += 1;
  }
  return order;
};

const finalize = (packResult, unplaced) => {
  const used = packResult.trucks.filter((truck) => truck.items.length > 0);
  const multiple = used.length > 1;
  const seen = new Map();
  const trucks = used.map((truck) => {
    const n = (seen.get(truck.id) || 0) + 1;
    seen.set(truck.id, n);
    const sameSize = used.filter((t) => t.id === truck.id).length;
    const usage = computeTruckUsage(truck.grid);
    return {
      ...truck,
      label: truck.name + ' Truck' + (multiple && sameSize > 1 ? ` ${n}` : ''),
      usedCells: usage.used,
      gridCells: usage.total,
    };
  });
  return { trucks, plan: collapsePlan(used), unplaced: unplaced || [] };
};

// Cheapest fleet from the lower bounds alone — no voxel packing. Drives the live sidebar
// recommendation so App.vue never has to guess a fleet independently.
export const estimateFleet = (items, truckSizes) => {
  if (!items.length) return [];
  const sizes = [...truckSizes].sort((a, b) => a.capacity - b.capacity);
  const bounds = computeBounds(items, sizes);
  const fleets = candidateFleets(bounds.nMin, sizes, bounds);
  const fleet = fleets.length
    ? fleets[0]
    : Array.from({ length: bounds.nMin }, () => sizes[sizes.length - 1]);
  // Reuse the finalize plan-collapse by faking truck objects with an empty items array marker.
  const order = [];
  const byId = new Map();
  for (const size of fleet) {
    let entry = byId.get(size.id);
    if (!entry) {
      entry = { ...size, count: 0 };
      byId.set(size.id, entry);
      order.push(entry);
    }
    entry.count += 1;
  }
  return order;
};

// Choose the cheapest feasible fleet (fewest trucks, then smallest total size), then spend the time
// budget searching for the best-LOOKING way to load that fleet. Returns { trucks, plan, unplaced }
// with each placed item carrying x/y/z, oriented width/depth/height, rotation/rotated, sequence and
// all original fields.
//
// Options:
//   budgetMs   — soft cap on TOTAL packing time (default 1200; the worker passes ~15000). Fleet
//                selection (phases 1-2) is bounded too, then whatever time is left funds the
//                aesthetic search (phase 3), so the whole call stays near budgetMs.
//   onProgress — ({ fraction, etaMs }) callback for the loading bar. Progress is TIME-based against
//                the whole budget and reported from every phase, so the bar advances smoothly and the
//                ETA is simply the time left in the budget (the bar snaps to 100% if a load converges
//                early). Throttled to ~60ms.
// Truck COUNT and fleet SIZE are decided by fast deterministic feasibility packs, so they are stable
// run-to-run regardless of the budget; only the final layout depends on how long the search runs.
export const planAndPack = (items, { truckSizes, budgetMs = 1200, onProgress } = {}) => {
  const t0 = Date.now();
  let lastReport = 0;
  const emit = (done) => {
    if (!onProgress) return;
    const now = Date.now();
    if (!done && now - lastReport < 60) return;
    lastReport = now;
    const elapsed = now - t0;
    const fraction = done ? 1 : Math.min(0.99, elapsed / budgetMs);
    onProgress({ fraction, etaMs: done ? 0 : Math.max(0, budgetMs - elapsed) });
  };

  if (!items.length) {
    emit(true);
    return { trucks: [], plan: [], unplaced: [] };
  }
  const deadline = t0 + budgetMs;
  const sizes = [...truckSizes].sort((a, b) => a.capacity - b.capacity);
  const bounds = computeBounds(items, sizes);

  const largest = sizes[sizes.length - 1];
  const maxTrucks = bounds.nMin + 6; // hard cap so an impossibly large item can't loop forever
  let bestPartial = null;

  // Phase 1 — minimal truck COUNT (objective #1). All-largest fleets hold the most, so the first
  // count N at which N largest trucks pack everything is the true lower bound on truck count.
  let count = 0;
  for (let n = bounds.nMin; n <= maxTrucks; n += 1) {
    const result = packFleetFast(items, Array.from({ length: n }, () => largest));
    emit(false);
    if (result && result.unplaced.length === 0) { count = n; break; }
    if (!bestPartial || (result && result.placed > bestPartial.placed)) bestPartial = result;
  }
  if (!count) {
    emit(true);
    return finalize(bestPartial, bestPartial ? bestPartial.unplaced : items);
  }

  // Phase 2 — cheapest fleet of that COUNT (objective #2). Candidates are sorted by total size
  // ascending; the first that packs everything (fast feasibility check) wins. Bounded so probing
  // fleets that DON'T pack can't starve the aesthetic search — reserve most of the budget for it.
  const feasDeadline = Date.now() + Math.max(200, (deadline - Date.now()) * 0.4);
  const fleets = candidateFleets(count, sizes, bounds).slice(0, 10);
  let chosenFleet = Array.from({ length: count }, () => largest); // all-largest always packs
  for (const fleet of fleets) {
    const result = packFleetFast(items, fleet);
    emit(false);
    if (result && result.unplaced.length === 0) { chosenFleet = fleet; break; }
    if (Date.now() > feasDeadline) break;
  }

  // Phase 3 — load the chosen fleet as nicely as possible with whatever time is left in the budget.
  const remaining = Math.max(300, deadline - Date.now());
  const best = searchBestLayout(items, chosenFleet, { budgetMs: remaining, tick: () => emit(false) });
  emit(true);
  return finalize(best, best ? best.unplaced : items);
};
