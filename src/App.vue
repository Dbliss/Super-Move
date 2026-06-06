<script setup>
import { computed, reactive, ref, watch } from 'vue';
import TruckFitScene from './components/TruckFitScene.vue';
import HouseScene from './components/HouseScene.vue';
import objectShapes from './data/objectShapes.json';
import savedDimensions from './data/objectDimensions.json';
import savedAttributes from './data/objectAttributes.json';
import { rooms } from './data/rooms.js';
import { resolveAttributes } from './data/attributes.js';
import { buildShape, buildComposite } from './utils/shapes.js';
import { planAndPack, estimateFleet } from './utils/packing.js';
import { measureAsset } from './utils/assetDimensions.js';

const sideImages = import.meta.glob('../Kenny/Side/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

const imageFor = (asset) => sideImages[`../Kenny/Side/${asset}.png`];

const houseTypes = [
  {
    id: 'studio',
    name: 'Studio',
    detail: 'Compact move with fewer room types.',
    rooms: ['bedroom', 'living', 'kitchen', 'bathroom'],
    // Starting furniture this home type usually has, by item id. Loaded into the quote
    // when the house type is chosen, then the customer adjusts up or down.
    defaults: {
      bedDouble: 1,
      cabinetBedDrawer: 1,
      sideTableDrawers: 1,
      cardboardBoxClosedBedroom: 4,
      loungeSofaLong: 1,
      televisionModern: 1,
      cabinetTelevision: 1,
      tableCoffee: 1,
      kitchenFridge: 1,
      kitchenMicrowave: 1,
      cardboardBoxClosedKitchen: 3,
      bathroomCabinet: 1,
      cardboardBoxClosedBathroom: 1,
    },
  },
  {
    id: 'apartment',
    name: 'Apartment',
    detail: 'Most common rooms, usually one truck load.',
    rooms: ['bedroom', 'living', 'dining', 'kitchen', 'laundry', 'bathroom'],
    defaults: {
      bedDouble: 1,
      bedSingle: 1,
      cabinetBedDrawer: 1,
      sideTableDrawers: 2,
      cardboardBoxClosedBedroom: 6,
      loungeSofaLong: 1,
      loungeChair: 1,
      televisionModern: 1,
      cabinetTelevision: 1,
      tableCoffee: 1,
      bookcaseOpen: 1,
      table: 1,
      chair: 4,
      kitchenFridgeLarge: 1,
      kitchenMicrowave: 1,
      kitchenStove: 1,
      cardboardBoxClosedKitchen: 5,
      washer: 1,
      dryer: 1,
      bathroomCabinet: 1,
      bathroomMirror: 1,
      cardboardBoxClosedBathroom: 2,
    },
  },
  {
    id: 'townhouse',
    name: 'Townhouse',
    detail: 'Multi-room home with office or garage items.',
    rooms: ['bedroom', 'living', 'dining', 'kitchen', 'office', 'laundry', 'bathroom', 'garage'],
    defaults: {
      bedDouble: 1,
      bedSingle: 2,
      cabinetBedDrawer: 2,
      sideTableDrawers: 3,
      cardboardBoxClosedBedroom: 10,
      loungeSofaLong: 1,
      loungeChair: 2,
      televisionModern: 1,
      cabinetTelevision: 1,
      tableCoffee: 1,
      bookcaseOpen: 1,
      table: 1,
      chair: 6,
      kitchenFridgeLarge: 1,
      kitchenMicrowave: 1,
      kitchenStove: 1,
      cardboardBoxClosedKitchen: 8,
      desk: 1,
      chairDesk: 1,
      computerScreen: 1,
      cardboardBoxClosedOffice: 4,
      washer: 1,
      dryer: 1,
      bathroomCabinet: 1,
      bathroomMirror: 1,
      cardboardBoxClosedBathroom: 2,
      bench: 1,
      bookcaseClosedGarage: 1,
      cardboardBoxClosedGarage: 6,
    },
  },
  {
    id: 'house',
    name: 'House',
    detail: 'Full home inventory across all common spaces.',
    rooms: ['bedroom', 'living', 'dining', 'kitchen', 'office', 'laundry', 'bathroom', 'garage'],
    defaults: {
      bedDouble: 2,
      bedSingle: 2,
      cabinetBedDrawer: 3,
      sideTableDrawers: 4,
      cardboardBoxClosedBedroom: 14,
      loungeSofaLong: 1,
      loungeSofaCorner: 1,
      loungeChair: 2,
      televisionModern: 2,
      cabinetTelevision: 1,
      tableCoffee: 1,
      bookcaseOpen: 2,
      table: 1,
      chair: 8,
      bookcaseClosedWideDining: 1,
      kitchenFridgeLarge: 1,
      kitchenMicrowave: 1,
      kitchenStove: 1,
      cardboardBoxClosedKitchen: 12,
      desk: 1,
      deskCorner: 1,
      chairDesk: 2,
      computerScreen: 2,
      bookcaseOpenOffice: 1,
      cardboardBoxClosedOffice: 6,
      washerDryerStacked: 1,
      bathroomCabinet: 2,
      bathroomMirror: 2,
      cardboardBoxClosedBathroom: 3,
      bench: 1,
      bookcaseClosedGarage: 2,
      cardboardBoxClosedGarage: 10,
    },
  },
];

const truckSizes = [
  {
    id: 'small',
    name: 'Small',
    capacity: 18,
    width: 130,
    gridColumns: 10,
    gridRows: 5,
    cargoLength: 4.1,
    cargoWidth: 2.2,
    cargoHeight: 2.1,
  },
  {
    id: 'medium',
    name: 'Medium',
    capacity: 32,
    width: 170,
    gridColumns: 14,
    gridRows: 5,
    cargoLength: 6.2,
    cargoWidth: 2.35,
    cargoHeight: 2.25,
  },
  {
    id: 'large',
    name: 'Large',
    capacity: 50,
    width: 220,
    gridColumns: 18,
    gridRows: 5,
    cargoLength: 8.8,
    cargoWidth: 2.4,
    cargoHeight: 2.4,
  },
];

const packingCellCm = 10;
const fallbackDimensions = { widthCm: 60, depthCm: 60, heightCm: 60 };

const toCells = (centimeters) => Math.max(1, Math.ceil(centimeters / packingCellCm));

// Measured GLTF dims, keyed by asset name. Populated lazily as items enter the inventory.
const measuredAssetDims = reactive({});

// Overall bounding-box extent (cm) of a saved entry, whether it's a single box or a
// composite collection of rectangles.
const overallDims = (entry) => {
  if (entry?.type === 'composite' && Array.isArray(entry.boxes)) {
    let widthCm = 1;
    let depthCm = 1;
    let heightCm = 1;
    for (const b of entry.boxes) {
      widthCm = Math.max(widthCm, b.x + b.w);
      depthCm = Math.max(depthCm, b.y + b.d);
      heightCm = Math.max(heightCm, b.z + b.h);
    }
    return { widthCm, depthCm, heightCm };
  }
  return entry;
};

// Dimensions hand-tuned in the /dimensions editor always win over the auto-measured guess,
// which only ever applies a blanket scale and is wrong for many models.
const dimsForAsset = (asset) => {
  const saved = savedDimensions[asset];
  if (saved) return overallDims(saved);
  return measuredAssetDims[asset] || fallbackDimensions;
};

// Convert a composite box (cm offsets/sizes) into cell units for the voxel packer.
const compositeBoxToCells = (box) => ({
  x: Math.max(0, Math.floor(box.x / packingCellCm)),
  y: Math.max(0, Math.floor(box.y / packingCellCm)),
  z: Math.max(0, Math.floor(box.z / packingCellCm)),
  w: toCells(box.w),
  d: toCells(box.d),
  h: toCells(box.h),
});

const profileForItem = (item) => {
  const saved = savedDimensions[item.asset];
  const dimensions = dimsForAsset(item.asset);
  const attributes = resolveAttributes(item.id, savedAttributes);

  let templateName;
  let shape;
  let realVolume;
  if (saved?.type === 'composite' && Array.isArray(saved.boxes)) {
    // Hand-built collection of rectangles wins outright — use its exact occupied volume.
    templateName = 'composite';
    shape = buildComposite(saved.boxes.map(compositeBoxToCells));
    realVolume = (shape.voxels.length * packingCellCm ** 3) / 1_000_000;
  } else {
    // A defined regular box is taken literally (plain box); only undefined assets fall back to
    // the parametric objectShapes template applied to the auto-measured dimensions.
    templateName = saved ? 'box' : objectShapes.items[item.id] || objectShapes.default || 'box';
    shape = buildShape(templateName, toCells(dimensions.widthCm), toCells(dimensions.depthCm), toCells(dimensions.heightCm));
    realVolume = (dimensions.widthCm * dimensions.depthCm * dimensions.heightCm) / 1_000_000;
  }

  return {
    templateName,
    dimensionsCm: dimensions,
    width: shape.width,
    depth: shape.depth,
    height: shape.height,
    widthMeters: dimensions.widthCm / 100,
    depthMeters: dimensions.depthCm / 100,
    heightMeters: dimensions.heightCm / 100,
    modelScale: 1,
    stackLevel: attributes.stackLevel,
    openTop: attributes.openTop,
    shape,
    volume: realVolume,
  };
};

const buildTruckTemplate = (truck, count = 1) => ({
  ...truck,
  count,
  cellsX: Math.max(1, Math.round((truck.cargoLength * 100) / packingCellCm)),
  cellsY: Math.max(1, Math.round((truck.cargoWidth * 100) / packingCellCm)),
  cellsZ: Math.max(1, Math.round((truck.cargoHeight * 100) / packingCellCm)),
});

const step = ref(0);
const selectedHouseType = ref(null);
const previewedHouseType = ref(null);
const activeRoomId = ref('bedroom');
const roomPresence = reactive(Object.fromEntries(rooms.map((room) => [room.id, null])));
const quantities = reactive({});

const selectedHouse = computed(() => houseTypes.find((house) => house.id === selectedHouseType.value));

const includedRooms = computed(() => rooms.filter((room) => roomPresence[room.id] === true));

const skippedRoomCount = computed(() => rooms.filter((room) => roomPresence[room.id] === false).length);

const activeRoom = computed(() => includedRooms.value.find((room) => room.id === activeRoomId.value) || includedRooms.value[0]);

const inventory = computed(() => {
  const allItems = rooms.flatMap((room) => room.items.map((item) => ({ ...item, room: room.name })));
  return allItems
    .map((item) => {
      const dims = dimsForAsset(item.asset);
      const realVolume = (dims.widthCm * dims.depthCm * dims.heightCm) / 1_000_000;
      return { ...item, volume: realVolume, quantity: quantities[item.id] || 0 };
    })
    .filter((item) => item.quantity > 0);
});

// Kick off bounding-box measurement for every asset that lands in the inventory.
// Each result populates measuredAssetDims (reactive), which re-runs the packer.
watch(
  inventory,
  (items) => {
    const assets = new Set(items.map((i) => i.asset));
    for (const asset of assets) {
      if (savedDimensions[asset] || measuredAssetDims[asset]) continue;
      measureAsset(asset).then((dims) => {
        if (dims) measuredAssetDims[asset] = dims;
      });
    }
  },
  { immediate: true },
);

const totalItems = computed(() => inventory.value.reduce((sum, item) => sum + item.quantity, 0));

const totalVolume = computed(() =>
  inventory.value.reduce((sum, item) => sum + item.volume * item.quantity, 0),
);

const roomProgressLabel = computed(() => {
  if (!includedRooms.value.length) return 'No rooms selected yet';
  const currentIndex = includedRooms.value.findIndex((room) => room.id === activeRoom.value?.id);
  return `Room ${currentIndex + 1} of ${includedRooms.value.length}`;
});

// Truck catalog with cell grids, derived once for the packer/selector to consume.
const truckSizesWithCells = computed(() => truckSizes.map((truck) => buildTruckTemplate(truck, 1)));

// Live fleet recommendation. A cheap lower-bound estimate (dimensional floor + volume + base
// floor-area) — no voxel packing — so it stays snappy as items are added. The authoritative
// fleet comes from planAndPack below; recommendationCardText reads that.
const recommendedPlan = computed(() =>
  estimateFleet(packedUnits.value, truckSizesWithCells.value),
);

const recommendedTruckText = computed(() => {
  if (!recommendedPlan.value.length) return 'Add furniture to calculate a truck';
  return recommendedPlan.value.map((truck) => `${truck.count} x ${truck.name}`).join(' + ');
});

const totalTruckCapacity = computed(() =>
  recommendedPlan.value.reduce((sum, truck) => sum + truck.capacity * truck.count, 0),
);

const fillPercent = computed(() => {
  if (!totalTruckCapacity.value) return 0;
  return Math.min(100, Math.round((totalVolume.value / totalTruckCapacity.value) * 100));
});

const packedUnits = computed(() =>
  inventory.value.flatMap((item) =>
    Array.from({ length: item.quantity }, (_, index) => ({
      key: `${item.id}-${index}`,
      id: item.id,
      asset: item.asset,
      name: item.name,
      room: item.room,
      volume: item.volume,
      ...profileForItem(item),
    })),
  ),
);

const packedTrucks = computed(() => {
  if (!packedUnits.value.length) return [];

  const { trucks } = planAndPack(packedUnits.value, {
    truckSizes: truckSizesWithCells.value,
  });

  return trucks.map((truck) => ({
    ...truck,
    packingGrid: {
      columns: truck.cellsX,
      rows: truck.cellsY,
      maxHeight: truck.cellsZ,
    },
    items: truck.items.map((item) => ({
      ...item,
      batch: Math.floor(item.sequence / 4),
      zIndex:
        20 +
        item.z * truck.cellsX * truck.cellsY +
        item.y * truck.cellsX +
        item.x,
    })),
  }));
});

// Total cargo capacity of the fleet the packer actually returned (authoritative). Falls back to
// the live lower-bound estimate before anything has been packed.
const packedTruckCapacity = computed(() => {
  if (!packedTrucks.value.length) return totalTruckCapacity.value;
  return packedTrucks.value.reduce((sum, truck) => sum + truck.capacity, 0);
});

const recommendationCardText = computed(() => {
  if (!packedTrucks.value.length) {
    if (!recommendedPlan.value.length) return 'Add furniture to calculate a truck';
    return recommendedPlan.value
      .map((truck) => `${truck.count > 1 ? `${truck.count} x ` : ''}${truck.name} Truck`)
      .join(' + ');
  }
  // Summarise the actual packed trucks (collapse duplicate sizes).
  const counts = new Map();
  for (const truck of packedTrucks.value) {
    counts.set(truck.name, (counts.get(truck.name) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => `${count > 1 ? `${count} x ` : ''}${name} Truck`)
    .join(' + ');
});

const chooseHouse = (id) => {
  selectedHouseType.value = id;
  const house = houseTypes.find((house) => house.id === id);
  const selectedRooms = new Set(house?.rooms || []);
  rooms.forEach((room) => {
    roomPresence[room.id] = selectedRooms.has(room.id);
  });
  activeRoomId.value = rooms.find((room) => selectedRooms.has(room.id))?.id || rooms[0].id;

  // Pre-fill a typical furniture selection for the chosen home so the customer starts
  // from a sensible inventory and tweaks from there rather than a blank slate.
  const defaults = house?.defaults || {};
  rooms.forEach((room) => {
    room.items.forEach((item) => {
      quantities[item.id] = defaults[item.id] || 0;
    });
  });
};

const setRoomPresence = (roomId, value) => {
  roomPresence[roomId] = value;
  if (value && !includedRooms.value.some((room) => room.id === activeRoomId.value)) {
    activeRoomId.value = roomId;
  }
};

const changeQuantity = (itemId, amount) => {
  quantities[itemId] = Math.max(0, (quantities[itemId] || 0) + amount);
};

const nextRoom = () => {
  const index = includedRooms.value.findIndex((room) => room.id === activeRoom.value?.id);
  if (index >= 0 && index < includedRooms.value.length - 1) {
    activeRoomId.value = includedRooms.value[index + 1].id;
  } else {
    step.value = 3;
  }
};

const resetQuote = () => {
  step.value = 0;
  selectedHouseType.value = null;
  activeRoomId.value = 'bedroom';
  rooms.forEach((room) => {
    roomPresence[room.id] = null;
    room.items.forEach((item) => {
      quantities[item.id] = 0;
    });
  });
};
</script>

<template>
  <main class="app-shell">
    <section class="builder-panel">
      <header class="panel-header">
        <div>
          <p class="eyebrow">Removalist estimate</p>
          <h2 v-if="step === 0">Pick the house type</h2>
          <h2 v-else-if="step === 1">Confirm the rooms</h2>
          <h2 v-else-if="step === 2">Add furniture by room</h2>
          <h2 v-else>Review the truck fit</h2>
        </div>
        <button class="ghost-button" type="button" @click="resetQuote">Reset</button>
      </header>

      <section v-if="step === 0" class="content-flow house-picker-flow">
        <div class="house-preview-wrap">
          <HouseScene :layout-id="previewedHouseType || selectedHouseType || 'studio'" />
        </div>

        <div class="house-type-row">
          <button
            v-for="house in houseTypes"
            :key="house.id"
            class="house-type-pill"
            :class="{ selected: selectedHouseType === house.id, previewed: previewedHouseType === house.id && selectedHouseType !== house.id }"
            type="button"
            @mouseenter="previewedHouseType = house.id"
            @mouseleave="previewedHouseType = null"
            @click="chooseHouse(house.id)"
          >
            <span class="pill-name">{{ house.name }}</span>
            <small class="pill-detail">{{ house.detail }}</small>
          </button>
        </div>

        <footer class="action-row split">
          <p v-if="selectedHouse" class="selected-house-note">
            <strong>{{ selectedHouse.name }}</strong> — {{ selectedHouse.rooms.length }} rooms
          </p>
          <span v-else />
          <button class="primary-button" type="button" :disabled="!selectedHouseType" @click="step = 1">
            Continue
          </button>
        </footer>
      </section>

      <section v-else-if="step === 1" class="content-flow">
        <div class="room-toggle-list">
          <article v-for="room in rooms" :key="room.id" class="room-toggle">
            <div>
              <h3>{{ room.name }}</h3>
              <p>{{ room.prompt }}</p>
            </div>
            <div class="segmented-control" :aria-label="`${room.name} room presence`">
              <button
                type="button"
                :class="{ selected: roomPresence[room.id] === true }"
                @click="setRoomPresence(room.id, true)"
              >
                Yes
              </button>
              <button
                type="button"
                :class="{ selected: roomPresence[room.id] === false }"
                @click="setRoomPresence(room.id, false)"
              >
                No
              </button>
            </div>
          </article>
        </div>
        <footer class="action-row split">
          <span>{{ skippedRoomCount }} skipped</span>
          <button class="primary-button" type="button" :disabled="!includedRooms.length" @click="step = 2">
            Start furniture
          </button>
        </footer>
      </section>

      <section v-else-if="step === 2" class="inventory-layout">
        <nav class="room-tabs" aria-label="Included rooms">
          <button
            v-for="room in includedRooms"
            :key="room.id"
            type="button"
            :class="{ active: activeRoom?.id === room.id }"
            @click="activeRoomId = room.id"
          >
            {{ room.name }}
          </button>
        </nav>

        <div v-if="activeRoom" class="room-workspace">
          <div class="room-title-row">
            <div>
              <span>{{ roomProgressLabel }}</span>
              <h3>{{ activeRoom.name }}</h3>
            </div>
            <button class="ghost-button" type="button" @click="nextRoom">Next room</button>
          </div>

          <div class="furniture-grid">
            <article v-for="item in activeRoom.items" :key="item.id" class="furniture-picker">
              <img :src="imageFor(item.asset)" :alt="item.name" />
              <div>
                <h4>{{ item.name }}</h4>
                <p>{{ item.volume.toFixed(2) }} m3 each</p>
              </div>
              <div class="quantity-controls">
                <button type="button" aria-label="Decrease quantity" @click="changeQuantity(item.id, -1)">-</button>
                <strong>{{ quantities[item.id] || 0 }}</strong>
                <button type="button" aria-label="Increase quantity" @click="changeQuantity(item.id, 1)">+</button>
              </div>
            </article>
          </div>
        </div>

        <aside class="bucket-panel">
          <h3>Accumulating bucket</h3>
          <div v-if="inventory.length" class="bucket-list">
            <div v-for="item in inventory" :key="item.id" class="bucket-item">
              <img :src="imageFor(item.asset)" :alt="item.name" />
              <span>{{ item.name }}</span>
              <strong>x{{ item.quantity }}</strong>
            </div>
          </div>
          <p v-else class="empty-state">Add items with the plus buttons.</p>
          <button class="primary-button full-width" type="button" :disabled="!inventory.length" @click="step = 3">
            See truck fit
          </button>
        </aside>
      </section>

      <section v-else class="truck-layout">
        <div class="truck-fit-stage" :class="{ empty: !inventory.length }">
          <TruckFitScene v-if="packedTrucks.length" class="truck-fit-canvas" :trucks="packedTrucks" />

          <p v-else class="empty-state">Add items with the plus buttons.</p>

          <aside class="recommendation-panel" aria-label="Truck recommendation">
            <div class="recommendation-header">
              <p>We recommend</p>
              <button class="ghost-button compact" type="button" @click="step = 2">Edit</button>
            </div>

            <div class="recommended-truck-card">
              <strong>{{ recommendationCardText }}</strong>
              <span>
                Space: {{ packedTruckCapacity.toFixed(0) }} m3
                <b>Used: {{ totalVolume.toFixed(1) }} m3</b>
              </span>
              <span>{{ totalItems }} items packed across {{ packedTrucks.length || recommendedPlan.length }} truck load{{ (packedTrucks.length || recommendedPlan.length) === 1 ? '' : 's' }}</span>
            </div>

            <button class="primary-button full-width quote-button" type="button" :disabled="!inventory.length">
              Get quote
            </button>
          </aside>
        </div>
      </section>
    </section>
  </main>
</template>
