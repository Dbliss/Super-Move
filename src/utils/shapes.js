// Shape templates: each produces a 3D voxel mask for an item given (width, depth, height) in cells.
// A voxel is [dx, dy, dz] with dx along truck length, dy across truck width, dz vertical.
// fromVoxels() derives the bounding box and the bottom-footprint (columns whose lowest voxel
// touches dz=0 — these are the "feet" that need a supporting surface below).

const voxelKey = (v) => `${v[0]},${v[1]},${v[2]}`;

const dedupeVoxels = (voxels) => {
  const seen = new Set();
  const out = [];
  for (const v of voxels) {
    const k = voxelKey(v);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
};

const fromVoxels = (rawVoxels) => {
  const voxels = dedupeVoxels(rawVoxels);
  let width = 0;
  let depth = 0;
  let height = 0;
  const lowestPerColumn = new Map();
  for (const [dx, dy, dz] of voxels) {
    if (dx + 1 > width) width = dx + 1;
    if (dy + 1 > depth) depth = dy + 1;
    if (dz + 1 > height) height = dz + 1;
    const key = `${dx},${dy}`;
    const current = lowestPerColumn.get(key);
    if (current === undefined || dz < current) lowestPerColumn.set(key, dz);
  }
  const bottomFootprint = [];
  for (const [key, minDz] of lowestPerColumn) {
    if (minDz === 0) {
      const [dx, dy] = key.split(',').map(Number);
      bottomFootprint.push([dx, dy]);
    }
  }
  return { voxels, width, depth, height, bottomFootprint };
};

const fillBox = (voxels, x0, x1, y0, y1, z0, z1) => {
  for (let z = z0; z < z1; z += 1) {
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        voxels.push([x, y, z]);
      }
    }
  }
};

export const templates = {
  box(w, d, h) {
    const voxels = [];
    fillBox(voxels, 0, w, 0, d, 0, h);
    return fromVoxels(voxels);
  },

  tableLegs(w, d, h) {
    // Top slab fills the full footprint at the top ~20% of height; 4 corner legs run from floor to slab.
    const slab = Math.max(1, Math.round(h * 0.2));
    const legH = Math.max(1, h - slab);
    const voxels = [];
    fillBox(voxels, 0, w, 0, d, legH, h);
    const corners = [[0, 0], [w - 1, 0], [0, d - 1], [w - 1, d - 1]];
    for (const [cx, cy] of corners) {
      for (let z = 0; z < legH; z += 1) voxels.push([cx, cy, z]);
    }
    return fromVoxels(voxels);
  },

  chair(w, d, h) {
    // 4 corner legs, seat slab at ~45% height, back panel along last depth row to the top.
    const seatTop = Math.max(1, Math.round(h * 0.45));
    const seatTh = 1;
    const voxels = [];
    const corners = [[0, 0], [w - 1, 0], [0, d - 1], [w - 1, d - 1]];
    for (const [cx, cy] of corners) {
      for (let z = 0; z < seatTop; z += 1) voxels.push([cx, cy, z]);
    }
    fillBox(voxels, 0, w, 0, d, seatTop, seatTop + seatTh);
    if (seatTop + seatTh < h) {
      fillBox(voxels, 0, w, d - 1, d, seatTop + seatTh, h);
    }
    return fromVoxels(voxels);
  },

  bunkBed(w, d, h) {
    // Two mattress slabs with 4 corner posts running the full height.
    const lowerZ = Math.max(1, Math.round(h * 0.1));
    const matTh = Math.max(1, Math.round(h * 0.18));
    const upperZ = Math.max(lowerZ + matTh + 1, Math.round(h * 0.55));
    const voxels = [];
    const corners = [[0, 0], [w - 1, 0], [0, d - 1], [w - 1, d - 1]];
    for (const [cx, cy] of corners) {
      for (let z = 0; z < h; z += 1) voxels.push([cx, cy, z]);
    }
    fillBox(voxels, 0, w, 0, d, lowerZ, Math.min(h, lowerZ + matTh));
    fillBox(voxels, 0, w, 0, d, upperZ, Math.min(h, upperZ + matTh));
    return fromVoxels(voxels);
  },

  lCorner(w, d, h) {
    // Full block minus one quadrant — fits another L beside it to make a rectangle.
    const cutW = Math.max(1, Math.floor(w / 2));
    const cutD = Math.max(1, Math.floor(d / 2));
    const voxels = [];
    for (let z = 0; z < h; z += 1) {
      for (let y = 0; y < d; y += 1) {
        for (let x = 0; x < w; x += 1) {
          if (x >= w - cutW && y >= d - cutD) continue;
          voxels.push([x, y, z]);
        }
      }
    }
    return fromVoxels(voxels);
  },

  sofa(w, d, h) {
    // Seat fills front rows at ~60% height; back row runs the full height.
    const seatH = Math.max(1, Math.round(h * 0.6));
    const voxels = [];
    for (let y = 0; y < d; y += 1) {
      const colH = y === d - 1 ? h : seatH;
      fillBox(voxels, 0, w, y, y + 1, 0, colH);
    }
    return fromVoxels(voxels);
  },
};

export const buildShape = (templateName, w, d, h) => {
  const builder = templates[templateName] || templates.box;
  return builder(Math.max(1, w), Math.max(1, d), Math.max(1, h));
};

// Rotate 90° clockwise around the vertical Z axis.
// Old footprint W×D becomes D×W; cell (x, y) maps to (D - 1 - y, x).
const rotateShape90CW = (shape) => {
  const newVoxels = shape.voxels.map(([dx, dy, dz]) => [shape.depth - 1 - dy, dx, dz]);
  return fromVoxels(newVoxels);
};

const orientationSignature = (shape) =>
  shape.voxels.map(voxelKey).sort().join('|');

export const uniqueOrientations = (shape) => {
  const orientations = [];
  const seen = new Set();
  let current = shape;
  for (let i = 0; i < 4; i += 1) {
    const sig = orientationSignature(current);
    if (!seen.has(sig)) {
      seen.add(sig);
      orientations.push({ ...current, rotation: i });
    }
    current = rotateShape90CW(current);
  }
  return orientations;
};
