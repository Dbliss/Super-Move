// Standalone constraint + objective tests for the packer/selector.
// Run: node src/utils/packing.test.mjs
import { buildShape, buildComposite } from './shapes.js';
import { planAndPack, estimateFleet } from './packing.js';

// Truck catalog mirrors App.vue truckSizes + buildTruckTemplate (10 cm cells).
const cellsOf = (m) => Math.max(1, Math.round((m * 100) / 10));
const truckSizes = [
  { id: 'small', name: 'Small', capacity: 18, cargoLength: 4.1, cargoWidth: 2.2, cargoHeight: 2.1 },
  { id: 'medium', name: 'Medium', capacity: 32, cargoLength: 6.2, cargoWidth: 2.35, cargoHeight: 2.25 },
  { id: 'large', name: 'Large', capacity: 50, cargoLength: 8.8, cargoWidth: 2.4, cargoHeight: 2.4 },
].map((t) => ({ ...t, cellsX: cellsOf(t.cargoLength), cellsY: cellsOf(t.cargoWidth), cellsZ: cellsOf(t.cargoHeight) }));

let idc = 0;
const unit = (wCm, dCm, hCm, { stackLevel = 5, openTop = true, template = 'box' } = {}) => {
  const shape = buildShape(template, Math.ceil(wCm / 10), Math.ceil(dCm / 10), Math.ceil(hCm / 10));
  return {
    key: `u${idc++}`, id: `item-${template}`, asset: 'a', name: 'n', shape,
    width: shape.width, depth: shape.depth, height: shape.height,
    stackLevel, openTop, volume: (wCm * dCm * hCm) / 1_000_000,
  };
};
const many = (n, fn) => Array.from({ length: n }, fn);

// --- constraint checker: re-derives oriented voxels from each item's stored rotation. ---
const idx = (W, D, x, y, z) => z * D * W + y * W + x;
const fromVoxels = (voxels) => {
  let width = 0, depth = 0, height = 0;
  const low = new Map();
  for (const [dx, dy, dz] of voxels) {
    width = Math.max(width, dx + 1); depth = Math.max(depth, dy + 1); height = Math.max(height, dz + 1);
    const k = `${dx},${dy}`;
    if (!low.has(k) || dz < low.get(k)) low.set(k, dz);
  }
  const bottomFootprint = [];
  for (const [k, mz] of low) if (mz === 0) bottomFootprint.push(k.split(',').map(Number));
  return { voxels, width, depth, height, bottomFootprint };
};
const rotateCW = (shape) => fromVoxels(shape.voxels.map(([dx, dy, dz]) => [shape.depth - 1 - dy, dx, dz]));
const orientedShape = (item) => {
  let s = item.shape;
  for (let i = 0; i < (item.rotation || 0); i += 1) s = rotateCW(s);
  return s;
};

const checkTruck = (truck) => {
  const W = truck.cellsX, D = truck.cellsY, H = truck.cellsZ;
  const grid = new Int32Array(W * D * H).fill(-1);
  truck.items.forEach((item, ii) => {
    const shape = orientedShape(item);
    for (const [dx, dy, dz] of shape.voxels) {
      const x = item.x + dx, y = item.y + dy, z = item.z + dz;
      if (x < 0 || y < 0 || z < 0 || x >= W || y >= D || z >= H) throw new Error(`out of bounds in ${truck.name}`);
      const c = idx(W, D, x, y, z);
      if (grid[c] !== -1) throw new Error(`overlap at ${x},${y},${z} in ${truck.name}`);
      grid[c] = ii;
    }
  });
  truck.items.forEach((item) => {
    const shape = orientedShape(item);
    if (item.z === 0) return;
    for (const [dx, dy] of shape.bottomFootprint) {
      const x = item.x + dx, y = item.y + dy, z = item.z - 1;
      const supIdx = z >= 0 ? grid[idx(W, D, x, y, z)] : -1;
      if (supIdx === -1) throw new Error(`floating foot: ${item.name} z=${item.z}`);
      const sup = truck.items[supIdx];
      if (!sup.openTop) throw new Error(`stacked on closed top in ${truck.name}`);
      if (sup.stackLevel > item.stackLevel) throw new Error(`stack-level violation L${item.stackLevel} on L${sup.stackLevel}`);
      if (sup.stackLevel === item.stackLevel && item.stackLevel === 0) throw new Error(`level-0 base items stacked in ${truck.name}`);
    }
  });
  truck.items.forEach((item) => {
    if (item.width > W || item.depth > D || item.height > H) throw new Error(`item does not fit truck: ${item.name}`);
  });
};

const totalSize = (plan) => plan.reduce((s, t) => s + t.capacity * t.count, 0);
const planStr = (plan) => plan.map((t) => `${t.count}x${t.name}`).join('+') || '(none)';

let failures = 0;
const run = (label, items, expect) => {
  const { trucks, plan, unplaced } = planAndPack(items, { truckSizes });
  const est = estimateFleet(items, truckSizes);
  for (const t of trucks) checkTruck(t);
  const ok = unplaced.length === 0
    && (expect.maxTrucks === undefined || trucks.length <= expect.maxTrucks)
    && (expect.fleet === undefined || planStr(plan) === expect.fleet);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: ${items.length} items -> ${planStr(plan)} `
    + `(${trucks.length} trucks, size ${totalSize(plan)}, unplaced ${unplaced.length}) | estimate ${planStr(est)}`);
  if (!ok) console.log('   expected', JSON.stringify(expect));
};

console.log('--- constraint + objective tests ---');
run('light load -> one Small', many(3, () => unit(60, 60, 60)), { fleet: '1xSmall' });
run('heavy load -> fewest trucks', many(40, () => unit(120, 90, 120, { stackLevel: 0 })), { maxTrucks: 3 });
run('many same-level non-stackable', many(20, () => unit(70, 70, 80, { stackLevel: 3, openTop: false })), { maxTrucks: 1 });
run('oversized forces a Large', [unit(800, 200, 230, { stackLevel: 0 }), ...many(3, () => unit(50, 50, 50))], { fleet: '1xLarge' });

const lSofa = () => {
  const shape = buildComposite([
    { x: 0, y: 0, z: 0, w: 22, d: 9, h: 8 },
    { x: 0, y: 9, z: 0, w: 9, d: 13, h: 8 },
  ]);
  return {
    key: `u${idc++}`, id: 'lsofa', asset: 'a', name: 'L-sofa', shape,
    width: shape.width, depth: shape.depth, height: shape.height,
    stackLevel: 0, openTop: false, volume: (shape.voxels.length * 1000) / 1_000_000,
  };
};
run('composite L-sofas', many(4, lSofa), { maxTrucks: 1 });
run('stackable mix (bases + toppers)', [
  ...many(6, () => unit(100, 80, 60, { stackLevel: 0, openTop: true })),
  ...many(6, () => unit(50, 40, 40, { stackLevel: 5, openTop: true })),
], { maxTrucks: 1 });

// Same-level stackables (e.g. boxes, all level 10) must pile on each other: 60 boxes of ~0.08 m3
// are only ~5 m3 and trivially fit a single Small once they stack rather than tile the floor.
run('same-level boxes pile high', many(60, () => unit(45, 45, 40, { stackLevel: 10, openTop: true })),
  { fleet: '1xSmall' });

// Level-0 base items never stack on their own kind, so a floor-footprint-heavy pile of them needs
// enough floor area — they cannot all collapse into one column.
run('level-0 bases do not co-stack', many(30, () => unit(80, 70, 40, { stackLevel: 0, openTop: true })),
  { maxTrucks: 2 });

console.log(failures ? `\n${failures} FAILED` : '\nAll tests passed.');
process.exitCode = failures ? 1 : 0;
