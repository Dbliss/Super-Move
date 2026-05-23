<script setup>
import { computed, reactive, ref } from 'vue';
import TruckFitScene from './components/TruckFitScene.vue';
import HouseScene from './components/HouseScene.vue';
import objectClassifications from './data/objectClassifications.json';
import objectStackingAttributes from './data/objectStackingAttributes.json';

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
  },
  {
    id: 'apartment',
    name: 'Apartment',
    detail: 'Most common rooms, usually one truck load.',
    rooms: ['bedroom', 'living', 'dining', 'kitchen', 'laundry', 'bathroom'],
  },
  {
    id: 'townhouse',
    name: 'Townhouse',
    detail: 'Multi-room home with office or garage items.',
    rooms: ['bedroom', 'living', 'dining', 'kitchen', 'office', 'laundry', 'bathroom', 'garage'],
  },
  {
    id: 'house',
    name: 'House',
    detail: 'Full home inventory across all common spaces.',
    rooms: ['bedroom', 'living', 'dining', 'kitchen', 'office', 'laundry', 'bathroom', 'garage'],
  },
];

const rooms = [
  {
    id: 'bedroom',
    name: 'Bedroom',
    prompt: 'Beds, side tables, storage, and boxed personal items.',
    items: [
      { id: 'bedDouble', name: 'Double bed', asset: 'bedDouble', volume: 3.2 },
      { id: 'bedSingle', name: 'Single bed', asset: 'bedSingle', volume: 2.1 },
      { id: 'bedBunk', name: 'Bunk bed', asset: 'bedBunk', volume: 3.8 },
      { id: 'cabinetBedDrawer', name: 'Tall drawers', asset: 'cabinetBedDrawer', volume: 1.7 },
      { id: 'sideTableDrawers', name: 'Bedside drawers', asset: 'sideTableDrawers', volume: 0.5 },
      { id: 'cardboardBoxClosedBedroom', name: 'Packed box', asset: 'cardboardBoxClosed', volume: 0.35 },
    ],
  },
  {
    id: 'living',
    name: 'Living Room',
    prompt: 'Sofas, TV units, bookcases, tables, and decor.',
    items: [
      { id: 'loungeSofaLong', name: 'Long sofa', asset: 'loungeSofaLong', volume: 3.0 },
      { id: 'loungeSofaCorner', name: 'Corner sofa', asset: 'loungeSofaCorner', volume: 4.2 },
      { id: 'loungeChair', name: 'Armchair', asset: 'loungeChair', volume: 1.1 },
      { id: 'televisionModern', name: 'Television', asset: 'televisionModern', volume: 0.45 },
      { id: 'cabinetTelevision', name: 'TV cabinet', asset: 'cabinetTelevision', volume: 1.1 },
      { id: 'tableCoffee', name: 'Coffee table', asset: 'tableCoffee', volume: 0.7 },
      { id: 'bookcaseOpen', name: 'Bookcase', asset: 'bookcaseOpen', volume: 1.6 },
      { id: 'pottedPlantLiving', name: 'Large plant', asset: 'pottedPlant', volume: 0.45 },
    ],
  },
  {
    id: 'dining',
    name: 'Dining',
    prompt: 'Dining tables, chairs, stools, and display cabinets.',
    items: [
      { id: 'table', name: 'Dining table', asset: 'table', volume: 1.8 },
      { id: 'tableRound', name: 'Round table', asset: 'tableRound', volume: 1.4 },
      { id: 'chair', name: 'Dining chair', asset: 'chair', volume: 0.35 },
      { id: 'stoolBar', name: 'Bar stool', asset: 'stoolBar', volume: 0.3 },
      { id: 'bookcaseClosedWideDining', name: 'Display cabinet', asset: 'bookcaseClosedWide', volume: 2.1 },
    ],
  },
  {
    id: 'kitchen',
    name: 'Kitchen',
    prompt: 'Fridges, appliances, cabinets, and packed kitchen boxes.',
    items: [
      { id: 'kitchenFridgeLarge', name: 'Large fridge', asset: 'kitchenFridgeLarge', volume: 2.0 },
      { id: 'kitchenFridge', name: 'Fridge', asset: 'kitchenFridge', volume: 1.5 },
      { id: 'kitchenMicrowave', name: 'Microwave', asset: 'kitchenMicrowave', volume: 0.25 },
      { id: 'kitchenStove', name: 'Stove', asset: 'kitchenStove', volume: 1.0 },
      { id: 'kitchenCoffeeMachine', name: 'Coffee machine', asset: 'kitchenCoffeeMachine', volume: 0.18 },
      { id: 'cardboardBoxClosedKitchen', name: 'Kitchen box', asset: 'cardboardBoxClosed', volume: 0.35 },
    ],
  },
  {
    id: 'office',
    name: 'Office',
    prompt: 'Desks, task chairs, screens, and office boxes.',
    items: [
      { id: 'desk', name: 'Desk', asset: 'desk', volume: 1.2 },
      { id: 'deskCorner', name: 'Corner desk', asset: 'deskCorner', volume: 1.8 },
      { id: 'chairDesk', name: 'Desk chair', asset: 'chairDesk', volume: 0.65 },
      { id: 'computerScreen', name: 'Monitor', asset: 'computerScreen', volume: 0.16 },
      { id: 'bookcaseOpenOffice', name: 'Office bookcase', asset: 'bookcaseOpenLow', volume: 1.1 },
      { id: 'cardboardBoxClosedOffice', name: 'Office box', asset: 'cardboardBoxClosed', volume: 0.35 },
    ],
  },
  {
    id: 'laundry',
    name: 'Laundry',
    prompt: 'Laundry appliances and utility storage.',
    items: [
      { id: 'washer', name: 'Washing machine', asset: 'washer', volume: 0.9 },
      { id: 'dryer', name: 'Dryer', asset: 'dryer', volume: 0.85 },
      { id: 'washerDryerStacked', name: 'Washer dryer stack', asset: 'washerDryerStacked', volume: 1.5 },
      { id: 'trashcanLaundry', name: 'Utility bin', asset: 'trashcan', volume: 0.25 },
    ],
  },
  {
    id: 'bathroom',
    name: 'Bathroom',
    prompt: 'Cabinets, mirrors, and bathroom storage.',
    items: [
      { id: 'bathroomCabinet', name: 'Bathroom cabinet', asset: 'bathroomCabinet', volume: 0.85 },
      { id: 'bathroomCabinetDrawer', name: 'Drawer cabinet', asset: 'bathroomCabinetDrawer', volume: 0.7 },
      { id: 'bathroomMirror', name: 'Mirror', asset: 'bathroomMirror', volume: 0.18 },
      { id: 'cardboardBoxClosedBathroom', name: 'Bathroom box', asset: 'cardboardBoxClosed', volume: 0.35 },
    ],
  },
  {
    id: 'garage',
    name: 'Garage / Outdoor',
    prompt: 'Benches, storage, spare furniture, and miscellaneous boxes.',
    items: [
      { id: 'bench', name: 'Bench', asset: 'bench', volume: 1.4 },
      { id: 'coatRackStanding', name: 'Standing rack', asset: 'coatRackStanding', volume: 0.5 },
      { id: 'bookcaseClosedGarage', name: 'Storage cabinet', asset: 'bookcaseClosed', volume: 1.7 },
      { id: 'speaker', name: 'Large speaker', asset: 'speaker', volume: 0.6 },
      { id: 'cardboardBoxOpenGarage', name: 'Open box', asset: 'cardboardBoxOpen', volume: 0.35 },
      { id: 'cardboardBoxClosedGarage', name: 'Packed box', asset: 'cardboardBoxClosed', volume: 0.35 },
    ],
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
const modelScales = {
  small: 0.84,
  medium: 1,
  large: 1.12,
};

const toCells = (centimeters) => Math.max(1, Math.ceil(centimeters / packingCellCm));

const profileForItem = (item) => {
  const sizeClass = objectClassifications.items[item.id] || objectClassifications.defaultSizeClass;
  const dimensions = objectClassifications.boxSizes[sizeClass] || objectClassifications.boxSizes.medium;
  const attributes = {
    ...objectStackingAttributes.defaults,
    ...(objectStackingAttributes.items[item.id] || {}),
  };

  return {
    sizeClass,
    dimensionsCm: dimensions,
    width: toCells(dimensions.widthCm),
    depth: toCells(dimensions.depthCm),
    height: toCells(dimensions.heightCm),
    widthMeters: dimensions.widthCm / 100,
    depthMeters: dimensions.depthCm / 100,
    heightMeters: dimensions.heightCm / 100,
    modelScale: modelScales[sizeClass] || 1,
    ...attributes,
  };
};

const makePackingGrid = (truck) => {
  const columns = Math.max(1, Math.floor((truck.cargoLength * 100) / packingCellCm));
  const rows = Math.max(1, Math.floor((truck.cargoWidth * 100) / packingCellCm));

  return {
    columns,
    rows,
    maxHeight: Math.max(1, Math.floor((truck.cargoHeight * 100) / packingCellCm)),
    heights: Array.from({ length: rows }, () => Array.from({ length: columns }, () => 0)),
    topItems: Array.from({ length: rows }, () => Array.from({ length: columns }, () => null)),
  };
};

const uniqueOrientations = (unit) =>
  [
    { width: unit.width, depth: unit.depth, rotated: false },
    { width: unit.depth, depth: unit.width, rotated: true },
  ].filter((orientation, index, list) =>
    index === list.findIndex((candidate) => candidate.width === orientation.width && candidate.depth === orientation.depth),
  );

const isBetterScore = (score, bestScore) => {
  for (let index = 0; index < score.length; index += 1) {
    if (score[index] < bestScore[index]) return true;
    if (score[index] > bestScore[index]) return false;
  }
  return false;
};

const supportAt = (grid, unit, orientation, x, y) => {
  if (x + orientation.width > grid.columns || y + orientation.depth > grid.rows) return null;

  let baseHeight = 0;
  const supports = new Map();

  for (let row = y; row < y + orientation.depth; row += 1) {
    for (let column = x; column < x + orientation.width; column += 1) {
      baseHeight = Math.max(baseHeight, grid.heights[row][column]);
    }
  }

  if (baseHeight + unit.height > grid.maxHeight) return null;

  for (let row = y; row < y + orientation.depth; row += 1) {
    for (let column = x; column < x + orientation.width; column += 1) {
      if (grid.heights[row][column] !== baseHeight) return null;
      const support = grid.topItems[row][column];
      if (baseHeight > 0) {
        if (!support?.canStackOnTop) return null;
        supports.set(support.key, support);
      }
    }
  }

  return { baseHeight, supportCount: supports.size };
};

const findPlacement = (grid, unit) => {
  let best = null;

  for (const orientation of uniqueOrientations(unit)) {
    for (let y = 0; y <= grid.rows - orientation.depth; y += 1) {
      for (let x = 0; x <= grid.columns - orientation.width; x += 1) {
        const support = supportAt(grid, unit, orientation, x, y);
        if (!support) continue;

        const placement = {
          x,
          y,
          z: support.baseHeight,
          supportCount: support.supportCount,
          ...orientation,
        };

        const score = [
          placement.z,
          y + orientation.depth,
          x + orientation.width,
          orientation.width * orientation.depth,
          support.supportCount,
        ];

        if (!best || isBetterScore(score, best.score)) {
          best = { ...placement, score };
        }
      }
    }
  }

  if (!best) return null;
  const { score, ...placement } = best;
  return placement;
};

const placeUnit = (grid, unit, placement) => {
  const topHeight = placement.z + unit.height;
  for (let row = placement.y; row < placement.y + placement.depth; row += 1) {
    for (let column = placement.x; column < placement.x + placement.width; column += 1) {
      grid.heights[row][column] = topHeight;
      grid.topItems[row][column] = {
        key: unit.key,
        canStackOnTop: unit.canStackOnTop,
      };
    }
  }
};

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
    .map((item) => ({ ...item, quantity: quantities[item.id] || 0 }))
    .filter((item) => item.quantity > 0);
});

const totalItems = computed(() => inventory.value.reduce((sum, item) => sum + item.quantity, 0));

const totalVolume = computed(() =>
  inventory.value.reduce((sum, item) => sum + item.volume * item.quantity, 0),
);

const roomProgressLabel = computed(() => {
  if (!includedRooms.value.length) return 'No rooms selected yet';
  const currentIndex = includedRooms.value.findIndex((room) => room.id === activeRoom.value?.id);
  return `Room ${currentIndex + 1} of ${includedRooms.value.length}`;
});

const recommendedPlan = computed(() => {
  const volume = totalVolume.value;
  if (volume <= 0) return [];

  const singleTruck = truckSizes.find((truck) => volume <= truck.capacity);
  if (singleTruck) return [{ ...singleTruck, count: 1 }];

  const plan = [];
  const large = truckSizes[2];
  const fullLargeCount = Math.floor(volume / large.capacity);
  const remainder = Number((volume - fullLargeCount * large.capacity).toFixed(2));

  if (fullLargeCount > 0) plan.push({ ...large, count: fullLargeCount });
  if (remainder > 0) {
    const remainderTruck = truckSizes.find((truck) => remainder <= truck.capacity) || large;
    plan.push({ ...remainderTruck, count: 1 });
  }

  return plan;
});

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

const packedUnits = computed(() => {
  const expanded = inventory.value.flatMap((item) =>
    Array.from({ length: item.quantity }, (_, index) => ({
      key: `${item.id}-${index}`,
      id: item.id,
      asset: item.asset,
      name: item.name,
      room: item.room,
      volume: item.volume,
      ...profileForItem(item),
    })),
  );

  return expanded.sort((a, b) => {
    const weightDifference = b.stackingWeight - a.stackingWeight;
    if (weightDifference !== 0) return weightDifference;
    const areaDifference = b.width * b.depth - a.width * a.depth;
    if (areaDifference !== 0) return areaDifference;
    return b.height - a.height;
  });
});

const plannedTrucks = computed(() =>
  recommendedPlan.value.flatMap((truck) =>
    Array.from({ length: truck.count }, (_, index) => ({
      ...truck,
      key: `${truck.id}-${index}`,
      label: truck.count > 1 ? `${truck.name} Truck ${index + 1}` : `${truck.name} Truck`,
      usedVolume: 0,
      items: [],
      packingGrid: makePackingGrid(truck),
    })),
  ),
);

const packedTrucks = computed(() => {
  if (!packedUnits.value.length) return [];

  const trucks = plannedTrucks.value.map((truck) => ({
    ...truck,
    items: [],
    packingGrid: makePackingGrid(truck),
  }));
  const largeTruck = truckSizes.find((truck) => truck.id === 'large');

  packedUnits.value.forEach((unit, sequence) => {
    let targetTruck = null;
    let targetPlacement = null;

    for (const truck of trucks) {
      const placement = findPlacement(truck.packingGrid, unit);
      if (placement && truck.usedVolume + unit.volume <= truck.capacity + 0.01) {
        targetTruck = truck;
        targetPlacement = placement;
        break;
      }
    }

    if (!targetTruck) {
      targetTruck = {
        ...largeTruck,
        key: `overflow-large-${trucks.length}`,
        label: `Large Truck ${trucks.length + 1}`,
        usedVolume: 0,
        items: [],
        packingGrid: makePackingGrid(largeTruck),
      };
      trucks.push(targetTruck);
      targetPlacement = findPlacement(targetTruck.packingGrid, unit);
    }

    if (!targetPlacement) return;

    placeUnit(targetTruck.packingGrid, unit, targetPlacement);
    targetTruck.usedVolume += unit.volume;
    targetTruck.items.push({
      ...unit,
      x: targetPlacement.x,
      y: targetPlacement.y,
      z: targetPlacement.z,
      width: targetPlacement.width,
      depth: targetPlacement.depth,
      height: unit.height,
      rotated: targetPlacement.rotated,
      sequence,
      batch: Math.floor(sequence / 4),
      zIndex: 20 + targetPlacement.z * targetTruck.packingGrid.columns * targetTruck.packingGrid.rows + targetPlacement.y * targetTruck.packingGrid.columns + targetPlacement.x,
    });
  });

  return trucks.filter((truck) => truck.items.length);
});

const recommendationCardText = computed(() => {
  if (!recommendedPlan.value.length) return 'Add furniture to calculate a truck';
  return recommendedPlan.value
    .map((truck) => `${truck.count > 1 ? `${truck.count} x ` : ''}${truck.name} Truck`)
    .join(' + ');
});

const chooseHouse = (id) => {
  selectedHouseType.value = id;
  const selectedRooms = new Set(houseTypes.find((house) => house.id === id)?.rooms || []);
  rooms.forEach((room) => {
    roomPresence[room.id] = selectedRooms.has(room.id);
  });
  activeRoomId.value = rooms.find((room) => selectedRooms.has(room.id))?.id || rooms[0].id;
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
    <aside class="quote-summary" aria-label="Quote summary">
      <div class="brand-lockup">
        <span class="brand-mark">SM</span>
        <div>
          <p>Super Move</p>
          <h1>Quote Builder</h1>
        </div>
      </div>

      <div class="stepper" aria-label="Quote steps">
        <button
          v-for="(label, index) in ['Home', 'Rooms', 'Items', 'Truck']"
          :key="label"
          class="step-dot"
          :class="{ active: step === index, complete: step > index }"
          type="button"
          @click="step = index"
        >
          <span>{{ index + 1 }}</span>
          {{ label }}
        </button>
      </div>

      <dl class="stats-list">
        <div>
          <dt>Home</dt>
          <dd>{{ selectedHouse?.name || 'Not selected' }}</dd>
        </div>
        <div>
          <dt>Rooms</dt>
          <dd>{{ includedRooms.length }} included</dd>
        </div>
        <div>
          <dt>Furniture</dt>
          <dd>{{ totalItems }} items</dd>
        </div>
        <div>
          <dt>Volume</dt>
          <dd>{{ totalVolume.toFixed(1) }} m3</dd>
        </div>
      </dl>

      <div class="truck-callout">
        <span>Recommended</span>
        <strong>{{ recommendedTruckText }}</strong>
      </div>
    </aside>

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
                Space: {{ totalTruckCapacity.toFixed(0) }} m3
                <b>Used: {{ totalVolume.toFixed(1) }} m3</b>
              </span>
              <span>{{ totalItems }} items packed across {{ packedTrucks.length || recommendedPlan.length }} truck load{{ (packedTrucks.length || recommendedPlan.length) === 1 ? '' : 's' }}</span>
            </div>

            <button class="primary-button full-width quote-button" type="button" :disabled="!inventory.length">
              Get quote
            </button>
          </aside>
        </div>

        <div class="inventory-table">
          <div v-for="item in inventory" :key="item.id" class="inventory-row">
            <span>{{ item.room }}</span>
            <strong>{{ item.quantity }} x {{ item.name }}</strong>
            <em>{{ (item.volume * item.quantity).toFixed(1) }} m3</em>
          </div>
        </div>
      </section>
    </section>
  </main>
</template>
