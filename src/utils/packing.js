// 3D voxel packer.
//
// Each truck has a flat Uint16Array `voxels` indexed by (z * D * W + y * W + x) holding either
// 0 (empty) or 1 + index into the per-truck items array. Items expose a precomputed voxel mask
// (list of [dx, dy, dz]) plus a bottomFootprint (columns whose lowest voxel is at dz=0 — these
// are the contact points that need a supporting surface below).
//
// Packing rules:
//   - Heaviest items go first (sorted DESC by weight).
//   - An item can only rest on items whose `openTop` is true.
//   - An item can only rest on items whose `weight >= this item's weight`
//     (heavy is never placed on light).
//   - Placement minimises (top-Z, then deep-Y, then far-X) so things settle low and to the
//     back-left corner.
//
// Trucks are filled greedily one at a time. If items overflow, a fresh "large" truck is added
// and the run repeats — this implements the "minimum trucks then lowest height" pass.

import { uniqueOrientations } from './shapes.js';

const idx = (W, D, x, y, z) => z * D * W + y * W + x;

const makeTruckGrid = (cellsX, cellsY, cellsZ) => ({
  W: cellsX,
  D: cellsY,
  H: cellsZ,
  voxels: new Uint16Array(cellsX * cellsY * cellsZ),
  columnTop: new Uint16Array(cellsX * cellsY), // highest occupied dz + 1 per (x, y) — fast lower bound for z_rest
  items: [], // 1-indexed in voxels; items[0] is sentinel
});

const cellEmpty = (grid, x, y, z) => grid.voxels[idx(grid.W, grid.D, x, y, z)] === 0;

const itemAt = (grid, x, y, z) => {
  const v = grid.voxels[idx(grid.W, grid.D, x, y, z)];
  return v === 0 ? null : grid.items[v - 1];
};

const writeVoxel = (grid, x, y, z, itemIndex) => {
  grid.voxels[idx(grid.W, grid.D, x, y, z)] = itemIndex + 1;
};

// Returns the lowest z_rest at which the given oriented shape can be placed at (x, y),
// or null if it cannot fit anywhere in the column. Verifies bounds, voxel collisions, and
// the support contract (open_top + weight) for every bottom-footprint cell.
const findLowestZ = (grid, shape, x, y, item) => {
  if (x < 0 || y < 0) return null;
  if (x + shape.width > grid.W) return null;
  if (y + shape.depth > grid.D) return null;

  // Lower bound: the highest columnTop across all footprint cells (the item can't sink below
  // the tallest existing stack under its footprint).
  let zLower = 0;
  for (const [dx, dy] of shape.bottomFootprint) {
    const top = grid.columnTop[(y + dy) * grid.W + (x + dx)];
    if (top > zLower) zLower = top;
  }
  // Also consider the lowest "ceiling" any voxel could rest under — but since we want the
  // lowest valid z, just scan upward from zLower.

  const maxZ = grid.H - shape.height;
  for (let z = zLower; z <= maxZ; z += 1) {
    if (placementOK(grid, shape, x, y, z, item)) return z;
  }
  return null;
};

const placementOK = (grid, shape, x, y, z, item) => {
  // 1. No voxel collisions.
  for (const [dx, dy, dz] of shape.voxels) {
    if (!cellEmpty(grid, x + dx, y + dy, z + dz)) return false;
  }
  // 2. Support contract.
  if (z === 0) return true; // floor supports anything
  for (const [dx, dy] of shape.bottomFootprint) {
    const supporter = itemAt(grid, x + dx, y + dy, z - 1);
    if (!supporter) return false;            // floating in the air → reject
    if (!supporter.openTop) return false;    // can't put anything on top of this item
    if (supporter.weight < item.weight) return false; // heavy can't sit on light
  }
  return true;
};

// Count cells where the placed item touches a wall, the floor, or an existing item.
// Higher contact = tighter fit, less wasted space. Used as a strong tiebreaker after height.
const contactCount = (grid, shape, x, y, z) => {
  let contacts = 0;
  for (const [dx, dy, dz] of shape.voxels) {
    const cx = x + dx;
    const cy = y + dy;
    const cz = z + dz;
    // walls
    if (cx === 0 || cx === grid.W - 1) contacts += 1;
    if (cy === 0 || cy === grid.D - 1) contacts += 1;
    if (cz === 0) contacts += 1;
    // neighbours (only count an existing-item contact if the neighbour cell is in-bounds and occupied)
    if (cx > 0 && grid.voxels[idx(grid.W, grid.D, cx - 1, cy, cz)] !== 0) contacts += 1;
    if (cx < grid.W - 1 && grid.voxels[idx(grid.W, grid.D, cx + 1, cy, cz)] !== 0) contacts += 1;
    if (cy > 0 && grid.voxels[idx(grid.W, grid.D, cx, cy - 1, cz)] !== 0) contacts += 1;
    if (cy < grid.D - 1 && grid.voxels[idx(grid.W, grid.D, cx, cy + 1, cz)] !== 0) contacts += 1;
    if (cz > 0 && grid.voxels[idx(grid.W, grid.D, cx, cy, cz - 1)] !== 0) contacts += 1;
  }
  return contacts;
};

const scorePlacement = (grid, shape, x, y, z) => [
  z + shape.height,                   // 1. minimise top height
  -contactCount(grid, shape, x, y, z), // 2. maximise contact (negate so smaller = better)
  y + shape.depth,                    // 3. prefer back of truck
  x + shape.width,                    // 4. prefer left of truck
];

const compareScores = (a, b) => {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
};

const tryPlace = (grid, item) => {
  let best = null;
  for (const oriented of uniqueOrientations(item.shape)) {
    for (let y = 0; y <= grid.D - oriented.depth; y += 1) {
      for (let x = 0; x <= grid.W - oriented.width; x += 1) {
        const z = findLowestZ(grid, oriented, x, y, item);
        if (z === null) continue;
        const score = scorePlacement(grid, oriented, x, y, z);
        if (!best || compareScores(score, best.score) < 0) {
          best = { x, y, z, oriented, score };
        }
      }
    }
  }
  return best;
};

const commitPlacement = (grid, item, placement) => {
  const itemIndex = grid.items.length;
  grid.items.push(item);
  const { x, y, z, oriented } = placement;
  for (const [dx, dy, dz] of oriented.voxels) {
    writeVoxel(grid, x + dx, y + dy, z + dz, itemIndex);
  }
  // Update columnTop using the oriented voxel mask.
  for (const [dx, dy, dz] of oriented.voxels) {
    const colIdx = (y + dy) * grid.W + (x + dx);
    const top = z + dz + 1;
    if (top > grid.columnTop[colIdx]) grid.columnTop[colIdx] = top;
  }
};

// Pack a list of items (already sorted heaviest-first) into the supplied trucks. Each truck is
// {id, name, capacity, cellsX, cellsY, cellsZ, ...}. Returns { packedTrucks, unplaced }.
const packIntoTrucks = (sortedItems, truckTemplates) => {
  const trucks = truckTemplates.map((tpl, index) => ({
    ...tpl,
    key: `${tpl.id}-${index}`,
    label: tpl.label || `${tpl.name} Truck${truckTemplates.length > 1 ? ` ${index + 1}` : ''}`,
    grid: makeTruckGrid(tpl.cellsX, tpl.cellsY, tpl.cellsZ),
    items: [],
    usedVolume: 0,
  }));

  const unplaced = [];

  for (const item of sortedItems) {
    let placedTruck = null;
    let placement = null;
    for (const truck of trucks) {
      // Volume cap acts as a sanity check — cell-quantised dimensions can be coarser than the
      // real m3 figure on each item, so without this guard the voxel grid would happily accept
      // items that physically wouldn't fit.
      if (truck.usedVolume + item.volume > truck.capacity + 0.01) continue;
      const result = tryPlace(truck.grid, item);
      if (result) {
        placedTruck = truck;
        placement = result;
        break;
      }
    }
    if (!placedTruck) {
      unplaced.push(item);
      continue;
    }
    commitPlacement(placedTruck.grid, item, placement);
    placedTruck.usedVolume += item.volume;
    placedTruck.items.push({
      ...item,
      x: placement.x,
      y: placement.y,
      z: placement.z,
      width: placement.oriented.width,
      depth: placement.oriented.depth,
      height: placement.oriented.height,
      rotation: placement.oriented.rotation,
      rotated: placement.oriented.rotation % 2 === 1,
      sequence: placedTruck.items.length,
    });
  }

  return { trucks, unplaced };
};

// Two-pass entry point: start with a volume-based truck count, retry with one more truck each
// time anything spills over. Stops when everything is placed (or we hit a hard cap to avoid
// infinite loops on impossibly-large items).
export const planAndPack = (items, { truckSizes, recommendedPlan, fallbackTruck }) => {
  const sortedItems = [...items].sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    // tiebreak: bigger volume first, helps tightly fill bottom layers
    const volA = a.shape.width * a.shape.depth * a.shape.height;
    const volB = b.shape.width * b.shape.depth * b.shape.height;
    return volB - volA;
  });

  const expand = (plan) =>
    plan.flatMap((entry) =>
      Array.from({ length: entry.count }, (_, i) => ({
        ...entry,
        label: entry.count > 1 ? `${entry.name} Truck ${i + 1}` : `${entry.name} Truck`,
      })),
    );

  let plan = recommendedPlan.length ? [...recommendedPlan] : [{ ...fallbackTruck, count: 1 }];
  const maxAttempts = 12;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const truckTemplates = expand(plan);
    const { trucks, unplaced } = packIntoTrucks(sortedItems, truckTemplates);
    if (unplaced.length === 0) {
      return { trucks: trucks.filter((t) => t.items.length), plan };
    }
    // Try the next bigger truck size, or add one more of the largest size.
    const largest = truckSizes[truckSizes.length - 1];
    const last = plan[plan.length - 1];
    if (last && last.id === largest.id) {
      plan = [...plan.slice(0, -1), { ...last, count: last.count + 1 }];
    } else {
      // Upgrade: replace the last entry with one fewer + one large, OR just add a large.
      plan = [...plan, { ...largest, count: 1 }];
    }
  }

  // Hard cap reached — pack with what we have and return whatever fit.
  const { trucks } = packIntoTrucks(sortedItems, expand(plan));
  return { trucks: trucks.filter((t) => t.items.length), plan };
};
