// 3D voxel packer + truck-fleet selector.
//
// Each truck has a flat Uint16Array `voxels` indexed by (z * D * W + y * W + x) holding either
// 0 (empty) or 1 + index into the per-truck items array. Items expose a precomputed voxel mask
// (list of [dx, dy, dz]) plus a bottomFootprint (columns whose lowest voxel is at dz=0 — these
// are the contact points that need a supporting surface below).
//
// Packing rules:
//   - Each item has a `stackLevel` 0–10. An item may rest on the truck floor (base), or on top
//     of an item whose stackLevel is EQUAL OR LOWER than its own — so identical stackables (e.g.
//     boxes on boxes) pile up. The one exception is level 0: those are heavy base items (sofas,
//     beds, fridges) that ride the floor and never stack on their own kind.
//   - Lowest stackLevel goes first, so floor-bound items claim the base before anything stacks.
//   - An item can only rest on items whose `openTop` is true.
//   - Placement minimises (top-Z, then deep-Y, then far-X) so things settle low and to the
//     back-left corner.
//
// Fleet selection (the part that used to live half in App.vue, half in a retry loop here):
//   1. Derive lower bounds on the truck count from the load's real minimum requirements —
//      the dimensional floor (an item that only fits a Large forces a Large), the volume bound
//      (ceil(totalVolume / capacity)), and the floor-area bound (stackLevel-0 base items each
//      need floor footprint).
//   2. Search fleets upward from that floor, cheapest first by the strict objective:
//        (a) fewest trucks, (b) smallest total truck size, (c) lowest wasted space / height.
//      The first fleet that fully packs wins.

import { uniqueOrientations } from './shapes.js';

const idx = (W, D, x, y, z) => z * D * W + y * W + x;

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
    cached = uniqueOrientations(item.shape);
    orientationCache.set(item.shape, cached);
  }
  return cached;
};

// Returns the lowest z_rest at which the given oriented shape can be placed at (x, y),
// or null if it cannot fit anywhere in the column. Verifies bounds, voxel collisions, and
// the support contract (open_top + stack level) for every bottom-footprint cell.
const findLowestZ = (grid, shape, x, y, item) => {
  if (x < 0 || y < 0) return null;
  if (x + shape.width > grid.W) return null;
  if (y + shape.depth > grid.D) return null;

  // Scan from the floor up and take the lowest z that fits and is supported. We deliberately do
  // NOT skip ahead to columnTop here: an item may settle into a CAVE below an overhang (under a
  // table slab, between chair legs, inside an L-sofa's notch) where the column's top surface is
  // high but the space underneath is empty. Low-z checks fast-fail on the first collided voxel,
  // so the extra iterations are cheap.
  const maxZ = grid.H - shape.height;
  for (let z = 0; z <= maxZ; z += 1) {
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
  for (const [dx, dy] of shape.bottomFootprint) {
    const supporter = itemAt(grid, x + dx, y + dy, z - 1);
    if (!supporter) return false;                          // floating in the air → reject
    if (!supporter.openTop) return false;                  // can't put anything on top of this item
    // May rest on an item of equal-or-lower level — so identical stackables (boxes on boxes)
    // pile up. The one exception is level 0: those are heavy "base" items (sofas, beds, fridges)
    // that ride the floor and never stack on their own kind.
    if (supporter.stackLevel > item.stackLevel) return false;
    if (supporter.stackLevel === item.stackLevel && item.stackLevel === 0) return false;
  }
  return true;
};

// Deepest-bottom-left scoring. Lowest top wins (so loads settle low and stacks stay short), then
// an orientation bias lets a seed pack depth- or width-aligned (so uniform loads tile a truck
// fully rather than stranding a strip), then back-left tucking. This is cheap — no per-candidate
// voxel scan — which keeps placement interactive even for thousand-voxel items.
const scorePlacement = (grid, shape, x, y, z, orientBias) => [
  z + shape.height,                   // 1. minimise top height
  orientBias === 'deep' ? -shape.depth : orientBias === 'wide' ? -shape.width : 0, // 2. orientation bias
  z,                                  // 3. rest as low as possible
  y + shape.depth,                    // 4. prefer back of truck
  x + shape.width,                    // 5. prefer left of truck
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
const byLevel = (cmp) => (items) => [...items].sort((a, b) => a.stackLevel - b.stackLevel || cmp(a, b));
const seeds = [
  { order: byLevel((a, b) => volumeCells(b) - volumeCells(a)), bias: null },
  { order: byLevel((a, b) => footprintCells(b) - footprintCells(a) || b.shape.height - a.shape.height), bias: 'deep' },
  { order: byLevel((a, b) => footprintCells(b) - footprintCells(a)), bias: 'wide' },
];

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
      sequence: bestTruck.items.length,
    });
  }
  return { trucks, unplaced, placed: sortedItems.length - unplaced.length };
};

// Try to pack everything into the given fleet sizes, attempting each seed ordering until one
// fully succeeds. Returns the first full success, else the best partial.
const packFleet = (items, fleetSizes) => {
  let best = null;
  for (const seed of seeds) {
    const result = packOnce(seed.order(items), makeFleetTrucks(fleetSizes), seed.bias);
    if (result.unplaced.length === 0) return result;
    if (!best || result.placed > best.placed) best = result;
  }
  return best;
};

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

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
    return {
      ...truck,
      label: truck.name + ' Truck' + (multiple && sameSize > 1 ? ` ${n}` : ''),
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

// Choose the cheapest feasible fleet (fewest trucks, then smallest total size) and pack into it.
// Returns { trucks, plan, unplaced } with each placed item carrying x/y/z, oriented width/depth/
// height, rotation/rotated, sequence and all original fields.
export const planAndPack = (items, { truckSizes }) => {
  if (!items.length) return { trucks: [], plan: [], unplaced: [] };
  const sizes = [...truckSizes].sort((a, b) => a.capacity - b.capacity);
  const bounds = computeBounds(items, sizes);

  const largest = sizes[sizes.length - 1];
  const maxTrucks = bounds.nMin + 6; // hard cap so an impossibly large item can't loop forever
  let bestPartial = null;

  // Phase 1 — minimal truck COUNT (objective #1). All-largest fleets hold the most, so the first
  // count N at which N largest trucks pack everything is the true lower bound on truck count.
  let count = 0;
  let baseResult = null;
  for (let n = bounds.nMin; n <= maxTrucks; n += 1) {
    const result = packFleet(items, Array.from({ length: n }, () => largest));
    if (result.unplaced.length === 0) {
      count = n;
      baseResult = result;
      break;
    }
    if (!bestPartial || result.placed > bestPartial.placed) bestPartial = result;
  }
  if (!baseResult) return finalize(bestPartial, bestPartial ? bestPartial.unplaced : items);

  // Phase 2 — cheapest fleet of that COUNT (objective #2). Candidates are sorted by total size
  // ascending; the first that packs everything wins. The all-largest fleet is always last and is
  // known to pack (baseResult), so this terminates.
  const fleets = candidateFleets(count, sizes, bounds).slice(0, 10);
  for (const fleet of fleets) {
    const result = packFleet(items, fleet);
    if (result.unplaced.length === 0) return finalize(result, []);
  }
  return finalize(baseResult, []);
};
