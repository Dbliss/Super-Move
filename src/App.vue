<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue';
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
  if (item.custom) {
    const dimensions = {
      widthCm: item.widthCm,
      depthCm: item.depthCm,
      heightCm: item.heightCm,
    };
    const shape = buildShape('box', toCells(dimensions.widthCm), toCells(dimensions.depthCm), toCells(dimensions.heightCm));
    return {
      templateName: 'custom-box',
      dimensionsCm: dimensions,
      width: shape.width,
      depth: shape.depth,
      height: shape.height,
      widthMeters: dimensions.widthCm / 100,
      depthMeters: dimensions.depthCm / 100,
      heightMeters: dimensions.heightCm / 100,
      modelScale: 1,
      stackLevel: 0,
      openTop: false,
      shape,
      volume: (dimensions.widthCm * dimensions.depthCm * dimensions.heightCm) / 1_000_000,
    };
  }

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
const selectedHouseType = ref('apartment');
const previewedHouseType = ref(null);
const activeRoomId = ref('bedroom');
const quantities = reactive({});
const customItems = ref([]);
const customDraft = reactive({
  name: '',
  widthCm: '',
  depthCm: '',
  heightCm: '',
});

const householdDefaultsByHouse = {
  studio: { bedrooms: 1, bathrooms: 0, living: 0, dining: 0, office: 0, garage: 0 },
  apartment: { bedrooms: 2, bathrooms: 1, living: 1, dining: 1, office: 0, garage: 0 },
  townhouse: { bedrooms: 3, bathrooms: 2, living: 1, dining: 1, office: 1, garage: 1 },
  house: { bedrooms: 4, bathrooms: 2, living: 2, dining: 1, office: 1, garage: 1 },
};

const householdDetails = reactive({ ...householdDefaultsByHouse.apartment });

const householdSelectors = [
  { key: 'bedrooms', title: 'Number of bedrooms', options: [1, 2, 3, 4, 5], suffix: 'Bedroom' },
  { key: 'bathrooms', title: 'Number of bathrooms', options: [1, 2, 3, 4], suffix: 'Bathroom' },
  { key: 'living', title: 'Living rooms', options: [1, 2, 3], suffix: 'Living room' },
  { key: 'dining', title: 'Dining rooms', options: [0, 1, 2], suffix: 'Dining room' },
  { key: 'office', title: 'Office / study', options: [0, 1, 2], suffix: 'Office' },
  { key: 'garage', title: 'Garage / outdoor', options: [0, 1], labels: { 0: 'None', 1: 'Yes' } },
];

const suggestedFallbackDefaults = houseTypes.reduce((acc, house) => {
  Object.entries(house.defaults).forEach(([itemId, quantity]) => {
    if (!acc[itemId] && quantity > 0) acc[itemId] = quantity;
  });
  return acc;
}, {});

const selectedHouse = computed(() => houseTypes.find((house) => house.id === selectedHouseType.value));

const isStudioSelected = computed(() => selectedHouseType.value === 'studio');

const selectedHouseRoomIds = computed(() => new Set(selectedHouse.value?.rooms || []));

const includedRooms = computed(() =>
  isStudioSelected.value
    ? [
        {
          id: 'studio',
          name: 'Studio',
          prompt: 'One-room studio inventory.',
          items: rooms
            .filter((room) => selectedHouseRoomIds.value.has(room.id))
            .flatMap((room) => room.items.map((item) => ({ ...item, roomId: 'studio' }))),
        },
      ]
    : rooms.filter((room) => {
        if (room.id === 'bedroom') return householdDetails.bedrooms > 0;
        if (room.id === 'bathroom') return householdDetails.bathrooms > 0;
        if (room.id === 'living') return householdDetails.living > 0;
        if (room.id === 'dining') return householdDetails.dining > 0;
        if (room.id === 'office') return householdDetails.office > 0;
        if (room.id === 'garage') return householdDetails.garage > 0;
        if (room.id === 'kitchen' || room.id === 'laundry') return selectedHouseRoomIds.value.has(room.id);
        return false;
      }),
);

const activeRoom = computed(() => includedRooms.value.find((room) => room.id === activeRoomId.value) || includedRooms.value[0]);

const inventory = computed(() => {
  const allItems = rooms.flatMap((room) => room.items.map((item) => ({ ...item, room: room.name })));
  const catalogItems = allItems
    .map((item) => {
      const dims = dimsForAsset(item.asset);
      const realVolume = (dims.widthCm * dims.depthCm * dims.heightCm) / 1_000_000;
      return { ...item, volume: realVolume, quantity: quantities[item.id] || 0 };
    })
    .filter((item) => item.quantity > 0);
  const userItems = customItems.value
    .map((item) => ({
      ...item,
      volume: (item.widthCm * item.depthCm * item.heightCm) / 1_000_000,
      quantity: quantities[item.id] || 0,
    }))
    .filter((item) => item.quantity > 0);
  return [...catalogItems, ...userItems];
});

// Kick off bounding-box measurement for every asset that lands in the inventory.
// Each result populates measuredAssetDims (reactive), which re-runs the packer.
watch(
  inventory,
  (items) => {
    const assets = new Set(items.filter((i) => !i.custom).map((i) => i.asset));
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
      custom: item.custom,
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

const formatSelectorOption = (selector, value) => {
  if (selector.labels?.[value]) return selector.labels[value];
  if (!selector.suffix) return String(value);
  return `${value} ${selector.suffix}${value === 1 ? '' : 's'}`;
};

const selectorTitle = (selector) => {
  const labels = {
    bedrooms: 'Bedrooms',
    bathrooms: 'Bathrooms',
    living: 'Living rooms',
    dining: 'Dining rooms',
    office: 'Office / study',
    garage: 'Garage / outdoor',
  };
  return labels[selector.key] || selector.title;
};

const baseRoomCountFor = (roomId, details) => {
  if (roomId === 'studio') return 1;
  if (roomId === 'bedroom') return details.bedrooms;
  if (roomId === 'bathroom') return details.bathrooms;
  if (roomId === 'living') return details.living;
  if (roomId === 'dining') return details.dining;
  if (roomId === 'office') return details.office;
  if (roomId === 'garage') return details.garage;
  return 1;
};

const roomScaleFor = (roomId, baseDetails, details) => {
  if (roomId === 'studio') return 1;
  const scale = (next, base) => (base > 0 ? next / base : next);
  if (roomId === 'bedroom') return scale(details.bedrooms, baseDetails.bedrooms);
  if (roomId === 'bathroom') return scale(details.bathrooms, baseDetails.bathrooms);
  if (roomId === 'living') return scale(details.living, baseDetails.living);
  if (roomId === 'dining') return scale(details.dining, baseDetails.dining);
  if (roomId === 'office') return scale(details.office, baseDetails.office);
  if (roomId === 'garage') return scale(details.garage, baseDetails.garage);
  return 1;
};

const clearAllQuantities = () => {
  rooms.forEach((room) => {
    room.items.forEach((item) => {
      quantities[item.id] = 0;
    });
  });
  customItems.value.forEach((item) => {
    quantities[item.id] = 0;
  });
};

const seedFurnitureDefaults = () => {
  const house = selectedHouse.value;
  const defaults = house?.defaults || {};
  const baseDetails = householdDefaultsByHouse[house?.id] || householdDefaultsByHouse.studio;
  const includedRoomIds = new Set(includedRooms.value.map((room) => room.id));

  clearAllQuantities();
  rooms.forEach((room) => {
    const isIncluded = isStudioSelected.value ? selectedHouseRoomIds.value.has(room.id) : includedRoomIds.has(room.id);
    room.items.forEach((item) => {
      if (!isIncluded) return;
      const fallbackQuantity = baseRoomCountFor(room.id, baseDetails) === 0 ? suggestedFallbackDefaults[item.id] || 0 : 0;
      const baseQuantity = defaults[item.id] || fallbackQuantity;
      const scaledQuantity = Math.round(baseQuantity * roomScaleFor(room.id, baseDetails, householdDetails));
      quantities[item.id] = Math.max(0, scaledQuantity);
    });
  });
};

seedFurnitureDefaults();

const chooseHouseholdDefaults = (houseId) => {
  Object.assign(householdDetails, householdDefaultsByHouse[houseId] || householdDefaultsByHouse.studio);
};

const chooseHouse = (id) => {
  selectedHouseType.value = id;
  chooseHouseholdDefaults(id);
  activeRoomId.value = includedRooms.value[0]?.id || 'bedroom';
  seedFurnitureDefaults();
};

const continueFromHouse = () => {
  if (isStudioSelected.value) {
    seedFurnitureDefaults();
    activeRoomId.value = 'studio';
    step.value = 2;
  } else {
    step.value = 1;
  }
};

const continueToFurniture = () => {
  seedFurnitureDefaults();
  activeRoomId.value = includedRooms.value[0]?.id || 'bedroom';
  step.value = 2;
};

const changeQuantity = (itemId, amount) => {
  quantities[itemId] = Math.max(0, (quantities[itemId] || 0) + amount);
};

const customItemsForRoom = (roomId) => customItems.value.filter((item) => item.roomId === roomId);

const customPreviewStyle = (item) => ({
  aspectRatio: `${Math.max(item.widthCm, 1)} / ${Math.max(item.depthCm, 1)}`,
});

const resetCustomDraft = () => {
  customDraft.name = '';
  customDraft.widthCm = '';
  customDraft.depthCm = '';
  customDraft.heightCm = '';
};

const visibleStep = computed(() => {
  if (step.value <= 1) return 1;
  if (step.value === 2) return 2;
  return 3;
});

const steps = computed(() => [
  { number: 1, label: 'Home details', state: visibleStep.value > 1 ? 'complete' : visibleStep.value === 1 ? 'active' : '' },
  { number: 2, label: 'Furniture', state: visibleStep.value > 2 ? 'complete' : visibleStep.value === 2 ? 'active' : '' },
  { number: 3, label: 'Review', state: visibleStep.value === 3 ? 'active' : '' },
  { number: 4, label: 'Quote', state: '' },
]);

watch(step, async () => {
  await nextTick();
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
});

const homeSummaryRows = computed(() => [
  { key: 'bedrooms', label: 'Bedrooms', value: householdDetails.bedrooms, icon: 'bed' },
  { key: 'bathrooms', label: 'Bathrooms', value: householdDetails.bathrooms, icon: 'bath' },
  { key: 'living', label: 'Living rooms', value: householdDetails.living, icon: 'sofa' },
  { key: 'dining', label: 'Dining rooms', value: householdDetails.dining, icon: 'dining' },
  { key: 'office', label: 'Office / study', value: householdDetails.office, icon: 'desk' },
  { key: 'garage', label: 'Garage / outdoor', value: householdDetails.garage ? 'Yes' : 'No', icon: 'garage' },
]);

const homeDetailLine = computed(() => {
  const rooms = [];
  if (householdDetails.bedrooms) rooms.push(`${householdDetails.bedrooms} Bedroom home`);
  if (householdDetails.bathrooms) rooms.push(`${householdDetails.bathrooms} Bathroom`);
  if (householdDetails.living) rooms.push(`${householdDetails.living} Living room`);
  if (householdDetails.dining) rooms.push(`${householdDetails.dining} Dining room`);
  if (householdDetails.office) rooms.push(`${householdDetails.office} Office`);
  return rooms.join(', ');
});

const primaryTruck = computed(() => packedTrucks.value[0] || recommendedPlan.value[0] || truckSizesWithCells.value[1]);

const truckLoadCount = computed(() => packedTrucks.value.length || recommendedPlan.value.reduce((sum, truck) => sum + truck.count, 0) || 1);

const estimatedMoveTime = computed(() => {
  if (totalVolume.value >= 40) return '3.5 - 5 hrs';
  if (totalVolume.value >= 24) return '2.5 - 3 hrs';
  if (totalVolume.value >= 12) return '1.5 - 2 hrs';
  return '1 - 1.5 hrs';
});

const recommendedMoverCount = computed(() => (totalVolume.value >= 45 ? 3 : 2));

const truckOptionCards = computed(() =>
  truckSizesWithCells.value
    .filter((truck) => truck.id !== primaryTruck.value?.id)
    .map((truck) => ({
      ...truck,
      used: truck.capacity ? Math.min(100, Math.round((totalVolume.value / truck.capacity) * 100)) : 0,
      price: truck.id === 'small' ? 420 : truck.id === 'medium' ? 540 : 680,
    })),
);

const addCustomItem = () => {
  const name = customDraft.name.trim();
  const widthCm = Math.max(1, Math.round(Number(customDraft.widthCm)));
  const depthCm = Math.max(1, Math.round(Number(customDraft.depthCm)));
  const heightCm = Math.max(1, Math.round(Number(customDraft.heightCm)));
  if (!activeRoom.value || !name || !Number.isFinite(widthCm) || !Number.isFinite(depthCm) || !Number.isFinite(heightCm)) return;

  const id = `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  customItems.value.push({
    id,
    name,
    room: activeRoom.value.name,
    roomId: activeRoom.value.id,
    asset: id,
    custom: true,
    widthCm,
    depthCm,
    heightCm,
  });
  quantities[id] = 1;
  resetCustomDraft();
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
  chooseHouseholdDefaults('studio');
  clearAllQuantities();
  customItems.value = [];
  resetCustomDraft();
};
</script>

<template>
  <main class="app-shell">
    <header class="top-bar">
      <button class="brand-lockup" type="button" @click="step = selectedHouseType ? 1 : 0">
        <span class="brand-icon" aria-hidden="true">
          <svg viewBox="0 0 48 40" role="img">
            <path d="M3 18 17 5l14 13v16H7V18" />
            <path d="M31 17h8l6 7v10h-7" />
            <path d="M13 34a4 4 0 1 0 8 0 4 4 0 0 0-8 0Zm21 0a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z" />
          </svg>
        </span>
        <span>
          <strong>REMOVALIST</strong>
          <b>ESTIMATE</b>
        </span>
      </button>

      <nav class="progress-nav" aria-label="Quote steps">
        <div v-for="item in steps" :key="item.number" class="progress-step" :class="item.state">
          <span class="progress-index">{{ item.state === 'complete' ? '✓' : item.number }}</span>
          <span>{{ item.label }}</span>
        </div>
      </nav>

      <div class="top-actions">
        <button class="help-button" type="button">? <span>Need help?</span></button>
        <button class="ghost-button reset-top" type="button" @click="resetQuote">Reset all</button>
      </div>
    </header>

    <section v-if="step <= 1" class="page-grid home-page">
      <div class="page-main">
        <div class="page-title">
          <h1>Tell us about your home</h1>
          <p>Add a few details about your space so we can give you the most accurate quote.</p>
        </div>

        <section v-if="step === 0" class="home-type-card">
          <div class="section-heading">
            <div>
              <h2>Choose your home type</h2>
              <p>This sets a sensible starting inventory.</p>
            </div>
          </div>
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
        </section>

        <div class="property-selector-list">
          <article v-for="selector in householdSelectors" :key="selector.key" class="property-selector-card">
            <div class="selector-copy">
              <span class="soft-icon" :class="`icon-${selector.key}`" aria-hidden="true"></span>
              <div>
                <h3>{{ selectorTitle(selector) }}</h3>
                <p>
                  <template v-if="selector.key === 'bedrooms'">How many bedrooms are you moving?</template>
                  <template v-else-if="selector.key === 'bathrooms'">How many bathrooms are in your home?</template>
                  <template v-else-if="selector.key === 'living'">How many living areas do you have?</template>
                  <template v-else-if="selector.key === 'dining'">How many dining areas do you have?</template>
                  <template v-else-if="selector.key === 'office'">Do you have a home office or study?</template>
                  <template v-else>Will you be moving items from a garage or outdoors?</template>
                </p>
              </div>
            </div>
            <div class="radio-option-row" :aria-label="selector.title">
              <button
                v-for="option in selector.options"
                :key="option"
                type="button"
                class="radio-option"
                :class="{ selected: householdDetails[selector.key] === option }"
                @click="householdDetails[selector.key] = option"
              >
                <span class="option-icon" aria-hidden="true"></span>
                <span class="option-text">{{ formatSelectorOption(selector, option) }}</span>
                <span class="option-check" aria-hidden="true">✓</span>
              </button>
            </div>
          </article>
        </div>

        <p class="inline-note">Not sure? You can adjust these details later.</p>
      </div>

      <aside class="summary-card home-summary">
        <h2>Your home summary</h2>
        <div class="summary-list">
          <div v-for="row in homeSummaryRows" :key="row.key" class="summary-row">
            <span class="soft-icon small" :class="`icon-${row.icon}`" aria-hidden="true"></span>
            <span>{{ row.label }}</span>
            <strong>{{ row.value }}</strong>
          </div>
        </div>

        <div class="volume-callout">
          <span>Estimated volume</span>
          <strong>~{{ totalVolume.toFixed(0) || 0 }} m³</strong>
          <em>{{ totalVolume >= 40 ? 'Large' : totalVolume >= 20 ? 'Medium' : 'Small' }}</em>
          <p>This helps us match you with the right truck and team size.</p>
        </div>

        <button
          class="primary-button full-width"
          type="button"
          :disabled="!selectedHouseType"
          @click="step === 0 ? continueFromHouse() : continueToFurniture()"
        >
          Continue to furniture
          <span aria-hidden="true">→</span>
        </button>
        <button class="ghost-button full-width accent-ghost" type="button" @click="resetQuote">Reset all</button>
        <p class="privacy-note">Your details are secure and private</p>
      </aside>
    </section>

    <section v-else-if="step === 2" class="page-grid furniture-page">
      <div class="page-main">
        <div class="page-title compact-title">
          <h1>Add furniture by room</h1>
          <p>Adjust the suggested inventory before reviewing the truck fit.</p>
        </div>

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
              <h2>{{ activeRoom.name }}</h2>
            </div>
            <div class="room-action-row">
              <button class="ghost-button" type="button" @click="clearAllQuantities">Reset furniture</button>
              <button class="ghost-button" type="button" @click="nextRoom">Next room</button>
            </div>
          </div>

          <div class="furniture-grid">
            <article v-for="item in activeRoom.items" :key="item.id" class="furniture-picker">
              <img :src="imageFor(item.asset)" :alt="item.name" />
              <div>
                <h3>{{ item.name }}</h3>
                <p>{{ item.volume.toFixed(2) }} m³ each</p>
              </div>
              <div class="quantity-controls">
                <button type="button" aria-label="Decrease quantity" @click="changeQuantity(item.id, -1)">−</button>
                <strong>{{ quantities[item.id] || 0 }}</strong>
                <button type="button" aria-label="Increase quantity" @click="changeQuantity(item.id, 1)">+</button>
              </div>
            </article>

            <article v-for="item in customItemsForRoom(activeRoom.id)" :key="item.id" class="furniture-picker custom-furniture-picker">
              <div class="custom-box-thumb" :style="customPreviewStyle(item)">
                <span>{{ item.name }}</span>
              </div>
              <div>
                <h3>{{ item.name }}</h3>
                <p>{{ item.widthCm }} x {{ item.depthCm }} x {{ item.heightCm }} cm</p>
              </div>
              <div class="quantity-controls">
                <button type="button" aria-label="Decrease quantity" @click="changeQuantity(item.id, -1)">−</button>
                <strong>{{ quantities[item.id] || 0 }}</strong>
                <button type="button" aria-label="Increase quantity" @click="changeQuantity(item.id, 1)">+</button>
              </div>
            </article>
          </div>

          <form class="custom-item-form" @submit.prevent="addCustomItem">
            <div>
              <h3>Custom item</h3>
              <p>Name it and add its outside dimensions.</p>
            </div>
            <label>
              Name
              <input v-model="customDraft.name" type="text" placeholder="e.g. Aquarium" required />
            </label>
            <label>
              Width cm
              <input v-model.number="customDraft.widthCm" type="number" min="1" step="1" required />
            </label>
            <label>
              Depth cm
              <input v-model.number="customDraft.depthCm" type="number" min="1" step="1" required />
            </label>
            <label>
              Height cm
              <input v-model.number="customDraft.heightCm" type="number" min="1" step="1" required />
            </label>
            <button class="primary-button" type="submit">Add object</button>
          </form>
        </div>
      </div>

      <aside class="summary-card bucket-panel">
        <h2>Item summary</h2>
        <div class="metric-stack">
          <div>
            <strong>{{ totalItems }}</strong>
            <span>Items</span>
          </div>
          <div>
            <strong>~{{ totalVolume.toFixed(0) }} m³</strong>
            <span>Estimated volume</span>
          </div>
        </div>
        <div v-if="inventory.length" class="bucket-list">
          <div v-for="item in inventory" :key="item.id" class="bucket-item">
            <div v-if="item.custom" class="custom-bucket-thumb">
              <span>{{ item.name }}</span>
            </div>
            <img v-else :src="imageFor(item.asset)" :alt="item.name" />
            <span>{{ item.name }}</span>
            <strong>x{{ item.quantity }}</strong>
          </div>
        </div>
        <p v-else class="empty-state">Add items with the plus buttons.</p>
        <button class="primary-button full-width" type="button" :disabled="!inventory.length" @click="step = 3">
          Review truck fit
          <span aria-hidden="true">→</span>
        </button>
      </aside>
    </section>

    <section v-else class="review-page">
      <div class="review-heading">
        <div>
          <h1>Review your truck fit</h1>
          <p>Here's how your items fit in the recommended truck.</p>
        </div>
        <button class="ghost-button" type="button" @click="step = 2">Edit selections</button>
      </div>

      <div class="review-grid">
        <div class="review-main">
          <div class="truck-fit-stage" :class="{ empty: !inventory.length }">
            <div class="view-toggle" aria-label="View mode">
              <button class="selected" type="button">3D view</button>
              <button type="button">Top view</button>
            </div>
            <TruckFitScene v-if="packedTrucks.length" class="truck-fit-canvas" :trucks="packedTrucks" />
            <p v-else class="empty-state">Add items with the plus buttons.</p>
            <div class="scene-help">Click and drag to rotate</div>
            <div class="zoom-controls">
              <button type="button">−</button>
              <span>100%</span>
              <button type="button">+</button>
            </div>
          </div>

          <div class="review-stat-bar">
            <div>
              <span class="soft-icon small icon-home" aria-hidden="true"></span>
              <strong>{{ selectedHouse?.name || 'Home' }}</strong>
              <span>{{ homeDetailLine || 'Home details selected' }}</span>
            </div>
            <div>
              <span class="soft-icon small icon-box" aria-hidden="true"></span>
              <strong>{{ totalItems }} items</strong>
              <span>View item list</span>
            </div>
            <div>
              <span class="soft-icon small icon-cube" aria-hidden="true"></span>
              <strong>~{{ totalVolume.toFixed(0) }} m³</strong>
              <span>Estimated volume</span>
            </div>
            <div>
              <span class="soft-icon small icon-people" aria-hidden="true"></span>
              <strong>{{ recommendedMoverCount }} movers</strong>
              <span>Recommended crew</span>
            </div>
            <div>
              <span class="soft-icon small icon-clock" aria-hidden="true"></span>
              <strong>{{ estimatedMoveTime }}</strong>
              <span>Estimated time</span>
            </div>
          </div>
        </div>

        <aside class="summary-card recommendation-panel" aria-label="Truck recommendation">
          <div class="recommendation-header">
            <h2>Recommended truck</h2>
            <button class="ghost-button compact" type="button" @click="step = 2">Edit</button>
          </div>

          <div class="recommended-truck-card">
            <div class="truck-card-title">
              <span class="soft-icon truck-icon" aria-hidden="true"></span>
              <div>
                <strong>{{ recommendationCardText }}</strong>
                <span>{{ primaryTruck.capacity }} m³ capacity · {{ primaryTruck.cargoLength }}m (L) x {{ primaryTruck.cargoWidth }}m (W) x {{ primaryTruck.cargoHeight }}m (H)</span>
              </div>
            </div>
            <div class="truck-metrics">
              <div>
                <strong>~{{ totalVolume.toFixed(0) }} m³</strong>
                <span>Estimated volume</span>
              </div>
              <div>
                <strong>{{ fillPercent }}%</strong>
                <span>Space used</span>
              </div>
            </div>
            <div class="usage-bar">
              <span :style="{ width: `${fillPercent}%` }"></span>
            </div>
            <div class="mini-facts">
              <span>{{ totalItems }} items<br /><small>{{ truckLoadCount }} truck load{{ truckLoadCount === 1 ? '' : 's' }}</small></span>
              <span>{{ recommendedMoverCount }} movers<br /><small>Recommended</small></span>
            </div>
          </div>

          <button class="primary-button full-width quote-button" type="button" :disabled="!inventory.length">
            Get quote
            <span aria-hidden="true">→</span>
          </button>
          <button class="ghost-button full-width accent-ghost" type="button" @click="step = 2">Adjust items</button>

          <div class="other-options">
            <h3>Other truck options</h3>
            <button v-for="truck in truckOptionCards" :key="truck.id" class="truck-option" type="button">
              <span class="soft-icon small truck-icon" aria-hidden="true"></span>
              <span>
                <strong>{{ truck.name }} Truck</strong>
                {{ truck.capacity }} m³ capacity<br />
                ~{{ totalVolume.toFixed(0) }} m³ · {{ truck.used }}% full
              </span>
              <b>From<br />${{ truck.price }}</b>
            </button>
          </div>
          <p class="privacy-note">Your details are secure and private</p>
        </aside>
      </div>
    </section>
  </main>
</template>
