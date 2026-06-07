// Diagnostic: pack a realistic mixed load into ONE large truck and print the spatial
// distribution along the length (x = back→front). We want a wedge: full at the back,
// tapering toward the doors, with NO interior gaps under occupied space.
import { buildShape } from './shapes.js';
import { planAndPack } from './packing.js';

const cellsOf = (m) => Math.max(1, Math.round((m * 100) / 10));
const truckSizes = [
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

// A realistic apartment load: a few floor-bound bases + lots of stackable boxes/medium items.
const load = [
  ...many(3, () => unit(200, 90, 70, { stackLevel: 0, openTop: false })),   // sofas
  ...many(2, () => unit(150, 200, 50, { stackLevel: 0, openTop: true })),   // mattresses (flat, open top)
  ...many(4, () => unit(80, 60, 120, { stackLevel: 0, openTop: false })),   // wardrobes / fridge
  ...many(10, () => unit(60, 50, 60, { stackLevel: 5, openTop: true })),    // medium boxes
  ...many(30, () => unit(45, 45, 40, { stackLevel: 10, openTop: true })),   // small boxes
];

const idx = (W, D, x, y, z) => z * D * W + y * W + x;
const rotateCW = (shape) => {
  const v = shape.voxels.map(([dx, dy, dz]) => [shape.depth - 1 - dy, dx, dz]);
  let width = 0, depth = 0, height = 0;
  for (const [dx, dy, dz] of v) { width = Math.max(width, dx + 1); depth = Math.max(depth, dy + 1); height = Math.max(height, dz + 1); }
  return { voxels: v, width, depth, height };
};
const orientedShape = (item) => {
  let s = item.shape;
  for (let i = 0; i < (item.rotation || 0); i += 1) s = rotateCW(s);
  return s;
};

const { trucks } = planAndPack(load, { truckSizes });
console.log(`Packed into ${trucks.length} truck(s).`);

for (const truck of trucks) {
  const W = truck.cellsX, D = truck.cellsY, H = truck.cellsZ;
  const grid = new Uint8Array(W * D * H);
  let filled = 0;
  for (const item of truck.items) {
    const s = orientedShape(item);
    for (const [dx, dy, dz] of s.voxels) {
      grid[idx(W, D, item.x + dx, item.y + dy, item.z + dz)] = 1;
      filled += 1;
    }
  }
  const total = W * D * H;
  console.log(`\n${truck.label}: ${truck.items.length} items, fill ${(100 * filled / total).toFixed(1)}% of envelope (${W}x${D}x${H})`);

  // Per-x-slice (back→front): occupied fraction of the y*z cross-section, and trapped-air count
  // (empty cells that sit BELOW an occupied cell in the same column — wasted, unstable gaps).
  const slabBins = 22; // ~4 cells each
  const binW = Math.ceil(W / slabBins);
  let trappedTotal = 0;
  const rows = [];
  for (let bx = 0; bx < W; bx += binW) {
    let occ = 0, cells = 0, trapped = 0;
    for (let x = bx; x < Math.min(W, bx + binW); x += 1) {
      for (let y = 0; y < D; y += 1) {
        // column top
        let top = -1;
        for (let z = H - 1; z >= 0; z -= 1) if (grid[idx(W, D, x, y, z)]) { top = z; break; }
        for (let z = 0; z < H; z += 1) {
          cells += 1;
          if (grid[idx(W, D, x, y, z)]) occ += 1;
          else if (z < top) { trapped += 1; trappedTotal += 1; }
        }
      }
    }
    const pct = Math.round((100 * occ) / cells);
    const bar = '#'.repeat(Math.round(pct / 3));
    rows.push(`x ${String(bx).padStart(2)}-${String(Math.min(W, bx + binW) - 1).padStart(2)} | ${String(pct).padStart(3)}% ${bar}${trapped ? `  trapped:${trapped}` : ''}`);
  }
  console.log(rows.join('\n'));
  console.log(`Trapped-air cells (empty under occupied): ${trappedTotal}`);
}
