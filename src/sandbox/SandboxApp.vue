<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import existingLayouts from '../data/houseLayouts.json';

// ── Palette catalog ───────────────────────────────────────────────────────────
const HOUSE_GROUPS = [
  {
    label: 'Floors', color: '#c8a87a', source: 'house',
    models: ['floor', 'floor-half', 'floor-quarter', 'floor-corner-diagonal', 'floor-corner-round'],
  },
  {
    label: 'Walls', color: '#7a9ec8', source: 'house',
    models: [
      'wall', 'wall-half', 'wall-low',
      'wall-corner', 'wall-corner-diagonal', 'wall-corner-round',
      'wall-corner-column', 'wall-corner-column-small',
      'wall-corner-column-bottom', 'wall-corner-column-small-bottom',
    ],
  },
  {
    label: 'Windows', color: '#7ac8b8', source: 'house',
    models: [
      'wall-window-square', 'wall-window-square-detailed',
      'wall-window-round', 'wall-window-round-detailed',
      'wall-window-wide-square', 'wall-window-wide-square-detailed',
      'wall-window-wide-round', 'wall-window-wide-round-detailed',
    ],
  },
  {
    label: 'Doors', color: '#c87a7a', source: 'house',
    models: [
      'wall-doorway-square', 'wall-doorway-round',
      'wall-doorway-wide-square', 'wall-doorway-wide-round',
      'door-rotate-square-a', 'door-rotate-square-b',
      'door-rotate-square-c', 'door-rotate-square-d',
      'door-rotate-round-a', 'door-rotate-round-b',
      'door-rotate-round-c', 'door-rotate-round-d',
      'barricade-doorway-a', 'barricade-doorway-b', 'barricade-doorway-c',
      'barricade-window-a', 'barricade-window-b', 'barricade-window-c',
    ],
  },
  {
    label: 'Roof', color: '#b87ac8', source: 'house',
    models: [
      'roof-flat-center', 'roof-flat-square',
      'roof-flat-side', 'roof-flat-corner', 'roof-flat-corner-inner',
      'roof-flat-patch', 'roof-flat-patch-large',
    ],
  },
  {
    label: 'Stairs', color: '#c8c87a', source: 'house',
    models: [
      'stairs-open', 'stairs-open-short',
      'stairs-closed', 'stairs-closed-short',
      'stairs-center', 'stairs-center-short',
      'stairs-sides', 'stairs-sides-short',
    ],
  },
  {
    label: 'Structure', color: '#7ac88a', source: 'house',
    models: [
      'column', 'column-thin', 'column-wide', 'detail-pipe',
      'border', 'border-corner', 'border-corner-diagonal', 'border-corner-round', 'border-corner-small',
      'border-high', 'border-high-corner', 'border-high-corner-diagonal',
      'border-high-corner-round', 'border-high-corner-small',
      'gutter-vertical', 'gutter-vertical-bottom', 'gutter-vertical-short',
      'gutter-vertical-top', 'gutter-vertical-wall',
      'plating', 'plating-wide', 'plating-detailed', 'plating-detailed-wide',
    ],
  },
];

const FURNITURE_GROUPS = [
  {
    label: 'Bedroom', color: '#e09070', source: 'furniture',
    models: [
      'bedDouble', 'bedSingle', 'bedBunk',
      'cabinetBed', 'cabinetBedDrawer', 'cabinetBedDrawerTable',
      'sideTable', 'sideTableDrawers',
    ],
  },
  {
    label: 'Living Room', color: '#7090d8', source: 'furniture',
    models: [
      'loungeSofa', 'loungeSofaLong', 'loungeSofaCorner', 'loungeSofaOttoman',
      'loungeChair', 'loungeChairRelax', 'loungeDesignChair',
      'loungeDesignSofa', 'loungeDesignSofaCorner',
      'tableCoffee', 'tableCoffeeGlass', 'tableCoffeeSquare', 'tableCoffeeGlassSquare',
      'cabinetTelevision', 'cabinetTelevisionDoors',
      'televisionModern', 'televisionAntenna', 'televisionVintage',
    ],
  },
  {
    label: 'Dining', color: '#d8a060', source: 'furniture',
    models: [
      'table', 'tableRound', 'tableGlass', 'tableCloth', 'tableCross', 'tableCrossCloth',
      'chair', 'chairCushion', 'chairRounded', 'chairModernCushion', 'chairModernFrameCushion',
      'stoolBar', 'stoolBarSquare',
      'bookcaseClosedWide', 'bookcaseClosedDoors',
    ],
  },
  {
    label: 'Kitchen', color: '#60c888', source: 'furniture',
    models: [
      'kitchenStove', 'kitchenStoveElectric',
      'kitchenFridge', 'kitchenFridgeLarge', 'kitchenFridgeSmall', 'kitchenFridgeBuiltIn',
      'kitchenMicrowave', 'kitchenCoffeeMachine', 'kitchenBlender', 'toaster',
      'kitchenSink', 'hoodLarge', 'hoodModern',
      'kitchenCabinet', 'kitchenCabinetDrawer', 'kitchenCabinetCornerInner', 'kitchenCabinetCornerRound',
      'kitchenCabinetUpper', 'kitchenCabinetUpperDouble', 'kitchenCabinetUpperCorner', 'kitchenCabinetUpperLow',
      'kitchenBar', 'kitchenBarEnd',
    ],
  },
  {
    label: 'Office', color: '#70a8d8', source: 'furniture',
    models: [
      'desk', 'deskCorner', 'chairDesk',
      'computerScreen', 'computerKeyboard', 'computerMouse', 'laptop',
      'bookcaseOpen', 'bookcaseOpenLow',
    ],
  },
  {
    label: 'Storage', color: '#9888c8', source: 'furniture',
    models: ['bookcaseClosed', 'bookcaseClosedDoors', 'bookcaseClosedWide'],
  },
  {
    label: 'Laundry', color: '#60c8c0', source: 'furniture',
    models: ['washer', 'dryer', 'washerDryerStacked'],
  },
  {
    label: 'Bathroom', color: '#78b8e0', source: 'furniture',
    models: [
      'bathroomCabinet', 'bathroomCabinetDrawer', 'bathroomMirror',
      'bathroomSink', 'bathroomSinkSquare', 'bathtub',
      'shower', 'showerRound', 'toilet', 'toiletSquare',
    ],
  },
  {
    label: 'Garage & Outdoor', color: '#b8a878', source: 'furniture',
    models: [
      'bench', 'benchCushion', 'benchCushionLow',
      'coatRack', 'coatRackStanding',
      'speaker', 'speakerSmall', 'trashcan',
      'cardboardBoxClosed', 'cardboardBoxOpen',
    ],
  },
  {
    label: 'Decor & Lamps', color: '#d08878', source: 'furniture',
    models: [
      'pottedPlant', 'plantSmall1', 'plantSmall2', 'plantSmall3',
      'lampRoundFloor', 'lampRoundTable', 'lampSquareFloor', 'lampSquareTable',
      'lampSquareCeiling', 'lampWall', 'ceilingFan',
      'rugRectangle', 'rugRound', 'rugRounded', 'rugSquare', 'rugDoormat',
      'pillow', 'pillowBlue', 'pillowBlueLong', 'pillowLong',
      'radio', 'bear', 'books',
    ],
  },
];

const ALL_GROUPS = [...HOUSE_GROUPS, ...FURNITURE_GROUPS];

// ── Asset loaders ─────────────────────────────────────────────────────────────
const houseModules = import.meta.glob(
  '../../Kenny_house/Models/GLB format/*.glb',
  { query: '?url', import: 'default' },
);
const furnitureModules = import.meta.glob(
  '../../Kenny/Models/GLTF format/*.glb',
  { query: '?url', import: 'default' },
);
const housePreviews = import.meta.glob(
  '../../Kenny_house/Previews/*.png',
  { query: '?url', import: 'default', eager: true },
);
const furniturePreviews = import.meta.glob(
  '../../Kenny/Side/*.png',
  { query: '?url', import: 'default', eager: true },
);

const previewFor = (name, source) => {
  if (source === 'house') return housePreviews[`../../Kenny_house/Previews/${name}.png`] || null;
  return furniturePreviews[`../../Kenny/Side/${name}.png`] || null;
};

const gltfLoader = new GLTFLoader();
const modelCache = new Map(); // 'house:wall' → Promise<THREE.Group>

const loadGlb = (name, source) => {
  const key = source === 'house'
    ? `../../Kenny_house/Models/GLB format/${name}.glb`
    : `../../Kenny/Models/GLTF format/${name}.glb`;
  const mod = source === 'house' ? houseModules[key] : furnitureModules[key];
  if (!mod) return Promise.resolve(null);
  return mod().then(
    (url) => new Promise((resolve) => {
      gltfLoader.load(url, (gltf) => resolve(gltf.scene), undefined, () => resolve(null));
    }),
  );
};

const getModelSource = (name, source) => {
  const cacheKey = `${source}:${name}`;
  if (!modelCache.has(cacheKey)) modelCache.set(cacheKey, loadGlb(name, source));
  return modelCache.get(cacheKey);
};

// ── Normalize: center X/Z, floor at y=0 ──────────────────────────────────────
// This corrects Kenney tiles whose origin is at a corner rather than the centre,
// so every tile is reliably centred in its grid cell.
const normalizeMesh = (src) => {
  if (!src) return null;
  const model = src.clone(true);
  model.traverse((child) => {
    if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
  });
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  // Centre horizontally; keep bottom flush with y = 0
  model.position.set(-center.x, -box.min.y, -center.z);
  const wrapper = new THREE.Group();
  wrapper.add(model);
  return wrapper;
};

// ── Reactive state ────────────────────────────────────────────────────────────
const canvasContainer = ref(null);
const selectedModel = ref(null);
const selectedSource = ref('house'); // 'house' | 'furniture'
const mode = ref('place');           // 'place' | 'erase'
const currentRy = ref(0);
const currentGy = ref(0);
const layoutId = ref('studio');
const pieces = ref([]);              // { model, source, gx, gy, gz, ry, key }
const statusText = ref('Pick a tile from the left panel to start placing');
const copyLabel = ref('Copy JSON');
const loadingPreset = ref(false);

let pieceKeyCounter = 0;
const undoStack = [];

const jsonOutput = computed(() => {
  const id = layoutId.value || 'custom';
  const name = id.charAt(0).toUpperCase() + id.slice(1);
  const piecesClean = pieces.value.map(({ key, ...p }) => {
    const out = { ...p };
    if (!out.ry) delete out.ry;
    if (out.source === 'house') delete out.source; // house is the default; omit for tidiness
    return out;
  });
  return JSON.stringify({ [id]: { name, pieces: piecesClean } }, null, 2);
});

// ── Three.js state ────────────────────────────────────────────────────────────
let renderer = null, scene = null, camera = null, controls = null;
let houseGroup = null, ghostGroup = null;
let baseGrid = null, activeGrid = null;
let animationFrame = null, disposed = false;

let tileW = 2, tileD = 2, wallH = 2;
let gridOffsetX = 1, gridOffsetZ = 1; // half-tile offsets (updated after measurement)

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pieceKeyToMesh = new Map();

let ghostGx = 0, ghostGz = 0;
let isOnCanvas = false;

const EDGE_PERPENDICULAR_OFFSET = 0;
const EDGE_LENGTH_OFFSET = 0.5;
const WIDE_EDGE_LENGTH_OFFSET = 0;
const EDGE_POINT_OFFSET = 0.5;

const EDGE_LINE_MODELS = new Set([
  'wall', 'wall-half', 'wall-low',
  'border', 'border-high',
  'plating', 'plating-wide', 'plating-detailed', 'plating-detailed-wide',
]);

const WIDE_EDGE_LINE_MODELS = new Set([
  'wall-window-wide-square', 'wall-window-wide-square-detailed',
  'wall-window-wide-round', 'wall-window-wide-round-detailed',
  'wall-doorway-wide-square', 'wall-doorway-wide-round',
]);

const FINE_HOUSE_MODELS = new Set([
  'column', 'column-thin', 'column-wide',
  'gutter-vertical', 'gutter-vertical-bottom', 'gutter-vertical-short',
  'gutter-vertical-top', 'gutter-vertical-wall',
]);

const EDGE_POINT_MODELS = new Set([
  'wall-corner-column-small', 'wall-corner-column-small-b', 'wall-corner-column-small-bottom',
  'border-corner-small', 'border-high-corner-small',
]);

// Per-model placement tweaks in grid units. `x` adjusts exported gx, `y` adjusts exported gz.
// Keep these values small, usually -0.5, 0, or 0.5, when an asset origin is off-grid.
const MODEL_POSITION_TUNING = {
  'wall-corner-column-small': { x: -0.25, y: -0.25 },
  'wall-corner-column-small-bottom': { x: -0.25, y: -0.25 },

  'wall-window-wide-square': { x: -0.5, y: 0.5 },
  'wall-window-wide-square-detailed': { x: -0.5, y: 0.5 },
  'wall-window-wide-round': { x: -0.5, y: 0.5 },
  'wall-window-wide-round-detailed': { x: -0.5, y: 0.5 },

  'wall-doorway-wide-square': { x: -0.5, y: 0.5 },
  'wall-doorway-wide-round': { x: -0.5, y: 0.5 },

  'stairs-open': { x: 0, y: 0.5 },
  'stairs-open-short': { x: 0, y: 0 },
  'stairs-closed': { x: 0, y: 0.5 },
  'stairs-closed-short': { x: 0, y: 0 },
  'stairs-center': { x: 0, y: 0.5 },
  'stairs-center-short': { x: 0, y: 0 },
  'stairs-sides': { x: 0, y: 0.5 },
  'stairs-sides-short': { x: 0, y: 0 },

  'column': { x: 0.5, y: 0.5 },
  'column-thin': { x: 0.5, y: 0.5 },
  'column-wide': { x: 0.5, y: 0.5 },

  'border-corner-small': { x: -0.25, y: -0.25 },
  'border-high-corner-small': { x: -0.25, y: -0.25 },
};

const applyModelPositionTuning = (name, placement) => {
  const tuning = MODEL_POSITION_TUNING[name];
  if (!tuning) return placement;
  return {
    ...placement,
    gx: cleanCoord(placement.gx + tuning.x),
    gz: cleanCoord(placement.gz + tuning.y),
  };
};

const isWindowOrDoor = (name) => (
  name.startsWith('wall-window-')
  || name.startsWith('wall-doorway-')
  || name.startsWith('door-')
  || name.startsWith('barricade-doorway-')
  || name.startsWith('barricade-window-')
);

const placementKindFor = (name, source) => {
  if (source === 'furniture') return 'fine';
  if (FINE_HOUSE_MODELS.has(name) || name.includes('small')) return 'fine';
  if (WIDE_EDGE_LINE_MODELS.has(name)) return 'wide-edge-line';
  if (EDGE_POINT_MODELS.has(name)) return 'edge-point';
  if (EDGE_LINE_MODELS.has(name) || isWindowOrDoor(name)) return 'edge-line';
  return 'tile-center';
};

// ── Ghost ─────────────────────────────────────────────────────────────────────
const applyGhostMaterial = (obj) => {
  obj.traverse((child) => {
    if (!child.isMesh) return;
    child.material = child.material.clone();
    child.material.transparent = true;
    child.material.opacity = 0.38;
    child.material.depthWrite = false;
    child.material.emissive = new THREE.Color(0x00ffc0);
    child.material.emissiveIntensity = 0.15;
  });
};

const rebuildGhost = async (name, source) => {
  if (ghostGroup && scene) scene.remove(ghostGroup);
  ghostGroup = null;
  if (!name || !scene) return;

  const src = await getModelSource(name, source);
  if (!src || disposed) return;

  ghostGroup = normalizeMesh(src);
  if (!ghostGroup) return;
  applyGhostMaterial(ghostGroup);
  ghostGroup.rotation.y = (currentRy.value * Math.PI) / 180;
  ghostGroup.position.set(ghostGx * tileW, currentGy.value * wallH, ghostGz * tileD);
  ghostGroup.visible = false;
  scene.add(ghostGroup);
};

// ── Scene setup ───────────────────────────────────────────────────────────────
const setupScene = async () => {
  if (!canvasContainer.value) return;
  disposed = false;

  const w = canvasContainer.value.clientWidth || 800;
  const h = canvasContainer.value.clientHeight || 600;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1c2325);
  scene.fog = new THREE.FogExp2(0x1c2325, 0.016);

  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvasContainer.value.replaceChildren(renderer.domElement);

  camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 200);
  camera.position.set(18, 20, 22);
  camera.lookAt(0, 0, 0);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  // Left-click is ours for placement; right-drag = orbit
  controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };

  scene.add(new THREE.HemisphereLight(0xfff0dc, 0x304840, 1.8));

  const sun = new THREE.DirectionalLight(0xfff8e8, 2.6);
  sun.position.set(14, 22, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 80;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -30;
  sun.shadow.camera.right = sun.shadow.camera.top = 30;
  scene.add(sun);
  const fillLight = new THREE.DirectionalLight(0xa0c8ff, 0.5);
  fillLight.position.set(-8, 10, -6);
  scene.add(fillLight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x18211f, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  ground.receiveShadow = true;
  scene.add(ground);

  // Grids — resized + repositioned after tile measurement below
  baseGrid = new THREE.GridHelper(40, 20, 0x1e3430, 0x172a26);
  baseGrid.position.y = 0.01;
  scene.add(baseGrid);

  activeGrid = new THREE.GridHelper(40, 20, 0x2a7060, 0x1e5040);
  activeGrid.position.y = 0.02;
  scene.add(activeGrid);

  houseGroup = new THREE.Group();
  scene.add(houseGroup);

  // Measure tile sizes from actual GLB geometry
  const [floorSrc, wallSrc] = await Promise.all([
    getModelSource('floor', 'house'),
    getModelSource('wall', 'house'),
  ]);
  if (disposed) return;

  if (floorSrc) {
    const b = new THREE.Box3().setFromObject(floorSrc);
    const s = b.getSize(new THREE.Vector3());
    tileW = s.x || 2;
    tileD = s.z || 2;
  }
  if (wallSrc) {
    const b = new THREE.Box3().setFromObject(wallSrc);
    wallH = b.getSize(new THREE.Vector3()).y || 2;
  }

  // Resize grids so each cell = one tile, then offset by half-tile so
  // grid LINES land at tile EDGES (not tile centres).
  const gridSpan = 20 * tileW;
  const scale = gridSpan / 40;
  gridOffsetX = tileW / 2;
  gridOffsetZ = tileD / 2;
  [baseGrid, activeGrid].forEach((g) => {
    g.scale.set(scale, 1, scale);
    g.position.x = gridOffsetX;
    g.position.z = gridOffsetZ;
  });

  // Canvas events
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerenter', () => { isOnCanvas = true; });
  renderer.domElement.addEventListener('pointerleave', () => {
    isOnCanvas = false;
    if (ghostGroup) ghostGroup.visible = false;
  });

  animate();
};

const animate = () => {
  if (disposed) return;
  controls?.update();
  renderer?.render(scene, camera);
  animationFrame = requestAnimationFrame(animate);
};

// ── Raycasting ────────────────────────────────────────────────────────────────
const updateNDC = (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
};

const cleanCoord = (value) => Number(value.toFixed(3));
const snapToCenter = (world, size) => Math.round(world / size);
const snapToFine = (world, size) => cleanCoord(Math.round((world / size) * 10) / 10);
const tileBoundsFor = (world, size, offset = EDGE_PERPENDICULAR_OFFSET) => {
  const coord = world / size;
  const center = Math.floor(coord);
  return {
    center,
    min: cleanCoord(center - offset),
    max: cleanCoord(center + offset),
  };
};

const snapToTileSide = (worldX, worldZ, lengthOffset = EDGE_LENGTH_OFFSET) => {
  const x = tileBoundsFor(worldX, tileW);
  const z = tileBoundsFor(worldZ, tileD);
  const coordX = worldX / tileW;
  const coordZ = worldZ / tileD;
  const distances = [
    { side: 'north', distance: Math.abs(coordZ - z.min), gx: cleanCoord(x.center + lengthOffset), gz: z.min, ry: 0 },
    { side: 'east', distance: Math.abs(coordX - x.max), gx: x.max, gz: cleanCoord(z.center + lengthOffset), ry: 270 },
    { side: 'south', distance: Math.abs(coordZ - z.max), gx: cleanCoord(x.center + lengthOffset), gz: z.max, ry: 180 },
    { side: 'west', distance: Math.abs(coordX - x.min), gx: x.min, gz: cleanCoord(z.center + lengthOffset), ry: 90 },
  ];
  return distances.reduce((best, side) => (side.distance < best.distance ? side : best));
};

const snapToGrid = (worldX, worldZ, name, source, ry = 0) => {
  const kind = placementKindFor(name, source);
  let placement;
  if (kind === 'fine') {
    placement = { gx: snapToFine(worldX, tileW), gz: snapToFine(worldZ, tileD) };
  } else if (kind === 'edge-point') {
    const x = tileBoundsFor(worldX, tileW, EDGE_POINT_OFFSET);
    const z = tileBoundsFor(worldZ, tileD, EDGE_POINT_OFFSET);
    placement = {
      gx: Math.abs((worldX / tileW) - x.min) < Math.abs((worldX / tileW) - x.max) ? x.min : x.max,
      gz: Math.abs((worldZ / tileD) - z.min) < Math.abs((worldZ / tileD) - z.max) ? z.min : z.max,
    };
  } else if (kind === 'wide-edge-line') {
    placement = snapToTileSide(worldX, worldZ, WIDE_EDGE_LENGTH_OFFSET);
  } else if (kind === 'edge-line') {
    placement = snapToTileSide(worldX, worldZ);
  } else {
    placement = {
      gx: snapToCenter(worldX, tileW),
      gz: snapToCenter(worldZ, tileD),
    };
  }

  return applyModelPositionTuning(name, placement);
};

const getGridHit = () => {
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(currentGy.value * wallH));
  const target = new THREE.Vector3();
  return raycaster.ray.intersectPlane(plane, target) ? target : null;
};

const getMeshHit = () => {
  const meshes = [];
  houseGroup.traverse((c) => { if (c.isMesh) meshes.push(c); });
  const hits = raycaster.intersectObjects(meshes);
  return hits.length ? hits[0].object.userData.pieceKey : null;
};

// ── Pointer events ────────────────────────────────────────────────────────────
const onPointerMove = (e) => {
  if (e.buttons === 2) return;
  updateNDC(e);

  if (mode.value === 'place' && selectedModel.value) {
    const hit = getGridHit();
    if (!hit) { if (ghostGroup) ghostGroup.visible = false; return; }
    const { gx, gz, ry } = snapToGrid(hit.x, hit.z, selectedModel.value, selectedSource.value, currentRy.value);
    ghostGx = gx; ghostGz = gz;
    if (ry != null && currentRy.value !== ry) currentRy.value = ry;
    if (ghostGroup) {
      ghostGroup.rotation.y = ((ry ?? currentRy.value) * Math.PI) / 180;
      ghostGroup.position.set(gx * tileW, currentGy.value * wallH, gz * tileD);
      ghostGroup.visible = true;
    }
    statusText.value = `"${selectedModel.value}" → (${gx}, ${currentGy.value}, ${gz})  ·  R rotate  ·  right-drag orbit`;
  } else if (mode.value === 'erase') {
    statusText.value = 'Erase — left-click a tile to remove it';
  }
};

const onPointerDown = (e) => {
  if (e.button !== 0) return;
  updateNDC(e);
  if (mode.value === 'place' && selectedModel.value) placePiece();
  else if (mode.value === 'erase') { const k = getMeshHit(); if (k != null) removePieceByKey(k); }
};

// ── Piece management ──────────────────────────────────────────────────────────
const addMeshForPiece = async (piece) => {
  const src = await getModelSource(piece.model, piece.source || 'house');
  if (!src || disposed) return;

  const mesh = normalizeMesh(src);
  if (!mesh) return;
  mesh.traverse((c) => { c.userData.pieceKey = piece.key; });
  mesh.userData.pieceKey = piece.key;
  mesh.rotation.y = ((piece.ry || 0) * Math.PI) / 180;
  mesh.position.set(piece.gx * tileW, piece.gy * wallH, piece.gz * tileD);
  houseGroup.add(mesh);
  pieceKeyToMesh.set(piece.key, mesh);
};

const placePiece = () => {
  const piece = {
    model: selectedModel.value,
    source: selectedSource.value,
    gx: ghostGx, gy: currentGy.value, gz: ghostGz,
    ry: currentRy.value,
    key: ++pieceKeyCounter,
  };
  pieces.value.push(piece);
  undoStack.push(piece.key);
  addMeshForPiece(piece);
};

const disposeMesh = (m) => m.traverse((c) => {
  if (c.geometry) c.geometry.dispose();
  if (c.material) [c.material].flat().forEach((mat) => mat.dispose());
});

const removePieceByKey = (key) => {
  const idx = pieces.value.findIndex((p) => p.key === key);
  if (idx < 0) return;
  pieces.value.splice(idx, 1);
  const m = pieceKeyToMesh.get(key);
  if (m) { houseGroup.remove(m); disposeMesh(m); pieceKeyToMesh.delete(key); }
};

const undo = () => { const k = undoStack.pop(); if (k != null) removePieceByKey(k); };

const clearAll = () => {
  [...pieces.value.map((p) => p.key)].forEach(removePieceByKey);
  undoStack.length = 0;
};

// ── Load preset ───────────────────────────────────────────────────────────────
const loadPreset = async (id) => {
  if (!id) return;
  const layout = existingLayouts[id];
  if (!layout) return;
  loadingPreset.value = true;
  clearAll();
  layoutId.value = id;
  const uniquePairs = [...new Map(layout.pieces.map((p) => [`${p.source || 'house'}:${p.model}`, p])).values()];
  await Promise.all(uniquePairs.map((p) => getModelSource(p.model, p.source || 'house')));
  if (disposed) { loadingPreset.value = false; return; }
  for (const p of layout.pieces) {
    const piece = { source: 'house', ...p, ry: p.ry || 0, key: ++pieceKeyCounter };
    pieces.value.push(piece);
    addMeshForPiece(piece);
  }
  loadingPreset.value = false;
  statusText.value = `Loaded "${id}" (${layout.pieces.length} pieces) — edit and export when ready`;
};

// ── Clipboard import / export ─────────────────────────────────────────────────
const importFromClipboard = async () => {
  try {
    const parsed = JSON.parse(await navigator.clipboard.readText());
    const id = Object.keys(parsed)[0];
    const layout = parsed[id];
    if (!layout?.pieces) throw new Error('no pieces');
    clearAll();
    layoutId.value = id;
    await Promise.all([...new Set(layout.pieces.map((p) => `${p.source || 'house'}:${p.model}`))].map((k) => {
      const [src, name] = k.split(':');
      return getModelSource(name, src);
    }));
    if (disposed) return;
    layout.pieces.forEach((p) => {
      const piece = { source: 'house', ...p, ry: p.ry || 0, key: ++pieceKeyCounter };
      pieces.value.push(piece);
      addMeshForPiece(piece);
    });
    statusText.value = `Imported "${id}" from clipboard`;
  } catch { statusText.value = 'Paste failed — copy a valid layout JSON first'; }
};

const copyJson = async () => {
  await navigator.clipboard.writeText(jsonOutput.value);
  copyLabel.value = 'Copied ✓';
  setTimeout(() => { copyLabel.value = 'Copy JSON'; }, 2000);
};

const saveJson = () => {
  const url = URL.createObjectURL(new Blob([jsonOutput.value], { type: 'application/json' }));
  Object.assign(document.createElement('a'), { href: url, download: `${layoutId.value || 'layout'}.json` }).click();
  URL.revokeObjectURL(url);
};

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
const rotateBy = (deg) => { currentRy.value = ((currentRy.value + deg) % 360 + 360) % 360; };

const handleKeyDown = (e) => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (e.key === 'r' || e.key === 'R') { rotateBy(e.shiftKey ? -90 : 90); }
  else if (e.key === 'e' || e.key === 'E') {
    mode.value = mode.value === 'erase' ? 'place' : 'erase';
    if (ghostGroup) ghostGroup.visible = mode.value === 'place' && isOnCanvas;
  }
  else if (e.key === 'Escape') { mode.value === 'erase' ? (mode.value = 'place') : (selectedModel.value = null); }
  else if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
  else if (e.key === '[') { currentGy.value = Math.max(0, currentGy.value - 1); }
  else if (e.key === ']') { currentGy.value = Math.min(5, currentGy.value + 1); }
};

// ── Watches ───────────────────────────────────────────────────────────────────
watch([selectedModel, selectedSource], async ([name, src]) => {
  if (name) mode.value = 'place';
  await rebuildGhost(name, src);
  statusText.value = name
    ? `"${name}" selected — left-click grid to place  ·  R = rotate  ·  E = erase  ·  right-drag = orbit`
    : 'Pick a tile from the left panel';
});

watch(currentRy, (ry) => {
  if (!ghostGroup) return;
  ghostGroup.rotation.y = (ry * Math.PI) / 180;
});

watch(currentGy, (gy) => {
  if (ghostGroup) ghostGroup.position.y = gy * wallH;
  if (activeGrid) {
    activeGrid.position.y = gy * wallH + 0.02;
    // Preserve the half-tile X/Z offset
    activeGrid.position.x = gridOffsetX;
    activeGrid.position.z = gridOffsetZ;
  }
});

watch(mode, (m) => {
  if (ghostGroup) ghostGroup.visible = m === 'place' && isOnCanvas && !!selectedModel.value;
  statusText.value = m === 'erase' ? 'Erase mode — left-click a tile to remove it  ·  E or Esc to exit'
    : (selectedModel.value ? `"${selectedModel.value}" selected` : 'Pick a tile');
});

// ── Resize & teardown ─────────────────────────────────────────────────────────
const handleResize = () => {
  if (!canvasContainer.value || !renderer || !camera) return;
  const w = canvasContainer.value.clientWidth, h = canvasContainer.value.clientHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
};

const teardown = () => {
  disposed = true;
  if (animationFrame) cancelAnimationFrame(animationFrame);
  controls?.dispose();
  if (renderer) {
    renderer.domElement.removeEventListener('pointermove', onPointerMove);
    renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    renderer.dispose();
  }
  if (canvasContainer.value) canvasContainer.value.replaceChildren();
  renderer = scene = camera = controls = houseGroup = ghostGroup = null;
  activeGrid = baseGrid = animationFrame = null;
};

onMounted(async () => {
  await nextTick(); await setupScene();
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  teardown();
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('resize', handleResize);
});
</script>

<template>
  <div class="sandbox">

    <!-- ── LEFT: Palette ── -->
    <aside class="palette">
      <header class="palette-header">
        <span class="palette-title">🏠 House Builder</span>
        <a href="/" class="back-link">← App</a>
      </header>

      <div class="tool-row">
        <button :class="['tool-btn', { active: mode === 'place' }]" @click="mode = 'place'">✏️ Place</button>
        <button :class="['tool-btn', { active: mode === 'erase' }]" @click="mode = 'erase'">🗑 Erase</button>
      </div>
      <div class="controls-row">
        <div class="ctrl-group">
          <label>Level <kbd>[</kbd><kbd>]</kbd></label>
          <div class="stepper">
            <button @click="currentGy = Math.max(0, currentGy - 1)">−</button>
            <span>{{ currentGy }}</span>
            <button @click="currentGy = Math.min(5, currentGy + 1)">+</button>
          </div>
        </div>
        <div class="ctrl-group">
          <label>Rotate <kbd>R</kbd></label>
          <div class="stepper">
            <button @click="rotateBy(-90)">↶</button>
            <span>{{ currentRy }}°</span>
            <button @click="rotateBy(90)">↷</button>
          </div>
        </div>
      </div>

      <!-- Section toggle -->
      <div class="section-tabs">
        <button
          v-for="tab in ['house', 'furniture']"
          :key="tab"
          :class="['section-tab', { active: selectedSource === tab }]"
          @click="selectedSource = tab"
        >{{ tab === 'house' ? '🏗 Structure' : '🛋 Furniture' }}</button>
      </div>

      <div class="palette-list">
        <template v-for="group in ALL_GROUPS" :key="group.label">
          <div v-if="group.source === selectedSource" class="palette-group">
            <h3 class="group-heading">
              <span class="group-dot" :style="{ background: group.color }" />
              {{ group.label }}
            </h3>
            <div class="model-items">
              <button
                v-for="name in group.models"
                :key="name"
                :class="['model-btn', { active: selectedModel === name && selectedSource === group.source }]"
                @click="selectedModel = (selectedModel === name && selectedSource === group.source) ? null : name; selectedSource = group.source"
              >
                <img
                  v-if="previewFor(name, group.source)"
                  :src="previewFor(name, group.source)"
                  :alt="name"
                  class="model-thumb"
                />
                <span v-else class="model-thumb-placeholder" :style="{ background: group.color + '33' }" />
                <span class="model-name">{{ name }}</span>
              </button>
            </div>
          </div>
        </template>
      </div>
    </aside>

    <!-- ── CENTER: Viewport ── -->
    <main class="viewport">
      <div ref="canvasContainer" class="canvas-wrap" />
      <div :class="['status-bar', { erase: mode === 'erase' }]">
        <span class="status-text">{{ statusText }}</span>
        <span class="status-meta">
          {{ pieces.length }} pieces · Level {{ currentGy }} · {{ currentRy }}°
          <span v-if="loadingPreset" class="loading-badge">loading…</span>
        </span>
      </div>
    </main>

    <!-- ── RIGHT: Inspector ── -->
    <aside class="inspector">
      <div class="insp-section">
        <label class="field-label">Layout key</label>
        <input v-model="layoutId" class="text-input" placeholder="studio" />
      </div>

      <div class="btn-grid">
        <button class="insp-btn" title="Ctrl+Z" @click="undo">Undo</button>
        <button class="insp-btn danger" @click="clearAll">Clear all</button>
        <button class="insp-btn primary" @click="copyJson">{{ copyLabel }}</button>
        <button class="insp-btn" @click="saveJson">Save .json</button>
      </div>

      <div class="insp-section">
        <label class="field-label">Load preset</label>
        <select class="select-input" @change="loadPreset($event.target.value); $event.target.value = ''">
          <option value="">— pick a layout —</option>
          <option v-for="(_, id) in existingLayouts" :key="id" :value="id">{{ id }}</option>
        </select>
      </div>

      <div class="insp-section">
        <button class="insp-btn full" @click="importFromClipboard">📋 Import from clipboard</button>
      </div>

      <div class="insp-section fill">
        <label class="field-label">JSON — paste into houseLayouts.json</label>
        <textarea class="json-output" :value="jsonOutput" readonly spellcheck="false" />
      </div>

      <div class="shortcut-legend">
        <strong>Shortcuts</strong>
        <div><kbd>R</kbd> rotate CW · <kbd>Shift+R</kbd> CCW</div>
        <div><kbd>[</kbd> <kbd>]</kbd> level down / up</div>
        <div><kbd>E</kbd> toggle erase · <kbd>Esc</kbd> deselect</div>
        <div><kbd>Ctrl+Z</kbd> undo · right-drag orbit · scroll zoom</div>
      </div>
    </aside>

  </div>
</template>

<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; }

.sandbox {
  display: grid;
  grid-template-columns: 252px 1fr 286px;
  height: 100vh;
  overflow: hidden;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  font-size: 13px;
  color: #cce0dc;
  background: #1a1e1f;
}

/* ── Palette ── */
.palette {
  display: flex; flex-direction: column;
  background: #1e2729; border-right: 1px solid #283838; overflow: hidden;
}
.palette-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 13px 15px; background: #192022; border-bottom: 1px solid #283838; flex-shrink: 0;
}
.palette-title { font-weight: 700; font-size: 14px; color: #8dd8ca; }
.back-link { font-size: 11px; color: #527870; text-decoration: none; }
.back-link:hover { color: #8dd8ca; }

.tool-row { display: flex; gap: 6px; padding: 10px 12px 8px; flex-shrink: 0; }
.tool-btn {
  flex: 1; padding: 7px 8px; border: 1px solid #304848; border-radius: 6px;
  background: #243232; color: #88b8b0; cursor: pointer; font-size: 12px; font-weight: 600;
  transition: background 0.12s;
}
.tool-btn:hover { background: #2a3e3e; }
.tool-btn.active { background: #1a6058; border-color: #28907e; color: #c8f4ec; }

.controls-row {
  display: flex; gap: 8px; padding: 0 12px 10px; flex-shrink: 0; border-bottom: 1px solid #283838;
}
.ctrl-group { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.ctrl-group label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #527870; letter-spacing: .5px; }
.ctrl-group kbd {
  display: inline-flex; padding: 0 3px; border: 1px solid #304848; border-radius: 3px;
  background: #192022; font-size: 9px; font-family: monospace; color: #6aa098; margin-left: 3px;
}
.stepper { display: flex; align-items: center; border: 1px solid #304848; border-radius: 6px; overflow: hidden; }
.stepper button {
  width: 28px; height: 28px; background: #243232; border: none; color: #8dd8ca;
  cursor: pointer; font-size: 15px; line-height: 1; flex-shrink: 0;
}
.stepper button:hover { background: #1a6058; }
.stepper span { flex: 1; text-align: center; font-size: 12px; font-weight: 700; color: #c8f0e8; background: #192828; }

.section-tabs { display: flex; flex-shrink: 0; border-bottom: 1px solid #283838; }
.section-tab {
  flex: 1; padding: 8px 4px; border: none; background: transparent;
  color: #527870; cursor: pointer; font-size: 11px; font-weight: 700;
  border-bottom: 2px solid transparent; transition: color 0.12s;
}
.section-tab:hover { color: #8dd8ca; }
.section-tab.active { color: #8dd8ca; border-bottom-color: #1a9080; background: #192828; }

.palette-list { flex: 1; overflow-y: auto; padding-bottom: 20px; scrollbar-width: thin; scrollbar-color: #2a4040 #1a2425; }
.palette-group { margin-bottom: 2px; }
.group-heading { display: flex; align-items: center; gap: 7px; padding: 8px 14px 4px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .7px; color: #6aa098; }
.group-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.model-items { display: flex; flex-direction: column; }
.model-btn {
  display: flex; align-items: center; gap: 9px; padding: 4px 14px;
  border: none; background: transparent; color: #88b0a8; cursor: pointer;
  text-align: left; font-size: 11.5px; font-family: monospace; line-height: 1.3; transition: background .07s;
}
.model-btn:hover { background: #202e2e; color: #c8f0e8; }
.model-btn.active { background: #1a4840; color: #80f0d8; }
.model-thumb { width: 30px; height: 30px; object-fit: contain; border-radius: 4px; background: #192828; flex-shrink: 0; image-rendering: pixelated; }
.model-thumb-placeholder { width: 30px; height: 30px; border-radius: 4px; flex-shrink: 0; }
.model-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── Viewport ── */
.viewport { position: relative; display: flex; flex-direction: column; overflow: hidden; background: #1c2325; }
.canvas-wrap { flex: 1; overflow: hidden; }
.canvas-wrap canvas { width: 100% !important; height: 100% !important; display: block; }
.status-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 15px; background: #181e20; border-top: 1px solid #283838;
  flex-shrink: 0; gap: 12px; min-height: 34px; transition: background .2s;
}
.status-bar.erase { background: #2a1818; border-top-color: #5a2a2a; }
.status-text { font-size: 12px; color: #7aa098; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status-meta { font-size: 11px; color: #405850; flex-shrink: 0; }
.loading-badge { display: inline-block; margin-left: 8px; padding: 1px 6px; border-radius: 3px; background: #1a6058; color: #8df4e8; font-size: 10px; font-weight: 700; }

/* ── Inspector ── */
.inspector { display: flex; flex-direction: column; background: #1e2729; border-left: 1px solid #283838; padding: 14px; overflow: hidden; gap: 10px; }
.insp-section { flex-shrink: 0; }
.insp-section.fill { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.field-label { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #527870; margin-bottom: 5px; }
.text-input, .select-input { width: 100%; padding: 7px 10px; background: #192022; border: 1px solid #304848; border-radius: 6px; color: #c8e0dc; font-size: 13px; font-family: monospace; outline: none; }
.text-input:focus, .select-input:focus { border-color: #2a9080; }
.select-input { cursor: pointer; }
.btn-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.insp-btn {
  padding: 7px 10px; border: 1px solid #304848; border-radius: 6px; background: #243232;
  color: #88b8b0; cursor: pointer; font-size: 12px; font-weight: 600; text-align: center; transition: background .1s; white-space: nowrap;
}
.insp-btn:hover { background: #2a3e3e; }
.insp-btn.full { width: 100%; }
.insp-btn.primary { background: #1a5848; border-color: #248070; color: #c8f0e8; }
.insp-btn.primary:hover { background: #1a6858; }
.insp-btn.danger { background: #3a1818; border-color: #602828; color: #f0c8c8; }
.insp-btn.danger:hover { background: #4a2020; }
.json-output {
  flex: 1; width: 100%; padding: 10px; background: #141a1c; border: 1px solid #283838; border-radius: 6px;
  color: #60c8a8; font-size: 10.5px; font-family: 'Courier New', Consolas, monospace;
  resize: none; min-height: 0; line-height: 1.5; outline: none;
}
.shortcut-legend { flex-shrink: 0; display: flex; flex-direction: column; gap: 3px; padding-top: 10px; border-top: 1px solid #283838; }
.shortcut-legend strong { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #527870; margin-bottom: 2px; }
.shortcut-legend div { font-size: 11px; color: #3e5850; }
.shortcut-legend kbd { display: inline-flex; padding: 0 4px; border: 1px solid #304848; border-radius: 3px; background: #192022; font-size: 10px; font-family: monospace; color: #6aa098; }
</style>
