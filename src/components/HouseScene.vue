<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import houseLayouts from '../data/houseLayouts.json';

const props = defineProps({
  layoutId: { type: String, default: 'studio' },
});

const houseModelModules = import.meta.glob(
  '../../Kenny_house/Models/GLB format/*.glb',
  { query: '?url', import: 'default' },
);

const container = ref(null);
const status = ref('Loading…');

let renderer = null;
let scene = null;
let camera = null;
let houseGroup = null;
let resizeObserver = null;
let animationFrame = null;
let disposed = false;
let sceneStart = 0;
let currentFrame = 6;

const loader = new GLTFLoader();
const modelSourceCache = new Map();

const loadHouseModel = (name) => {
  const key = `../../Kenny_house/Models/GLB format/${name}.glb`;
  const moduleLoader = houseModelModules[key];
  if (!moduleLoader) return Promise.resolve(null);

  return moduleLoader().then(
    (url) =>
      new Promise((resolve) => {
        loader.load(url, (gltf) => resolve(gltf.scene), undefined, () => resolve(null));
      }),
  );
};

const getModelSource = (name) => {
  if (!modelSourceCache.has(name)) {
    modelSourceCache.set(name, loadHouseModel(name));
  }
  return modelSourceCache.get(name);
};

const measureModel = (source) => {
  if (!source) return { width: 2, height: 2, depth: 2 };
  const box = new THREE.Box3().setFromObject(source);
  const size = box.getSize(new THREE.Vector3());
  return { width: size.x, height: size.y, depth: size.z };
};

const setupScene = async () => {
  if (!container.value) return;

  disposed = false;
  status.value = 'Loading…';

  scene = new THREE.Scene();

  const width = container.value.clientWidth || 720;
  const height = container.value.clientHeight || 420;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.value.replaceChildren(renderer.domElement);

  const ambient = new THREE.HemisphereLight(0xfff0dc, 0x8ab8b0, 2.2);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfffae8, 3.0);
  sun.position.set(10, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 80;
  sun.shadow.camera.left = -24;
  sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xc8e8ff, 0.8);
  fill.position.set(-6, 8, -4);
  scene.add(fill);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0xdae8e2, roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  const layout = houseLayouts[props.layoutId];
  if (!layout) {
    status.value = '';
    return;
  }

  const uniqueModels = [...new Set(layout.pieces.map((p) => p.model))];
  await Promise.all(uniqueModels.map((name) => getModelSource(name)));
  if (disposed) return;

  const [floorSrc, wallSrc] = await Promise.all([
    getModelSource('floor'),
    getModelSource('wall'),
  ]);
  if (disposed) return;

  const floorSize = measureModel(floorSrc);
  const wallSize = measureModel(wallSrc);
  const tileW = floorSize.width || 2;
  const tileD = floorSize.depth || 2;
  const wallH = wallSize.height || 2;

  houseGroup = new THREE.Group();

  for (const piece of layout.pieces) {
    const src = await getModelSource(piece.model);
    if (!src || disposed) continue;

    const mesh = src.clone(true);
    mesh.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) child.material = child.material.clone();
      }
    });

    mesh.rotation.y = ((piece.ry || 0) * Math.PI) / 180;
    mesh.position.set(piece.gx * tileW, piece.gy * wallH, piece.gz * tileD);
    houseGroup.add(mesh);
  }

  if (disposed) return;

  const box = new THREE.Box3().setFromObject(houseGroup);
  const center = box.getCenter(new THREE.Vector3());
  houseGroup.position.set(-center.x, -box.min.y, -center.z);
  scene.add(houseGroup);

  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.z, size.y * 1.4);
  currentFrame = maxDim * 0.62;

  const aspect = width / height;
  camera = new THREE.OrthographicCamera(
    -currentFrame * aspect,
    currentFrame * aspect,
    currentFrame,
    -currentFrame,
    0.1,
    200,
  );
  camera.position.set(14, 16, 18);
  camera.lookAt(0, 0, 0);

  status.value = '';
  animate();
};

const animate = () => {
  if (disposed || !renderer || !scene || !camera) return;

  const elapsed = performance.now() / 1000 - sceneStart;
  if (houseGroup) {
    houseGroup.rotation.y = elapsed * 0.18;
  }

  renderer.render(scene, camera);
  animationFrame = requestAnimationFrame(animate);
};

const disposeObject = (obj) => {
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => m.dispose());
    }
  });
};

const teardown = () => {
  disposed = true;
  if (animationFrame) cancelAnimationFrame(animationFrame);
  if (resizeObserver) resizeObserver.disconnect();
  if (scene) disposeObject(scene);
  if (renderer) renderer.dispose();
  if (container.value) container.value.replaceChildren();
  renderer = scene = camera = houseGroup = animationFrame = resizeObserver = null;
};

const resize = () => {
  if (!container.value || !renderer || !camera) return;
  const width = container.value.clientWidth;
  const height = container.value.clientHeight;
  const aspect = width / height;
  camera.left = -currentFrame * aspect;
  camera.right = currentFrame * aspect;
  camera.top = currentFrame;
  camera.bottom = -currentFrame;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
};

const rebuild = async () => {
  teardown();
  sceneStart = performance.now() / 1000;
  await nextTick();
  await setupScene();
  resizeObserver = new ResizeObserver(resize);
  if (container.value) resizeObserver.observe(container.value);
};

onMounted(async () => {
  sceneStart = performance.now() / 1000;
  await nextTick();
  await setupScene();
  resizeObserver = new ResizeObserver(resize);
  if (container.value) resizeObserver.observe(container.value);
});

watch(() => props.layoutId, rebuild);

onBeforeUnmount(teardown);
</script>

<template>
  <div class="house-scene-wrap">
    <div ref="container" class="house-canvas" aria-label="3D house preview" />
    <Transition name="fade">
      <div v-if="status" class="house-scene-loading">{{ status }}</div>
    </Transition>
  </div>
</template>
