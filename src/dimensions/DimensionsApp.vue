<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { uniqueAssets } from '../data/rooms.js';
import savedDimensionsSeed from '../data/objectDimensions.json';
import savedAttributesSeed from '../data/objectAttributes.json';
import { resolveAttributes, clampLevel, MAX_STACK_LEVEL } from '../data/attributes.js';
import { measureAsset } from '../utils/assetDimensions.js';

// ── Catalog ────────────────────────────────────────────────────────────────────
const assets = uniqueAssets;

const modelModules = import.meta.glob('../../Kenny/Models/GLTF format/*.glb', {
  query: '?url',
  import: 'default',
});

const modelUrlFor = (asset) => {
  const loader = modelModules[`../../Kenny/Models/GLTF format/${asset}.glb`];
  return loader ? loader() : Promise.resolve(null);
};

// ── State ────────────────────────────────────────────────────────────────────
// savedDims: asset -> { widthCm, depthCm, heightCm } | { type:'composite', boxes:[{x,y,z,w,d,h}] }
// savedAttrs: itemId -> { stackLevel, openTop }
const savedDims = reactive({ ...savedDimensionsSeed });
const savedAttrs = reactive({ ...savedAttributesSeed });
const measuredDims = reactive({}); // asset -> auto-measured {widthCm, depthCm, heightCm}

const selectedIndex = ref(0);
const mode = ref('regular'); // 'regular' | 'composite'
const dims = reactive({ widthCm: 60, depthCm: 60, heightCm: 60 }); // regular mode
const boxes = reactive([]); // composite mode: array of {x,y,z,w,d,h} in cm
const selectedBoxIndex = ref(0);
const attrs = reactive({}); // itemId -> { stackLevel, openTop } for the items using the current asset
const status = ref('');
const saving = ref(false);

const selectedAsset = computed(() => assets[selectedIndex.value]);
const definedCount = computed(() => assets.filter((a) => savedDims[a.asset]).length);

const round = (v) => Math.round(Number(v) || 0);

// The dimension payload for the current asset, given the active mode.
const dimsPayload = () => {
  if (mode.value === 'composite') {
    return {
      type: 'composite',
      boxes: boxes.map((b) => ({
        x: round(b.x), y: round(b.y), z: round(b.z),
        w: Math.max(1, round(b.w)), d: Math.max(1, round(b.d)), h: Math.max(1, round(b.h)),
      })),
    };
  }
  return { widthCm: round(dims.widthCm), depthCm: round(dims.depthCm), heightCm: round(dims.heightCm) };
};

const attrsDirty = computed(() =>
  (selectedAsset.value?.usedBy || []).some((u) => {
    const cur = attrs[u.id];
    const saved = savedAttrs[u.id];
    if (!cur) return false;
    if (!saved) return true;
    return saved.stackLevel !== clampLevel(cur.stackLevel) || saved.openTop !== cur.openTop;
  }),
);

const isDirty = computed(() => {
  const saved = savedDims[selectedAsset.value?.asset];
  const dimsChanged = !saved || JSON.stringify(saved) !== JSON.stringify(dimsPayload());
  return dimsChanged || attrsDirty.value;
});

const measuredLabel = computed(() => {
  const m = measuredDims[selectedAsset.value?.asset];
  return m ? `${m.widthCm} × ${m.depthCm} × ${m.heightCm}` : 'measuring…';
});

// Overall bounding-box extent (cm) for the active mode.
const overallCm = () => {
  if (mode.value === 'composite' && boxes.length) {
    let w = 1, d = 1, h = 1;
    for (const b of boxes) {
      w = Math.max(w, (Number(b.x) || 0) + (Number(b.w) || 0));
      d = Math.max(d, (Number(b.y) || 0) + (Number(b.d) || 0));
      h = Math.max(h, (Number(b.z) || 0) + (Number(b.h) || 0));
    }
    return { w, d, h };
  }
  return { w: dims.widthCm, d: dims.depthCm, h: dims.heightCm };
};

const overallLabel = computed(() => {
  const o = overallCm();
  return `${round(o.w)} × ${round(o.d)} × ${round(o.h)}`;
});

// ── three.js ───────────────────────────────────────────────────────────────────
const container = ref(null);
let renderer;
let scene;
let camera;
let controls;
let resizeObserver;
let animationFrame;
let disposed = false;

const loader = new GLTFLoader();
const rawCache = new Map(); // asset -> Promise<THREE.Object3D | null>

// contentGroup keeps the model + boxes in a stable "back-left-floor corner = origin" frame and is
// only re-centred over the grid when the asset changes — so editing a box never shifts the model.
const contentGroup = new THREE.Group();
const displayGroup = new THREE.Group();
const boxGroup = new THREE.Group();
contentGroup.add(displayGroup, boxGroup);
let currentModel = null;

const loadRaw = (asset) => {
  if (!rawCache.has(asset)) {
    rawCache.set(
      asset,
      modelUrlFor(asset).then(
        (url) =>
          new Promise((resolve) => {
            if (!url) return resolve(null);
            loader.load(url, (gltf) => resolve(gltf.scene), undefined, () => resolve(null));
          }),
      ),
    );
  }
  return rawCache.get(asset);
};

const m = (cm) => Math.max(Number(cm) || 0, 0) / 100; // cm -> metres

const clearBoxGroup = () => {
  for (const child of [...boxGroup.children]) {
    boxGroup.remove(child);
    child.geometry?.dispose();
    child.material?.dispose();
  }
};

// Wireframe box. depthTest:false so the outline is always visible through the model.
const makeWire = (wCm, hCm, dCm, centre, color, opacity) => {
  const geo = new THREE.BoxGeometry(Math.max(m(wCm), 0.001), Math.max(m(hCm), 0.001), Math.max(m(dCm), 0.001));
  const edges = new THREE.EdgesGeometry(geo);
  geo.dispose();
  const line = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false }),
  );
  line.position.copy(centre);
  return line;
};

// Draw the wireframe box(es) at absolute offsets from the corner origin (0,0,0).
// width→X, height→Y(vertical), depth→Z.
const drawBoxes = () => {
  if (!scene) return;
  clearBoxGroup();
  const place = (x, y, z, w, d, h) =>
    new THREE.Vector3((x + w / 2) / 100, (z + h / 2) / 100, (y + d / 2) / 100);
  if (mode.value === 'composite' && boxes.length) {
    boxes.forEach((b, i) => {
      const sel = i === selectedBoxIndex.value;
      boxGroup.add(makeWire(
        b.w, b.h, b.d,
        place(Number(b.x) || 0, Number(b.y) || 0, Number(b.z) || 0, Number(b.w) || 0, Number(b.d) || 0, Number(b.h) || 0),
        sel ? 0xff7a3c : 0x6fd0ff, sel ? 1 : 0.6,
      ));
    });
  } else {
    boxGroup.add(makeWire(dims.widthCm, dims.heightCm, dims.depthCm, place(0, 0, 0, dims.widthCm, dims.depthCm, dims.heightCm), 0xffcf4a, 0.95));
  }
};

// Centre the content over the grid using the FIXED measured size, so the model stays put.
const recentreContent = (measured) => {
  contentGroup.position.set(-m(measured.widthCm) / 2, 0, -m(measured.depthCm) / 2);
};

const frameCamera = (measured) => {
  const reach = Math.max(m(measured.widthCm), m(measured.depthCm), m(measured.heightCm)) * 1.9 + 0.6;
  camera.position.set(reach, reach * 0.85, reach);
  camera.far = reach * 20;
  camera.updateProjectionMatrix();
  controls.target.set(0, m(measured.heightCm) / 2, 0);
  controls.update();
};

const showAsset = async (asset, measured) => {
  if (currentModel) {
    displayGroup.remove(currentModel);
    currentModel = null;
  }
  status.value = `Loading ${asset}…`;
  const raw = await loadRaw(asset);
  if (disposed || selectedAsset.value.asset !== asset) return;
  recentreContent(measured);
  if (!raw) {
    status.value = `No GLTF found for ${asset}`;
    drawBoxes();
    frameCamera(measured);
    return;
  }
  const model = raw.clone(true);
  model.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material = child.material.clone();
      child.material.roughness = 0.72;
      child.material.transparent = true;
      child.material.opacity = 0.6; // see the boxes you build through it
    }
  });
  // Fixed uniform scale: the model is shown at its real-world (measured) size and never stretched.
  model.scale.set(1, 1, 1);
  model.position.set(0, 0, 0);
  const naturalBox = new THREE.Box3().setFromObject(model);
  const naturalSize = naturalBox.getSize(new THREE.Vector3());
  const scale = m(measured.widthCm) / Math.max(naturalSize.x, 0.0001);
  model.scale.setScalar(scale);
  const scaledBox = new THREE.Box3().setFromObject(model);
  // Seat the model's min corner at the origin (back-left-floor) so box offsets line up with it.
  model.position.set(-scaledBox.min.x, -scaledBox.min.y, -scaledBox.min.z);
  currentModel = model;
  displayGroup.add(model);
  status.value = '';
  drawBoxes();
  frameCamera(measured);
};

const animate = () => {
  if (disposed || !renderer) return;
  controls.update();
  renderer.render(scene, camera);
  animationFrame = requestAnimationFrame(animate);
};

const setupScene = () => {
  if (!container.value) return;
  disposed = false;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1f2426);
  scene.add(contentGroup);

  const width = container.value.clientWidth || 800;
  const height = container.value.clientHeight || 600;
  camera = new THREE.PerspectiveCamera(45, width / height, 0.05, 100);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  container.value.replaceChildren(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.3;
  controls.maxDistance = 30;
  controls.maxPolarAngle = Math.PI / 2 + 0.05;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7572, 2.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(4, 8, 5);
  scene.add(sun);

  // Floor grid: 4 m across, 40 divisions → every cell is exactly 10 cm (one packing cell).
  scene.add(new THREE.GridHelper(4, 40, 0x6f7d54, 0x39433a));

  camera.position.set(2, 1.8, 2);
  controls.target.set(0, 0.5, 0);
  controls.update();
  animate();
};

const teardown = () => {
  disposed = true;
  if (animationFrame) cancelAnimationFrame(animationFrame);
  if (resizeObserver) resizeObserver.disconnect();
  if (controls) controls.dispose();
  if (renderer) renderer.dispose();
  if (container.value) container.value.replaceChildren();
  renderer = scene = camera = controls = null;
};

const resize = () => {
  if (!container.value || !renderer || !camera) return;
  const width = container.value.clientWidth || 800;
  const height = container.value.clientHeight || 600;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
};

// ── Defaults, attributes & navigation ────────────────────────────────────────────
const ensureMeasured = async (asset) => {
  if (measuredDims[asset]) return measuredDims[asset];
  const result = (await measureAsset(asset)) || { widthCm: 60, depthCm: 60, heightCm: 60 };
  measuredDims[asset] = result;
  return result;
};

const loadAttrsFor = (asset) => {
  for (const key of Object.keys(attrs)) delete attrs[key];
  for (const u of assets[selectedIndex.value].usedBy) {
    const a = resolveAttributes(u.id, savedAttrs);
    attrs[u.id] = { stackLevel: a.stackLevel, openTop: a.openTop };
  }
};

const loadDimsFor = (asset, measured) => {
  const saved = savedDims[asset];
  boxes.splice(0, boxes.length);
  if (saved?.type === 'composite' && Array.isArray(saved.boxes)) {
    mode.value = 'composite';
    saved.boxes.forEach((b) => boxes.push({ ...b }));
    selectedBoxIndex.value = 0;
    const o = overallCm();
    dims.widthCm = o.w; dims.depthCm = o.d; dims.heightCm = o.h;
  } else {
    mode.value = 'regular';
    const src = saved || measured;
    dims.widthCm = src.widthCm;
    dims.depthCm = src.depthCm;
    dims.heightCm = src.heightCm;
  }
};

const selectAsset = async (index) => {
  selectedIndex.value = index;
  const asset = assets[index].asset;
  const measured = await ensureMeasured(asset);
  loadDimsFor(asset, measured);
  loadAttrsFor(asset);
  await showAsset(asset, measured);
};

const resetToMeasured = async () => {
  const measured = await ensureMeasured(selectedAsset.value.asset);
  if (mode.value === 'composite') {
    boxes.splice(0, boxes.length, {
      x: 0, y: 0, z: 0, w: measured.widthCm, d: measured.depthCm, h: measured.heightCm,
    });
    selectedBoxIndex.value = 0;
  } else {
    dims.widthCm = measured.widthCm;
    dims.depthCm = measured.depthCm;
    dims.heightCm = measured.heightCm;
  }
};

const clampDim = (key) => { dims[key] = Math.min(1000, Math.max(1, round(dims[key]))); };
const step = (key, delta) => { dims[key] = Math.min(1000, Math.max(1, round(dims[key]) + delta)); };

// ── Composite box editing ────────────────────────────────────────────────────────
const enableComposite = () => {
  if (!boxes.length) {
    boxes.push({ x: 0, y: 0, z: 0, w: dims.widthCm, d: dims.depthCm, h: dims.heightCm });
  }
  selectedBoxIndex.value = boxes.length - 1;
  mode.value = 'composite';
};

const disableComposite = () => {
  const o = overallCm();
  dims.widthCm = round(o.w); dims.depthCm = round(o.d); dims.heightCm = round(o.h);
  mode.value = 'regular';
};

const addBox = () => {
  const base = boxes[selectedBoxIndex.value];
  const next = base
    ? { x: base.x, y: base.y, z: round(base.z) + round(base.h), w: base.w, d: base.d, h: Math.max(10, round(base.h) / 2) }
    : { x: 0, y: 0, z: 0, w: 40, d: 40, h: 40 };
  boxes.push(next);
  selectedBoxIndex.value = boxes.length - 1;
};

const removeBox = (index) => {
  if (boxes.length <= 1) return;
  boxes.splice(index, 1);
  selectedBoxIndex.value = Math.min(selectedBoxIndex.value, boxes.length - 1);
};

const selectBox = (index) => { selectedBoxIndex.value = index; };

// ── Persistence ──────────────────────────────────────────────────────────────────
const postJson = async (route, payload) => {
  const res = await fetch(route, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
};

const save = async () => {
  const asset = selectedAsset.value.asset;
  const dPayload = dimsPayload();
  const aPayload = {};
  for (const u of selectedAsset.value.usedBy) {
    aPayload[u.id] = { stackLevel: clampLevel(attrs[u.id].stackLevel), openTop: !!attrs[u.id].openTop };
  }
  saving.value = true;
  status.value = 'Saving…';
  try {
    await postJson('/api/dimensions', { [asset]: dPayload });
    await postJson('/api/attributes', aPayload);
    savedDims[asset] = JSON.parse(JSON.stringify(dPayload));
    Object.assign(savedAttrs, JSON.parse(JSON.stringify(aPayload)));
    status.value = `Saved ${asset} ✓`;
    return true;
  } catch (error) {
    status.value = `Save failed (${error.message}). Is the dev server running?`;
    return false;
  } finally {
    saving.value = false;
  }
};

const saveAndNext = async () => {
  const ok = await save();
  if (ok && selectedIndex.value < assets.length - 1) await selectAsset(selectedIndex.value + 1);
};

const goPrev = () => { if (selectedIndex.value > 0) selectAsset(selectedIndex.value - 1); };
const goNext = () => { if (selectedIndex.value < assets.length - 1) selectAsset(selectedIndex.value + 1); };

// ── Lifecycle ────────────────────────────────────────────────────────────────────
// Re-draw only the boxes when dims/boxes/mode/selection change — the model never moves.
watch(
  () => JSON.stringify({ mode: mode.value, dims, boxes, sel: selectedBoxIndex.value }),
  () => drawBoxes(),
);

onMounted(async () => {
  await nextTick();
  setupScene();
  resizeObserver = new ResizeObserver(resize);
  if (container.value) resizeObserver.observe(container.value);
  try {
    const [d, a] = await Promise.all([
      fetch('/api/dimensions').then((r) => (r.ok ? r.json() : {})),
      fetch('/api/attributes').then((r) => (r.ok ? r.json() : {})),
    ]);
    Object.assign(savedDims, d);
    Object.assign(savedAttrs, a);
  } catch {
    /* fall back to the bundled seeds */
  }
  await selectAsset(0);
});

onBeforeUnmount(teardown);
</script>

<template>
  <div class="editor">
    <aside class="sidebar">
      <header class="side-head">
        <h1>Object Builder</h1>
        <p class="progress">{{ definedCount }} / {{ assets.length }} defined</p>
        <a class="back-link" href="/index.html">← Quote builder</a>
      </header>
      <ul class="asset-list">
        <li
          v-for="(asset, index) in assets"
          :key="asset.asset"
          :class="{ active: index === selectedIndex, done: !!savedDims[asset.asset] }"
          @click="selectAsset(index)"
        >
          <span class="dot" aria-hidden="true"></span>
          <span class="asset-name">{{ asset.name }}</span>
          <span class="asset-id">
            {{ asset.asset }}
            <em v-if="savedDims[asset.asset]?.type === 'composite'">· composite</em>
          </span>
        </li>
      </ul>
    </aside>

    <main class="viewport">
      <div ref="container" class="canvas-host"></div>
      <div v-if="status" class="overlay-status">{{ status }}</div>
      <div class="hud">Each grid square = 10 cm · the model stays put — draw boxes around it</div>
    </main>

    <section class="panel">
      <header class="panel-head">
        <h2>{{ selectedAsset?.name }}</h2>
        <code>{{ selectedAsset?.asset }}</code>
      </header>

      <div class="mode-toggle">
        <button :class="{ on: mode === 'regular' }" @click="disableComposite">Regular box</button>
        <button :class="{ on: mode === 'composite' }" @click="enableComposite">Non-regular object</button>
      </div>

      <!-- Regular single-box mode -->
      <div v-if="mode === 'regular'" class="fields">
        <label v-for="f in [
          { key: 'widthCm', label: 'Width (X)' },
          { key: 'depthCm', label: 'Depth (Z)' },
          { key: 'heightCm', label: 'Height (Y)' },
        ]" :key="f.key" class="field">
          <span class="field-label">{{ f.label }}</span>
          <div class="field-row">
            <button class="stepper" @click="step(f.key, -10)">−10</button>
            <button class="stepper" @click="step(f.key, -1)">−1</button>
            <input type="number" min="1" max="1000" v-model.number="dims[f.key]" @change="clampDim(f.key)" />
            <span class="unit">cm</span>
            <button class="stepper" @click="step(f.key, 1)">+1</button>
            <button class="stepper" @click="step(f.key, 10)">+10</button>
          </div>
        </label>
      </div>

      <!-- Composite multi-rectangle mode -->
      <div v-else class="composite">
        <p class="composite-help">
          Build the shape from rectangles. Each is an offset (X/Y/Z from the back-left-floor
          corner) and a size — wrap them around the parts of the model that take up space.
          The selected box is highlighted orange.
        </p>
        <div class="box-list">
          <div
            v-for="(b, i) in boxes"
            :key="i"
            class="box-card"
            :class="{ sel: i === selectedBoxIndex }"
            @click="selectBox(i)"
          >
            <div class="box-card-head">
              <strong>Box {{ i + 1 }}</strong>
              <button class="del" :disabled="boxes.length <= 1" @click.stop="removeBox(i)">✕</button>
            </div>
            <div class="box-grid">
              <label>X<input type="number" v-model.number="b.x" @focus="selectBox(i)" /></label>
              <label>Y<input type="number" v-model.number="b.y" @focus="selectBox(i)" /></label>
              <label>Z<input type="number" v-model.number="b.z" @focus="selectBox(i)" /></label>
              <label>W<input type="number" min="1" v-model.number="b.w" @focus="selectBox(i)" /></label>
              <label>D<input type="number" min="1" v-model.number="b.d" @focus="selectBox(i)" /></label>
              <label>H<input type="number" min="1" v-model.number="b.h" @focus="selectBox(i)" /></label>
            </div>
          </div>
        </div>
        <button class="add-box" @click="addBox">+ Add rectangle</button>
        <p class="overall">Overall: {{ overallLabel }} cm</p>
      </div>

      <!-- Stack level & stacking, per item that uses this model -->
      <div class="attributes">
        <h3>Stack level &amp; stacking</h3>
        <p class="attr-help">
          Stack level 0–{{ MAX_STACK_LEVEL }}: 0 = must ride on the truck floor. A higher number
          lets the item also sit on top of any item with a <em>lower</em> level (e.g. level 2 can
          go on the floor, a level-0, or a level-1 item).
        </p>
        <div v-for="u in selectedAsset?.usedBy || []" :key="u.id" class="attr-row">
          <div class="attr-name" v-if="(selectedAsset?.usedBy.length || 0) > 1">{{ u.name }} <em>({{ u.room }})</em></div>
          <div class="attr-controls" v-if="attrs[u.id]">
            <label class="attr-level">
              Stack level
              <input type="number" min="0" :max="MAX_STACK_LEVEL" step="1" v-model.number="attrs[u.id].stackLevel" />
              <span class="unit">/ {{ MAX_STACK_LEVEL }}</span>
            </label>
            <label class="attr-stack">
              <input type="checkbox" v-model="attrs[u.id].openTop" />
              Can stack items on top
            </label>
          </div>
        </div>
      </div>

      <p class="measured">Auto-measured size: {{ measuredLabel }} cm</p>

      <div class="actions">
        <button class="ghost" @click="resetToMeasured">Reset size to measured</button>
        <button class="ghost" @click="goPrev" :disabled="selectedIndex === 0">← Prev</button>
        <button class="ghost" @click="goNext" :disabled="selectedIndex === assets.length - 1">Next →</button>
      </div>
      <div class="actions primary">
        <button class="save" :disabled="saving" @click="save">{{ isDirty ? 'Save' : 'Saved ✓' }}</button>
        <button class="save next" :disabled="saving" @click="saveAndNext">Save &amp; Next →</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.editor {
  display: grid;
  grid-template-columns: 240px 1fr 360px;
  width: 100vw;
  height: 100vh;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  color: #e8eced;
  background: #1a1e1f;
}

/* Sidebar */
.sidebar { background: #14181a; border-right: 1px solid #2a3133; display: flex; flex-direction: column; overflow: hidden; }
.side-head { padding: 18px 16px 12px; border-bottom: 1px solid #2a3133; }
.side-head h1 { font-size: 16px; font-weight: 700; }
.progress { margin-top: 4px; font-size: 12px; color: #8b9794; }
.back-link { display: inline-block; margin-top: 8px; font-size: 12px; color: #ffcf4a; text-decoration: none; }
.back-link:hover { text-decoration: underline; }
.asset-list { list-style: none; overflow-y: auto; flex: 1; }
.asset-list li { display: grid; grid-template-columns: 14px 1fr; grid-template-rows: auto auto; column-gap: 8px; padding: 9px 14px; cursor: pointer; }
.asset-list li:hover { background: #1c2123; }
.asset-list li.active { background: #243033; }
.dot { grid-row: 1 / 3; align-self: center; width: 9px; height: 9px; border-radius: 50%; background: #3a4446; border: 1px solid #4a5557; }
.asset-list li.done .dot { background: #ffcf4a; border-color: #ffcf4a; }
.asset-name { font-size: 13px; font-weight: 600; }
.asset-id { font-size: 11px; color: #79847f; grid-column: 2; }
.asset-id em { color: #6fd0ff; font-style: normal; }

/* Viewport */
.viewport { position: relative; overflow: hidden; }
.canvas-host { position: absolute; inset: 0; }
.overlay-status { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.55); padding: 6px 14px; border-radius: 8px; font-size: 13px; }
.hud { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); font-size: 12px; color: #9aa6a2; background: rgba(0,0,0,0.4); padding: 5px 12px; border-radius: 999px; }

/* Panel */
.panel { background: #14181a; border-left: 1px solid #2a3133; padding: 18px 18px 22px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; }
.panel-head h2 { font-size: 17px; }
.panel-head code { font-size: 12px; color: #ffcf4a; }

.mode-toggle { display: flex; gap: 6px; background: #0f1213; padding: 4px; border-radius: 9px; }
.mode-toggle button { flex: 1; padding: 8px; font-size: 12px; font-weight: 600; background: transparent; border: none; border-radius: 6px; color: #aab4b1; cursor: pointer; }
.mode-toggle button.on { background: #2c3537; color: #fff; }

.fields { display: flex; flex-direction: column; gap: 12px; }
.field-label { font-size: 12px; color: #aab4b1; display: block; margin-bottom: 5px; }
.field-row { display: flex; align-items: center; gap: 4px; }
.field-row input { width: 70px; padding: 7px 8px; font-size: 15px; text-align: center; background: #0f1213; border: 1px solid #313a3c; border-radius: 6px; color: #fff; }
.unit { font-size: 12px; color: #79847f; margin: 0 2px; }
.stepper { padding: 6px 8px; font-size: 12px; background: #232a2c; border: 1px solid #313a3c; border-radius: 6px; color: #cfd6d4; cursor: pointer; }
.stepper:hover { background: #2c3537; }

/* Composite */
.composite { display: flex; flex-direction: column; gap: 10px; }
.composite-help { font-size: 11px; color: #8b9794; line-height: 1.45; }
.box-list { display: flex; flex-direction: column; gap: 8px; }
.box-card { background: #0f1213; border: 1px solid #2a3133; border-radius: 8px; padding: 9px 10px; cursor: pointer; }
.box-card.sel { border-color: #ff7a3c; }
.box-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 7px; }
.box-card-head strong { font-size: 12px; }
.del { background: #2a2222; border: 1px solid #4a3232; color: #e08a8a; border-radius: 5px; width: 22px; height: 22px; cursor: pointer; }
.del:disabled { opacity: 0.3; cursor: default; }
.box-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.box-grid label { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #9aa6a2; }
.box-grid input { width: 100%; padding: 5px 4px; font-size: 13px; text-align: center; background: #181d1e; border: 1px solid #313a3c; border-radius: 5px; color: #fff; }
.add-box { padding: 8px; font-size: 12px; background: #1d2426; border: 1px dashed #41545a; border-radius: 7px; color: #9fe0ff; cursor: pointer; }
.add-box:hover { background: #21292b; }
.overall { font-size: 12px; color: #ffcf4a; }

/* Attributes */
.attributes { border-top: 1px solid #2a3133; padding-top: 12px; display: flex; flex-direction: column; gap: 10px; }
.attributes h3 { font-size: 13px; color: #cfd6d4; }
.attr-help { font-size: 11px; color: #8b9794; line-height: 1.45; }
.attr-row { display: flex; flex-direction: column; gap: 6px; }
.attr-name { font-size: 12px; color: #aab4b1; }
.attr-name em { color: #79847f; font-style: normal; }
.attr-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.attr-level { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #aab4b1; }
.attr-level input { width: 56px; padding: 6px 8px; font-size: 14px; text-align: center; background: #0f1213; border: 1px solid #313a3c; border-radius: 6px; color: #fff; }
.attr-stack { display: flex; align-items: center; gap: 7px; font-size: 12px; color: #aab4b1; cursor: pointer; }

.measured { font-size: 12px; color: #8b9794; }

.actions { display: flex; gap: 8px; }
.actions.primary { margin-top: auto; }
.ghost { flex: 1; padding: 9px; font-size: 12px; background: #1d2426; border: 1px solid #313a3c; border-radius: 7px; color: #cfd6d4; cursor: pointer; }
.ghost:hover:not(:disabled) { background: #263032; }
.ghost:disabled { opacity: 0.4; cursor: default; }
.save { flex: 1; padding: 11px; font-size: 14px; font-weight: 700; background: #ffcf4a; border: none; border-radius: 8px; color: #1a1e1f; cursor: pointer; }
.save.next { background: #2c3537; color: #ffcf4a; border: 1px solid #ffcf4a; }
.save:disabled { opacity: 0.5; cursor: default; }
</style>
