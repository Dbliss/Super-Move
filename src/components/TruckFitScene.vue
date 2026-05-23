<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const props = defineProps({
  trucks: {
    type: Array,
    required: true,
  },
});

const modelModules = import.meta.glob('../../Kenny/Models/GLTF format/*.glb', {
  query: '?url',
  import: 'default',
});

const modelUrlFor = async (asset) => {
  const moduleLoader = modelModules[`../../Kenny/Models/GLTF format/${asset}.glb`];
  return moduleLoader ? moduleLoader() : null;
};

const container = ref(null);
const status = ref('Loading 3D truck fit');

let renderer;
let scene;
let camera;
let resizeObserver;
let animationFrame;
let disposed = false;
let sceneStart = 0;
let cameraFrame = 6.15;

const loader = new GLTFLoader();
const modelCache = new Map();

const truckPalette = {
  floor: 0xe2cd69,
  wall: 0xf4e3a2,
  rail: 0xd4b84f,
  dark: 0x263234,
};

const loadModel = (asset) => {
  if (!modelCache.has(asset)) {
    modelCache.set(
      asset,
      modelUrlFor(asset).then((url) => new Promise((resolve) => {
        if (!url) {
          resolve(null);
          return;
        }

        loader.load(
          url,
          (model) => resolve(model.scene),
          undefined,
          (error) => {
            console.warn(`Could not load Kenney model for ${asset}`, error);
            resolve(null);
          },
        );
      })),
    );
  }

  return modelCache.get(asset);
};

const makeMaterial = (color, options = {}) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: 0.68,
    metalness: 0.05,
    ...options,
  });

const makeBox = (width, height, depth, color, position, options = {}) => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    makeMaterial(color, options),
  );
  mesh.position.set(position.x, position.y, position.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

const buildTruck = (truck, index) => {
  const group = new THREE.Group();
  const cargoLength = truck.cargoLength;
  const cargoDepth = truck.cargoWidth;
  const cargoHeight = truck.cargoHeight;
  const offset = (index - (props.trucks.length - 1) / 2) * (cargoDepth + 1.2);

  group.position.z = offset;
  group.add(makeBox(cargoLength, 0.08, cargoDepth, truckPalette.floor, { x: 0, y: 0, z: 0 }));
  group.add(makeBox(cargoLength, cargoHeight, 0.08, truckPalette.wall, { x: 0, y: cargoHeight / 2, z: -cargoDepth / 2 - 0.04 }, { transparent: true, opacity: 0.72 }));
  group.add(makeBox(0.08, cargoHeight, cargoDepth, truckPalette.wall, { x: -cargoLength / 2 - 0.04, y: cargoHeight / 2, z: 0 }, { transparent: true, opacity: 0.72 }));
  group.add(makeBox(cargoLength, 0.1, 0.08, truckPalette.rail, { x: 0, y: cargoHeight + 0.04, z: cargoDepth / 2 + 0.04 }));
  group.add(makeBox(0.08, 0.1, cargoDepth, truckPalette.rail, { x: cargoLength / 2 + 0.04, y: cargoHeight + 0.04, z: 0 }));

  const gridColumns = truck.packingGrid?.columns || truck.gridColumns;
  const gridRows = truck.packingGrid?.rows || truck.gridRows;
  const grid = new THREE.GridHelper(Math.max(cargoLength, cargoDepth), Math.max(gridColumns, gridRows), 0xc8b764, 0xdccb7a);
  grid.position.y = 0.045;
  grid.scale.x = cargoLength / Math.max(cargoLength, cargoDepth);
  grid.scale.z = cargoDepth / Math.max(cargoLength, cargoDepth);
  group.add(grid);

  return {
    group,
    cargoLength,
    cargoDepth,
    cargoHeight,
    cellLength: cargoLength / gridColumns,
    cellDepth: cargoDepth / gridRows,
    cellHeight: cargoHeight / (truck.packingGrid?.maxHeight || Math.max(1, Math.round(cargoHeight * 10))),
  };
};

const normalizeModel = (source, item) => {
  if (!source) return null;

  const model = source.clone(true);
  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material) {
        child.material = child.material.clone();
        child.material.roughness = 0.72;
      }
    }
  });

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const maxWidth = Math.max(item.widthMeters * 0.82, 0.22);
  const maxDepth = Math.max(item.depthMeters * 0.82, 0.22);
  const maxHeight = Math.max(item.heightMeters * 0.9, 0.28);
  const scale = Math.min(maxWidth / Math.max(size.x, 0.01), maxHeight / Math.max(size.y, 0.01), maxDepth / Math.max(size.z, 0.01)) * item.modelScale;
  model.scale.multiplyScalar(scale);

  const scaledBox = new THREE.Box3().setFromObject(model);
  const center = scaledBox.getCenter(new THREE.Vector3());
  const minY = scaledBox.min.y;
  model.position.set(-center.x, -minY, -center.z);

  const wrapper = new THREE.Group();
  wrapper.add(model);
  wrapper.rotation.y = item.rotated ? Math.PI / 2 : 0;
  wrapper.userData.targetY = 0.08;
  wrapper.userData.delay = item.batch * 0.48 + (item.sequence % 4) * 0.08;
  wrapper.userData.settled = false;
  return wrapper;
};

const addPackedItems = async (truckData, truckMesh) => {
  const loaded = await Promise.all(truckData.items.map((item) => loadModel(item.asset)));
  if (disposed) return;

  truckData.items.forEach((item, index) => {
    const packedItem = {
      ...item,
      widthMeters: item.width * truckMesh.cellLength,
      depthMeters: item.depth * truckMesh.cellDepth,
      heightMeters: item.height * truckMesh.cellHeight,
    };
    const object = normalizeModel(loaded[index], packedItem);
    if (!object) return;

    const x = -truckMesh.cargoLength / 2 + (item.x + item.width / 2) * truckMesh.cellLength;
    const z = -truckMesh.cargoDepth / 2 + (item.y + item.depth / 2) * truckMesh.cellDepth;
    const targetY = 0.08 + item.z * truckMesh.cellHeight;
    object.position.set(x, truckMesh.cargoHeight + 2.6 + item.batch * 0.52, z);
    object.userData.targetX = x;
    object.userData.targetY = targetY;
    object.userData.targetZ = z;
    object.userData.startY = truckMesh.cargoHeight + 2.6 + targetY;
    truckMesh.group.add(object);
  });
};

const setupScene = async () => {
  if (!container.value) return;

  disposed = false;
  status.value = 'Loading 3D truck fit';
  sceneStart = performance.now() / 1000;
  scene = new THREE.Scene();

  const width = container.value.clientWidth || 900;
  const height = container.value.clientHeight || 520;
  const aspect = width / height;
  const largestTruckLength = Math.max(...props.trucks.map((truck) => truck.cargoLength));
  const largestTruckHeight = Math.max(...props.trucks.map((truck) => truck.cargoHeight));
  cameraFrame = Math.max(3.55, largestTruckLength * 0.66, largestTruckHeight * 1.55);
  camera = new THREE.OrthographicCamera(-cameraFrame * aspect, cameraFrame * aspect, cameraFrame, -cameraFrame, 0.1, 100);
  camera.position.set(8.3, 7.0, 9.2);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.value.replaceChildren(renderer.domElement);

  const ambient = new THREE.HemisphereLight(0xffffff, 0xa9b9b5, 2.7);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(6, 10, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(36, 24),
    new THREE.ShadowMaterial({ color: 0x6d7775, opacity: 0.12 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.03;
  ground.receiveShadow = true;
  scene.add(ground);

  const truckMeshes = props.trucks.map((truck, index) => {
    const truckMesh = buildTruck(truck, index);
    scene.add(truckMesh.group);
    return truckMesh;
  });

  await Promise.all(props.trucks.map((truck, index) => addPackedItems(truck, truckMeshes[index])));
  status.value = '';
  animate();
};

const animate = () => {
  if (disposed || !renderer || !scene || !camera) return;

  const elapsed = performance.now() / 1000 - sceneStart;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  scene.traverse((object) => {
    if (!object.userData || object.userData.targetY === undefined) return;

    if (reduceMotion) {
      object.position.y = object.userData.targetY;
      return;
    }

    const t = Math.max(0, Math.min(1, (elapsed - object.userData.delay) / 0.72));
    const eased = 1 - Math.pow(1 - t, 3);
    object.position.y = THREE.MathUtils.lerp(object.userData.startY, object.userData.targetY, eased);
    if (t > 0.82) {
      object.position.y += Math.sin((t - 0.82) * Math.PI * 3) * 0.05 * (1 - t);
    }
  });

  scene.rotation.y = Math.sin(elapsed * 0.24) * 0.025;
  renderer.render(scene, camera);
  animationFrame = requestAnimationFrame(animate);
};

const disposeObject = (object) => {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose());
      } else {
        child.material.dispose();
      }
    }
  });
};

const teardown = () => {
  disposed = true;
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = null;
  if (resizeObserver) resizeObserver.disconnect();
  resizeObserver = null;
  if (scene) disposeObject(scene);
  if (renderer) renderer.dispose();
  if (container.value) container.value.replaceChildren();
  renderer = null;
  scene = null;
  camera = null;
};

const resize = () => {
  if (!container.value || !renderer || !camera) return;
  const width = container.value.clientWidth || 900;
  const height = container.value.clientHeight || 520;
  const aspect = width / height;
  camera.left = -cameraFrame * aspect;
  camera.right = cameraFrame * aspect;
  camera.top = cameraFrame;
  camera.bottom = -cameraFrame;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
};

onMounted(async () => {
  await nextTick();
  await setupScene();
  resizeObserver = new ResizeObserver(resize);
  if (container.value) resizeObserver.observe(container.value);
});

watch(
  () => props.trucks,
  async () => {
    teardown();
    await nextTick();
    await setupScene();
    resizeObserver = new ResizeObserver(resize);
    if (container.value) resizeObserver.observe(container.value);
  },
  { deep: true },
);

onBeforeUnmount(teardown);
</script>

<template>
  <div class="three-truck-scene">
    <div ref="container" class="three-canvas" aria-label="3D packed truck visualization"></div>
    <div v-if="status" class="three-loading">{{ status }}</div>
  </div>
</template>
