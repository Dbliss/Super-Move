// Auto-measure the bounding box of each Kenny GLTF asset so the packer and the renderer
// agree on dimensions. Returns dims in cm (rounded), with the Y axis treated as height
// (GLTFs are Y-up) and X / Z as the floor footprint.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const modelModules = import.meta.glob('../../Kenny/Models/GLTF format/*.glb', {
  query: '?url',
  import: 'default',
});

const loader = new GLTFLoader();
const cache = new Map(); // asset -> Promise<{widthCm, depthCm, heightCm} | null>

// The Kenny "Furniture Kit" models render at roughly half real-world scale
// (e.g. a "Double bed" is ~96 cm wide instead of ~140 cm). Trucks in this app
// are modelled at full real-world scale, so we up-scale every measured asset
// by this factor to make the load look right inside the truck. The same scale
// is used everywhere (packer cells + rendered mesh) so adjacent items stay flush.
const ASSET_SCALE = 1.7;

const measure = (sceneRoot) => {
  const box = new THREE.Box3().setFromObject(sceneRoot);
  const size = box.getSize(new THREE.Vector3());
  // Treat the GLTF as being in metres. Round up to the nearest cm so we never under-report.
  return {
    widthCm: Math.max(1, Math.ceil(size.x * 100 * ASSET_SCALE)),
    heightCm: Math.max(1, Math.ceil(size.y * 100 * ASSET_SCALE)),
    depthCm: Math.max(1, Math.ceil(size.z * 100 * ASSET_SCALE)),
  };
};

export const measureAsset = (asset) => {
  if (cache.has(asset)) return cache.get(asset);
  const moduleLoader = modelModules[`../../Kenny/Models/GLTF format/${asset}.glb`];
  if (!moduleLoader) {
    const missing = Promise.resolve(null);
    cache.set(asset, missing);
    return missing;
  }
  const promise = moduleLoader().then(
    (url) =>
      new Promise((resolve) => {
        loader.load(
          url,
          (gltf) => resolve(measure(gltf.scene)),
          undefined,
          (error) => {
            console.warn(`Could not measure Kenny model for ${asset}`, error);
            resolve(null);
          },
        );
      }),
  );
  cache.set(asset, promise);
  return promise;
};
