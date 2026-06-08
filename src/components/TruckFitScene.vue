<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { modelAssetFor } from '../data/rooms.js';
import logoUrl from '../../images/logo.png';

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
  const moduleLoader = modelModules[`../../Kenny/Models/GLTF format/${modelAssetFor(asset)}.glb`];
  return moduleLoader ? moduleLoader() : null;
};

const container = ref(null);
const status = ref('Loading 3D truck fit');

let renderer;
let scene;
let camera;
let controls;
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

const makeLabelTexture = (text) => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f8fbfa';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#1e8a7c';
  ctx.lineWidth = 16;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.fillStyle = '#172124';
  ctx.font = '700 46px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const words = String(text || 'Custom item').split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width > 420 && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  const visibleLines = lines.slice(0, 3);
  visibleLines.forEach((line, index) => {
    ctx.fillText(line, canvas.width / 2, canvas.height / 2 + (index - (visibleLines.length - 1) / 2) * 54);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const buildCustomBox = (item) => {
  const width = Math.max(item.widthMeters, 0.05);
  const height = Math.max(item.heightMeters, 0.05);
  const depth = Math.max(item.depthMeters, 0.05);
  const labelMaterial = new THREE.MeshStandardMaterial({
    map: makeLabelTexture(item.name),
    roughness: 0.72,
    metalness: 0.03,
  });
  const plainMaterial = makeMaterial(0xd9ece8);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    [
      labelMaterial.clone(),
      labelMaterial.clone(),
      plainMaterial.clone(),
      plainMaterial.clone(),
      labelMaterial.clone(),
      labelMaterial.clone(),
    ],
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.y = height / 2;

  const wrapper = new THREE.Group();
  wrapper.add(mesh);
  wrapper.rotation.y = item.rotated ? Math.PI / 2 : 0;
  wrapper.userData.targetY = 0.08;
  wrapper.userData.delay = item.batch * 0.16 + (item.sequence % 4) * 0.04;
  wrapper.userData.settled = false;
  return wrapper;
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
  // Clean rail frame around the whole top perimeter of the truck.
  const railThickness = 0.08;
  const railY = cargoHeight + railThickness / 2;
  const railSpanX = cargoLength + railThickness;
  const railSpanZ = cargoDepth + railThickness;
  group.add(makeBox(railSpanX, railThickness, railThickness, truckPalette.rail, { x: 0, y: railY, z: cargoDepth / 2 + railThickness / 2 }));
  group.add(makeBox(railSpanX, railThickness, railThickness, truckPalette.rail, { x: 0, y: railY, z: -cargoDepth / 2 - railThickness / 2 }));
  group.add(makeBox(railThickness, railThickness, railSpanZ, truckPalette.rail, { x: cargoLength / 2 + railThickness / 2, y: railY, z: 0 }));
  group.add(makeBox(railThickness, railThickness, railSpanZ, truckPalette.rail, { x: -cargoLength / 2 - railThickness / 2, y: railY, z: 0 }));

  // Brand logo on the truck's exterior near-side panel (the open long side facing the camera).
  const logoMaterial = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const logoMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), logoMaterial);
  logoMesh.visible = false;
  logoMesh.position.set(0, cargoHeight * 0.55, cargoDepth / 2 + 0.05);
  logoMesh.renderOrder = 2; // draw over the translucent walls so it reads cleanly
  group.add(logoMesh);
  new THREE.TextureLoader().load(logoUrl, (texture) => {
    if (disposed) return;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;
    logoMaterial.map = texture;
    logoMaterial.needsUpdate = true;
    const imageAspect = texture.image.width / texture.image.height;
    const maxWidth = cargoLength * 0.5;
    const maxHeight = cargoHeight * 0.62;
    let logoWidth = maxWidth;
    let logoHeight = logoWidth / imageAspect;
    if (logoHeight > maxHeight) {
      logoHeight = maxHeight;
      logoWidth = logoHeight * imageAspect;
    }
    logoMesh.geometry.dispose();
    logoMesh.geometry = new THREE.PlaneGeometry(logoWidth, logoHeight);
    logoMesh.visible = true;
  });

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

// The world-space rotation that reproduces a packed orientation: first tip the item onto the
// chosen face (so a different axis points up), then apply the yaw spin about vertical. Mirrors
// the voxel rotations in shapes.js — 'end' tips depth up, 'side' tips width up.
const orientationQuaternion = (item) => {
  const tip = new THREE.Quaternion();
  if (item.flip === 'end') {
    tip.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2); // depth (Z) → up (Y)
  } else if (item.flip === 'side') {
    tip.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2); // width (X) → up (Y)
  }
  const yaw = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    -((item.yaw || 0) * Math.PI) / 2,
  );
  return yaw.multiply(tip); // yaw applied in the world frame, after the tip
};

const WORLD_AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];

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

  // item.width/depth/heightMeters are the cell extents the packer assigned along the truck's
  // world axes (X = length, Y = up, Z = depth) — already post-rotation. We rotate the model into
  // the packed pose, then stretch it in its OWN (un-rotated) frame so that, once rotated, each
  // natural axis fills the world extent it lands on. The stretch is never more than ~10 cm.
  // Boxes are drawn a touch smaller than their cell so a ~2% gap shows between neighbours —
  // otherwise a stack of identical cartons reads as one solid block.
  const isBox = modelAssetFor(item.asset) === 'cardboardBoxClosed';
  const fill = isBox ? 0.98 : 1;
  const quaternion = orientationQuaternion(item);
  const target = [
    Math.max(item.widthMeters * fill, 0.05),
    Math.max(item.heightMeters * fill, 0.05),
    Math.max(item.depthMeters * fill, 0.05),
  ];

  const naturalSize = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).toArray();
  // For each natural model axis, find which world axis it points along after rotation, then scale
  // that axis to the matching world target. Generalises the old width/depth swap to any tip.
  const scale = [0, 1, 2].map((i) => {
    const rotated = WORLD_AXES[i].clone().applyQuaternion(quaternion);
    const comps = [Math.abs(rotated.x), Math.abs(rotated.y), Math.abs(rotated.z)];
    const worldAxis = comps.indexOf(Math.max(...comps));
    return target[worldAxis] / Math.max(naturalSize[i], 0.01);
  });
  model.scale.set(scale[0], scale[1], scale[2]);

  // Apply the pose on a pivot, then re-seat it: centred in X/Z, resting on the floor (min Y = 0).
  const pivot = new THREE.Group();
  pivot.quaternion.copy(quaternion);
  pivot.add(model);
  const posedBox = new THREE.Box3().setFromObject(pivot);
  const center = posedBox.getCenter(new THREE.Vector3());
  pivot.position.set(-center.x, -posedBox.min.y, -center.z);

  const wrapper = new THREE.Group();
  wrapper.add(pivot);
  wrapper.userData.targetY = 0.08;
  wrapper.userData.delay = item.batch * 0.16 + (item.sequence % 4) * 0.04;
  wrapper.userData.settled = false;
  return wrapper;
};

const addPackedItems = async (truckData, truckMesh) => {
  const loaded = await Promise.all(truckData.items.map((item) => (item.custom ? null : loadModel(item.asset))));
  if (disposed) return;

  truckData.items.forEach((item, index) => {
    const packedItem = {
      ...item,
      widthMeters: item.width * truckMesh.cellLength,
      depthMeters: item.depth * truckMesh.cellDepth,
      heightMeters: item.height * truckMesh.cellHeight,
    };
    const object = item.custom ? buildCustomBox(packedItem) : normalizeModel(loaded[index], packedItem);
    if (!object) return;

    const x = -truckMesh.cargoLength / 2 + (item.x + item.width / 2) * truckMesh.cellLength;
    const z = -truckMesh.cargoDepth / 2 + (item.y + item.depth / 2) * truckMesh.cellDepth;
    const targetY = 0.08 + item.z * truckMesh.cellHeight;
    object.position.set(x, truckMesh.cargoHeight + 1.5 + item.batch * 0.52, z);
    object.userData.targetX = x;
    object.userData.targetY = targetY;
    object.userData.targetZ = z;
    object.userData.startY = truckMesh.cargoHeight + 1.5 + targetY;
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

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minZoom = 0.4;
  controls.maxZoom = 4.0;
  controls.minPolarAngle = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.02; // stop just above the ground plane
  controls.update();

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

  if (controls) controls.update();
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
  if (controls) controls.dispose();
  controls = null;
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
