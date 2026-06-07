<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import TruckFitScene from './components/TruckFitScene.vue';
import AppIcon from './components/AppIcon.vue';
import HomeIllustration from './components/HomeIllustration.vue';
import objectShapes from './data/objectShapes.json';
import savedDimensions from './data/objectDimensions.json';
import savedAttributes from './data/objectAttributes.json';
import { rooms, modelAssetFor } from './data/rooms.js';
import { resolveAttributes, allowedFlips } from './data/attributes.js';
import { buildShape, buildComposite } from './utils/shapes.js';
import { planAndPack, estimateFleet } from './utils/packing.js';
import { measureAsset } from './utils/assetDimensions.js';

const sideImages = import.meta.glob('../Kenny/Side/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

const imageFor = (asset) => sideImages[`../Kenny/Side/${modelAssetFor(asset)}.png`];

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
      boxSmallBedroom: 2,
      boxMediumBedroom: 2,
      boxWardrobeBedroom: 1,
      loungeSofaLong: 1,
      televisionModern: 1,
      cabinetTelevision: 1,
      tableCoffee: 1,
      kitchenFridge: 1,
      kitchenMicrowave: 1,
      boxSmallKitchen: 1,
      boxMediumKitchen: 2,
      bathroomCabinet: 1,
      boxMediumBathroom: 1,
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
      boxSmallBedroom: 3,
      boxMediumBedroom: 3,
      boxWardrobeBedroom: 2,
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
      boxSmallKitchen: 2,
      boxMediumKitchen: 3,
      washer: 1,
      dryer: 1,
      bathroomCabinet: 1,
      bathroomMirror: 1,
      boxSmallBathroom: 1,
      boxMediumBathroom: 1,
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
      boxSmallBedroom: 5,
      boxMediumBedroom: 5,
      boxWardrobeBedroom: 2,
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
      boxSmallKitchen: 4,
      boxMediumKitchen: 4,
      desk: 1,
      chairDesk: 1,
      computerScreen: 1,
      boxSmallOffice: 2,
      boxMediumOffice: 2,
      washer: 1,
      dryer: 1,
      bathroomCabinet: 1,
      bathroomMirror: 1,
      boxSmallBathroom: 1,
      boxMediumBathroom: 1,
      bench: 1,
      bookcaseClosedGarage: 1,
      boxSmallGarage: 3,
      boxMediumGarage: 3,
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
      boxSmallBedroom: 7,
      boxMediumBedroom: 7,
      boxWardrobeBedroom: 3,
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
      boxSmallKitchen: 6,
      boxMediumKitchen: 6,
      desk: 1,
      deskCorner: 1,
      chairDesk: 2,
      computerScreen: 2,
      bookcaseOpenOffice: 1,
      boxSmallOffice: 3,
      boxMediumOffice: 3,
      washerDryerStacked: 1,
      bathroomCabinet: 2,
      bathroomMirror: 2,
      boxSmallBathroom: 1,
      boxMediumBathroom: 2,
      bench: 1,
      bookcaseClosedGarage: 2,
      boxSmallGarage: 5,
      boxMediumGarage: 5,
    },
  },
  {
    id: 'villa',
    name: 'Villa / Large home',
    detail: 'Larger or luxury homes with more space and rooms.',
    rooms: ['bedroom', 'living', 'dining', 'kitchen', 'office', 'laundry', 'bathroom', 'garage'],
    defaults: {
      bedDouble: 2,
      bedSingle: 3,
      cabinetBedDrawer: 4,
      sideTableDrawers: 5,
      boxSmallBedroom: 9,
      boxMediumBedroom: 9,
      boxWardrobeBedroom: 4,
      loungeSofaLong: 2,
      loungeSofaCorner: 1,
      loungeChair: 3,
      televisionModern: 2,
      cabinetTelevision: 2,
      tableCoffee: 2,
      bookcaseOpen: 2,
      table: 1,
      tableRound: 1,
      chair: 10,
      bookcaseClosedWideDining: 1,
      kitchenFridgeLarge: 1,
      kitchenMicrowave: 1,
      kitchenStove: 1,
      kitchenCoffeeMachine: 1,
      boxSmallKitchen: 7,
      boxMediumKitchen: 7,
      desk: 1,
      deskCorner: 1,
      chairDesk: 2,
      computerScreen: 2,
      bookcaseOpenOffice: 1,
      boxSmallOffice: 4,
      boxMediumOffice: 4,
      washerDryerStacked: 1,
      bathroomCabinet: 3,
      bathroomMirror: 3,
      boxSmallBathroom: 2,
      boxMediumBathroom: 2,
      bench: 1,
      bookcaseClosedGarage: 2,
      boxSmallGarage: 6,
      boxMediumGarage: 6,
    },
  },
  {
    id: 'duplex',
    name: 'Duplex',
    detail: 'Two self-contained homes on one property.',
    rooms: ['bedroom', 'living', 'dining', 'kitchen', 'office', 'laundry', 'bathroom', 'garage'],
    defaults: {
      bedDouble: 2,
      bedSingle: 2,
      cabinetBedDrawer: 2,
      sideTableDrawers: 4,
      boxSmallBedroom: 6,
      boxMediumBedroom: 6,
      boxWardrobeBedroom: 2,
      loungeSofaLong: 2,
      loungeChair: 2,
      televisionModern: 2,
      cabinetTelevision: 2,
      tableCoffee: 2,
      bookcaseOpen: 1,
      table: 1,
      chair: 6,
      kitchenFridgeLarge: 1,
      kitchenMicrowave: 1,
      kitchenStove: 1,
      boxSmallKitchen: 5,
      boxMediumKitchen: 5,
      desk: 1,
      chairDesk: 1,
      computerScreen: 1,
      boxSmallOffice: 2,
      boxMediumOffice: 2,
      washer: 1,
      dryer: 1,
      bathroomCabinet: 2,
      bathroomMirror: 2,
      boxSmallBathroom: 1,
      boxMediumBathroom: 2,
      bench: 1,
      boxSmallGarage: 3,
      boxMediumGarage: 3,
    },
  },
];

// Card copy + Move-summary facts for each home type, keyed by id.
const houseTypeMeta = {
  studio: { icon: 'studio', tagline: 'Single open-plan area', blurb: 'Best for compact single-level homes with one open area.', sizeRange: '10 – 20 m³', crew: '2 movers', time: '1.5 – 3 hrs' },
  apartment: { icon: 'building', tagline: 'Multi-storey building', blurb: 'Best for apartments and units in multi-storey buildings.', sizeRange: '20 – 35 m³', crew: '2 movers', time: '2.5 – 4 hrs' },
  townhouse: { icon: 'townhouse', tagline: 'Shares a wall', blurb: 'Best for multi-level homes that share a wall.', sizeRange: '30 – 45 m³', crew: '2 movers', time: '3 – 5 hrs' },
  house: { icon: 'house', tagline: 'Detached home', blurb: 'Best for detached houses with separate outdoor access.', sizeRange: '40 – 60 m³', crew: '3 movers', time: '4 – 6 hrs' },
  villa: { icon: 'villa', tagline: 'Larger / luxury home', blurb: 'Best for larger or luxury homes with more space and rooms.', sizeRange: '55 – 80 m³', crew: '3 movers', time: '5 – 7 hrs' },
  duplex: { icon: 'duplex', tagline: 'Two self-contained homes', blurb: 'Best for two self-contained homes on one property.', sizeRange: '45 – 65 m³', crew: '3 movers', time: '4 – 6 hrs' },
};

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
      orientationFlips: ['flat'],
      shape,
      volume: (dimensions.widthCm * dimensions.depthCm * dimensions.heightCm) / 1_000_000,
    };
  }

  const saved = savedDimensions[item.asset];
  const dimensions = dimsForAsset(item.asset);
  const attributes = resolveAttributes(item.asset, savedAttributes);

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
    orientationFlips: allowedFlips(attributes.orientations),
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
const roomTabsEl = ref(null);
const canScrollRoomTabsLeft = ref(false);
const canScrollRoomTabsRight = ref(false);

const updateRoomTabsScroll = () => {
  const el = roomTabsEl.value;
  if (!el) {
    canScrollRoomTabsLeft.value = false;
    canScrollRoomTabsRight.value = false;
    return;
  }
  const maxScroll = el.scrollWidth - el.clientWidth;
  // Arrows reflect whether there is an adjacent room to move to in each direction.
  const index = includedRooms.value.findIndex((room) => room.id === activeRoomId.value);
  canScrollRoomTabsLeft.value = maxScroll > 1 && index > 0;
  canScrollRoomTabsRight.value = maxScroll > 1 && index < includedRooms.value.length - 1;
};

// Smoothly bring the active room tab to the centre of the strip.
const centerActiveRoomTab = () => {
  const el = roomTabsEl.value;
  if (!el) return;
  const active = el.querySelector('button.active') || el.querySelector('button');
  if (!active) return;
  const target = active.offsetLeft - el.clientWidth / 2 + active.offsetWidth / 2;
  const maxScroll = el.scrollWidth - el.clientWidth;
  el.scrollTo({ left: Math.max(0, Math.min(target, maxScroll)), behavior: 'smooth' });
  updateRoomTabsScroll();
};

// Move the selection to the previous/next room; centring follows via the watcher.
const stepRoom = (direction) => {
  const list = includedRooms.value;
  const index = list.findIndex((room) => room.id === activeRoomId.value);
  const next = index + direction;
  if (next < 0 || next >= list.length) return;
  activeRoomId.value = list[next].id;
};

onMounted(() => {
  updateRoomTabsScroll();
  window.addEventListener('resize', updateRoomTabsScroll);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateRoomTabsScroll);
});
const quantities = reactive({});
const customItems = ref([]);
const itemSearch = ref('');
const customNameInput = ref(null);
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
  villa: { bedrooms: 5, bathrooms: 3, living: 2, dining: 1, office: 1, garage: 1 },
  duplex: { bedrooms: 4, bathrooms: 2, living: 2, dining: 1, office: 1, garage: 1 },
};

const householdDetails = reactive({ ...householdDefaultsByHouse.apartment });

const householdSelectors = [
  { key: 'bedrooms', icon: 'bed', title: 'Number of bedrooms', options: [1, 2, 3, 4, 5], suffix: 'Bedroom' },
  { key: 'bathrooms', icon: 'bath', title: 'Number of bathrooms', options: [1, 2, 3, 4], suffix: 'Bathroom' },
  { key: 'living', icon: 'sofa', title: 'Living rooms', options: [1, 2, 3], suffix: 'Living room' },
  { key: 'dining', icon: 'dining', title: 'Dining rooms', options: [0, 1, 2], suffix: 'Dining room' },
  { key: 'office', icon: 'desk', title: 'Office / study', options: [0, 1, 2], suffix: 'Office' },
  { key: 'garage', icon: 'garage', title: 'Garage / outdoor', options: [0, 1], labels: { 0: 'None', 1: 'Yes' } },
];

const suggestedFallbackDefaults = houseTypes.reduce((acc, house) => {
  Object.entries(house.defaults).forEach(([itemId, quantity]) => {
    if (!acc[itemId] && quantity > 0) acc[itemId] = quantity;
  });
  return acc;
}, {});

const selectedHouse = computed(() => houseTypes.find((house) => house.id === selectedHouseType.value));

const selectedHouseMeta = computed(() => houseTypeMeta[selectedHouseType.value] || null);

const previewedHouseMeta = computed(() => houseTypeMeta[previewedHouseType.value] || null);

const moveSummaryMeta = computed(() => previewedHouseMeta.value || selectedHouseMeta.value);

const moveSummaryHouse = computed(
  () => houseTypes.find((house) => house.id === (previewedHouseType.value || selectedHouseType.value)) || null,
);


const isStudioSelected = computed(() => selectedHouseType.value === 'studio');

const selectedHouseRoomIds = computed(() => new Set(selectedHouse.value?.rooms || []));

const roomIcons = {
  bedroom: 'bed',
  living: 'sofa',
  dining: 'dining',
  kitchen: 'kitchen',
  office: 'desk',
  laundry: 'laundry',
  bathroom: 'bath',
  garage: 'garage',
  studio: 'house',
};

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

// Inventory grouped by room type for the review breakdown, preserving the
// catalog room order from includedRooms.
const roomBreakdown = computed(() => {
  const groups = new Map();
  for (const item of inventory.value) {
    const roomName = item.room || 'Other';
    if (!groups.has(roomName)) groups.set(roomName, []);
    groups.get(roomName).push({ name: item.name, quantity: item.quantity });
  }
  const order = includedRooms.value.map((room) => room.name);
  return Array.from(groups, ([room, items]) => ({ room, items })).sort(
    (a, b) => order.indexOf(a.room) - order.indexOf(b.room),
  );
});

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

// Real-world packing is never perfect, so every object is budgeted 5% more than its raw volume
// when reporting how full the truck is.
const PACKING_SLACK = 1.05;

const fillPercent = computed(() => {
  // Measure against the capacity of the trucks actually packed (authoritative), not the live
  // lower-bound estimate — otherwise the % is wrong whenever the packed fleet differs from it.
  if (!packedTruckCapacity.value) return 0;
  return Math.min(100, Math.round(((totalVolume.value * PACKING_SLACK) / packedTruckCapacity.value) * 100));
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

const formatSelectorOptionNumber = (selector, value) => {
  if (selector.labels?.[value]) return selector.labels[value];
  // The largest option of each selector reads as an open-ended "N+".
  const isMax = value === selector.options[selector.options.length - 1];
  return `${value}${isMax ? '+' : ''}`;
};

const formatSelectorOptionLabel = (selector, value) => {
  if (selector.labels?.[value] || !selector.suffix) return '';
  return `${selector.suffix}${value === 1 ? '' : 's'}`;
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

const continueToInventoryChoice = () => {
  seedFurnitureDefaults();
  activeRoomId.value = includedRooms.value[0]?.id || 'bedroom';
  step.value = 2;
};

// Quick path: keep the seeded average inventory and skip straight to the truck review.
const useQuickEstimate = () => {
  seedFurnitureDefaults();
  step.value = 4;
};

// Detailed path: go room by room and adjust each item.
const customiseInventory = () => {
  seedFurnitureDefaults();
  activeRoomId.value = includedRooms.value[0]?.id || 'bedroom';
  step.value = 3;
};

const changeQuantity = (itemId, amount) => {
  quantities[itemId] = Math.max(0, (quantities[itemId] || 0) + amount);
};

const customItemsForRoom = (roomId) => customItems.value.filter((item) => item.roomId === roomId);

const searchQuery = computed(() => itemSearch.value.trim());

// Full catalog search across every room, so customers aren't limited to the active
// room's suggested list. De-duplicated by item id.
const searchResults = computed(() => {
  const query = searchQuery.value.toLowerCase();
  if (!query) return [];
  const seen = new Set();
  const results = [];
  for (const room of rooms) {
    for (const item of room.items) {
      if (seen.has(item.id)) continue;
      if (item.name.toLowerCase().includes(query) || room.name.toLowerCase().includes(query)) {
        seen.add(item.id);
        results.push({ ...item, room: room.name });
      }
    }
  }
  return results;
});

// Jump to the custom-item form from the "Can't find an item?" prompt.
const goToCustomItem = async () => {
  if (customDraft.name === '' && searchQuery.value) customDraft.name = searchQuery.value;
  await nextTick();
  customNameInput.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  customNameInput.value?.focus({ preventScroll: true });
};

const customPreviewStyle = (item) => ({
  aspectRatio: `${Math.max(item.widthCm, 1)} / ${Math.max(item.depthCm, 1)}`,
});

const resetCustomDraft = () => {
  customDraft.name = '';
  customDraft.widthCm = '';
  customDraft.depthCm = '';
  customDraft.heightCm = '';
};

// Step values: 0 Home type · 1 Home details · 2 Inventory choice · 3 Furniture · 4 Review · 5 Quote.
watch(step, async () => {
  await nextTick();
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  centerActiveRoomTab();
});

watch([includedRooms, activeRoomId], async () => {
  await nextTick();
  centerActiveRoomTab();
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

const primaryTruckPrice = computed(() =>
  primaryTruck.value?.id === 'small' ? 420 : primaryTruck.value?.id === 'large' ? 680 : 540,
);

// Indicative price range shown on the Quote step: truck base + volume + extra crew.
const quoteEstimate = computed(() => {
  const volumeCost = Math.round(totalVolume.value * 14);
  const crewCost = Math.max(0, recommendedMoverCount.value - 2) * 140;
  const low = primaryTruckPrice.value + volumeCost + crewCost;
  return { low, high: Math.round((low * 1.22) / 10) * 10 };
});

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
    step.value = 4;
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
    <section v-if="step === 0" class="page-grid home-type-page">
      <div class="page-main">
        <div class="page-title">
          <h1>What type of home are you moving from?</h1>
          <p>Select the option that best matches your current property. You can refine the details in the next step.</p>
        </div>

        <div class="home-type-grid">
          <button
            v-for="house in houseTypes"
            :key="house.id"
            class="home-type-card-btn"
            :class="{ selected: selectedHouseType === house.id }"
            type="button"
            @mouseenter="previewedHouseType = house.id"
            @mouseleave="previewedHouseType = null"
            @click="chooseHouse(house.id)"
          >
            <span class="home-type-badge"><AppIcon :name="houseTypeMeta[house.id].icon" :size="24" /></span>
            <span v-if="selectedHouseType === house.id" class="home-type-check"><AppIcon name="check" :size="14" /></span>
            <span class="home-type-art"></span>
            <HomeIllustration :id="house.id" :hovered="previewedHouseType === house.id" />
            <span class="home-type-name">{{ house.name }}</span>
            <small class="home-type-blurb">{{ houseTypeMeta[house.id].blurb }}</small>
          </button>
        </div>

      </div>

      <aside class="summary-card move-summary">
        <h2>Move summary</h2>

        <div v-if="moveSummaryMeta" class="selected-type">
          <span class="selected-type-label">Selected home type</span>
          <div class="selected-type-body">
            <span class="home-type-badge solid"><AppIcon :name="moveSummaryMeta.icon" :size="24" /></span>
            <div class="selected-type-text">
              <strong>{{ moveSummaryHouse?.name }}</strong>
              <span>{{ moveSummaryMeta.tagline }}</span>
            </div>
            <button v-if="selectedHouseType" class="link-button" type="button" @click="previewedHouseType = null">Change</button>
          </div>
        </div>
        <p v-else class="empty-state">Pick a home type to see typical move details.</p>

        <template v-if="moveSummaryMeta">
          <div class="summary-divider"></div>

          <div class="fact-list">
            <div class="fact-row"><AppIcon name="cube" :size="20" /><span>Typical size range</span><strong>{{ moveSummaryMeta.sizeRange }}</strong></div>
            <div class="fact-row"><AppIcon name="people" :size="20" /><span>Typical crew</span><strong>{{ moveSummaryMeta.crew }}</strong></div>
            <div class="fact-row"><AppIcon name="clock" :size="20" /><span>Typical time</span><strong>{{ moveSummaryMeta.time }}</strong></div>
          </div>

          <div class="profile-callout">
            <span class="profile-label">Estimated move profile <AppIcon name="info" :size="14" /></span>
            <div class="profile-value">
              <strong>~{{ moveSummaryMeta.sizeRange }}</strong>
              <em>Typical</em>
            </div>
            <p>This helps us suggest the right truck size and crew for your move.</p>
          </div>
        </template>

        <button class="primary-button full-width" type="button" :disabled="!selectedHouseType" @click="continueFromHouse">
          Continue to home details
          <AppIcon name="arrowRight" :size="18" />
        </button>
        <button class="ghost-button full-width accent-ghost" type="button" @click="resetQuote"><AppIcon name="refresh" :size="16" /> Reset all</button>
        <p class="privacy-note"><AppIcon name="lock" :size="14" /> Your details are secure and private</p>
      </aside>
    </section>

    <section v-else-if="step === 1" class="page-grid home-details-page">
      <div class="page-main">
        <div class="page-title">
          <h1>Tell us about your home</h1>
          <p>Add a few details about your space so we can give you the most accurate quote.</p>
        </div>

        <div class="property-selector-list">
          <article v-for="selector in householdSelectors" :key="selector.key" class="property-selector-card">
            <div class="selector-copy">
              <span class="soft-icon"><AppIcon :name="selector.icon" :size="26" /></span>
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
            <div class="radio-option-row" :aria-label="selector.title" :style="{ '--cols': selector.options.length }">
              <button
                v-for="option in selector.options"
                :key="option"
                type="button"
                class="radio-option"
                :class="{ selected: householdDetails[selector.key] === option }"
                @click="householdDetails[selector.key] = option"
              >
                <span class="option-text">
                  <span class="option-number">{{ formatSelectorOptionNumber(selector, option) }}</span>
                  <span v-if="formatSelectorOptionLabel(selector, option)" class="option-label">{{ formatSelectorOptionLabel(selector, option) }}</span>
                </span>
                <span class="option-check"><AppIcon name="check" :size="13" /></span>
              </button>
            </div>
          </article>
        </div>
      </div>

      <aside class="summary-card home-summary">
        <h2>Your home summary</h2>
        <div class="summary-list">
          <div v-for="row in homeSummaryRows" :key="row.key" class="summary-row">
            <span class="soft-icon small"><AppIcon :name="row.icon" :size="18" /></span>
            <span>{{ row.label }}</span>
            <strong>{{ row.value }}</strong>
          </div>
        </div>

        <div class="volume-callout">
          <span>Estimated volume</span>
          <strong>~{{ totalVolume.toFixed(0) || 0 }} m³</strong>
          <p>This helps us match you with the right truck and team size.</p>
        </div>

        <button class="primary-button full-width" type="button" @click="continueToInventoryChoice">
          Continue
          <AppIcon name="arrowRight" :size="18" />
        </button>
        <button class="ghost-button full-width accent-ghost" type="button" @click="resetQuote"><AppIcon name="refresh" :size="16" /> Reset all</button>
        <p class="privacy-note"><AppIcon name="lock" :size="14" /> Your details are secure and private</p>
      </aside>
    </section>

    <section v-else-if="step === 2" class="page-grid inventory-choice-page">
      <div class="page-main">
        <div class="page-title">
          <h1>How would you like to build your inventory?</h1>
          <p>Pick a quick estimate using the typical items for your home, or customise the furniture in every room.</p>
        </div>

        <div class="inventory-choice-grid">
          <button class="inventory-choice-card recommended" type="button" @click="useQuickEstimate">
            <span class="choice-flag">Fastest</span>
            <span class="home-type-badge"><AppIcon name="bolt" :size="26" /></span>
            <span class="choice-name">Quick estimate</span>
            <p class="choice-blurb">We'll use the average inventory for a {{ selectedHouse?.name || 'home' }} this size. Best if selecting every item feels like too much.</p>
            <ul class="choice-points">
              <li><AppIcon name="check" :size="15" /> Pre-filled with typical furniture</li>
              <li><AppIcon name="check" :size="15" /> Skip straight to your truck &amp; quote</li>
              <li><AppIcon name="check" :size="15" /> ~{{ totalVolume.toFixed(0) }} m³ estimated to start</li>
            </ul>
            <span class="choice-cta">Use quick estimate <AppIcon name="arrowRight" :size="18" /></span>
          </button>

          <button class="inventory-choice-card" type="button" @click="customiseInventory">
            <span class="home-type-badge"><AppIcon name="sliders" :size="26" /></span>
            <span class="choice-name">Customise furniture</span>
            <p class="choice-blurb">Go room by room and adjust every item for the most accurate quote.</p>
            <ul class="choice-points">
              <li><AppIcon name="check" :size="15" /> Add or remove items per room</li>
              <li><AppIcon name="check" :size="15" /> Add your own custom items</li>
              <li><AppIcon name="check" :size="15" /> Most accurate estimate</li>
            </ul>
            <span class="choice-cta">Customise my inventory <AppIcon name="arrowRight" :size="18" /></span>
          </button>
        </div>
      </div>

      <aside class="summary-card home-summary">
        <h2>Your home summary</h2>
        <div class="summary-list">
          <div v-for="row in homeSummaryRows" :key="row.key" class="summary-row">
            <span class="soft-icon small"><AppIcon :name="row.icon" :size="18" /></span>
            <span>{{ row.label }}</span>
            <strong>{{ row.value }}</strong>
          </div>
        </div>

        <div class="volume-callout">
          <span>Estimated volume</span>
          <strong>~{{ totalVolume.toFixed(0) || 0 }} m³</strong>
          <p>Typical for a {{ selectedHouse?.name || 'home' }} of this size — you can still adjust it.</p>
        </div>

        <button class="ghost-button full-width accent-ghost" type="button" @click="step = isStudioSelected ? 0 : 1"><AppIcon name="swap" :size="16" /> Back</button>
        <p class="privacy-note"><AppIcon name="lock" :size="14" /> Your details are secure and private</p>
      </aside>
    </section>

    <section v-else-if="step === 3" class="page-grid furniture-page">
      <div class="page-main">
        <div class="page-title compact-title">
          <h1>Add furniture by room</h1>
          <p>Adjust the suggested inventory before reviewing the truck fit.</p>
        </div>

        <div class="room-tabs-wrap">
          <button
            v-show="canScrollRoomTabsLeft"
            type="button"
            class="room-tabs-arrow room-tabs-arrow--left"
            aria-label="Previous room"
            @click="stepRoom(-1)"
          >
            <AppIcon name="chevronLeft" :size="18" />
          </button>
          <nav
            ref="roomTabsEl"
            class="room-tabs"
            aria-label="Included rooms"
          >
            <button
              v-for="room in includedRooms"
              :key="room.id"
              type="button"
              :class="{ active: activeRoom?.id === room.id }"
              @click="activeRoomId = room.id"
            >
              <AppIcon :name="roomIcons[room.id] || 'box'" :size="18" />
              <span>{{ room.name }}</span>
            </button>
          </nav>
          <button
            v-show="canScrollRoomTabsRight"
            type="button"
            class="room-tabs-arrow room-tabs-arrow--right"
            aria-label="Next room"
            @click="stepRoom(1)"
          >
            <AppIcon name="chevronRight" :size="18" />
          </button>
        </div>

        <div v-if="activeRoom" class="room-workspace">
          <div class="room-title-row">
            <div>
              <span>{{ roomProgressLabel }}</span>
              <h2>{{ activeRoom.name }}</h2>
            </div>
          </div>

          <div class="item-search">
            <AppIcon name="search" :size="18" />
            <input v-model="itemSearch" type="search" placeholder="Search for any item across all rooms…" aria-label="Search items" />
            <button v-if="itemSearch" type="button" class="item-search-clear" aria-label="Clear search" @click="itemSearch = ''">×</button>
          </div>

          <div v-if="searchQuery" class="search-results">
            <div v-if="searchResults.length" class="furniture-grid">
              <article v-for="item in searchResults" :key="item.id" class="furniture-picker">
                <img :src="imageFor(item.asset)" :alt="item.name" />
                <div>
                  <h3>{{ item.name }}</h3>
                  <p>{{ item.volume.toFixed(2) }} m³ · {{ item.room }}</p>
                </div>
                <div class="quantity-controls">
                  <button type="button" aria-label="Decrease quantity" @click="changeQuantity(item.id, -1)">−</button>
                  <strong>{{ quantities[item.id] || 0 }}</strong>
                  <button type="button" aria-label="Increase quantity" @click="changeQuantity(item.id, 1)">+</button>
                </div>
              </article>
            </div>
            <p v-else class="search-empty">No items match “{{ searchQuery }}”.</p>

            <div class="cant-find">
              <span>Can't find an item?</span>
              <button type="button" class="ghost-button" @click="goToCustomItem">
                <AppIcon name="boxPlus" :size="16" /> Add a custom item
              </button>
            </div>
          </div>

          <div v-else class="furniture-grid">
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
            <div class="custom-item-intro">
              <span class="soft-icon custom-item-icon"><AppIcon name="boxPlus" :size="26" /></span>
              <div>
                <h3>Add a custom item</h3>
                <p>Can't find it in the list? Add its dimensions and we'll include it in your estimate.</p>
              </div>
            </div>
            <label>
              Name
              <input ref="customNameInput" v-model="customDraft.name" type="text" placeholder="e.g. Aquarium" required />
            </label>
            <label>
              Width (cm)
              <input v-model.number="customDraft.widthCm" type="number" min="1" step="1" placeholder="e.g. 80" required />
            </label>
            <label>
              Depth (cm)
              <input v-model.number="customDraft.depthCm" type="number" min="1" step="1" placeholder="e.g. 40" required />
            </label>
            <label>
              Height (cm)
              <input v-model.number="customDraft.heightCm" type="number" min="1" step="1" placeholder="e.g. 60" required />
            </label>
            <button class="primary-button" type="submit">Add custom item</button>
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
        <button class="primary-button full-width" type="button" :disabled="!inventory.length" @click="step = 4">
          Review truck fit
          <span aria-hidden="true">→</span>
        </button>
      </aside>
    </section>

    <section v-else-if="step === 4" class="review-page">
      <div class="review-heading">
        <div>
          <h1>Review your truck fit</h1>
          <p>Here's how your items fit in the recommended truck.</p>
        </div>
        <button class="ghost-button" type="button" @click="step = 3"><AppIcon name="edit" :size="16" /> Edit selections</button>
      </div>

      <div class="review-grid">
        <div class="review-main">
          <div class="truck-fit-stage" :class="{ empty: !inventory.length }">
            <TruckFitScene v-if="packedTrucks.length" class="truck-fit-canvas" :trucks="packedTrucks" />
            <p v-else class="empty-state">Add items with the plus buttons.</p>
            <div class="scene-help">Click and drag to rotate</div>
          </div>

          <div class="review-breakdown">
            <div class="review-breakdown-head">
              <span class="soft-icon small"><AppIcon name="house" :size="18" /></span>
              <div>
                <strong>{{ selectedHouse?.name || 'Home' }}</strong>
                <span>{{ homeDetailLine || 'Home details selected' }}</span>
              </div>
            </div>
            <div v-if="roomBreakdown.length" class="room-breakdown">
              <div v-for="group in roomBreakdown" :key="group.room" class="room-breakdown-group">
                <h3>{{ group.room }}</h3>
                <ul>
                  <li v-for="item in group.items" :key="item.name">
                    <span>{{ item.name }}</span>
                    <span class="qty">×{{ item.quantity }}</span>
                  </li>
                </ul>
              </div>
            </div>
            <p v-else class="review-breakdown-empty">No items added yet.</p>
          </div>
        </div>

        <aside class="summary-card recommendation-panel" aria-label="Truck recommendation">
          <div class="recommendation-header">
            <h2>Recommended truck</h2>
          </div>

          <div class="recommended-truck-card">
            <div class="truck-card-title">
              <span class="soft-icon truck-icon"><AppIcon name="truck" :size="28" /></span>
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

          <button class="primary-button full-width quote-button" type="button" :disabled="!inventory.length" @click="step = 5">
            Get quote
            <AppIcon name="arrowRight" :size="18" />
          </button>
          <button class="ghost-button full-width accent-ghost" type="button" @click="step = 3"><AppIcon name="swap" :size="16" /> Adjust items</button>

          <p class="privacy-note"><AppIcon name="lock" :size="14" /> Your details are secure and private</p>
        </aside>
      </div>
    </section>

    <section v-else class="page-grid quote-page">
      <div class="page-main">
        <div class="page-title">
          <h1>Your moving estimate</h1>
          <p>Based on your inventory and the recommended truck. Final pricing is confirmed after a quick review.</p>
        </div>

        <div class="quote-hero">
          <div class="quote-hero-head">
            <span class="quote-badge"><AppIcon name="shield" :size="22" /></span>
            <div>
              <strong>Estimated total</strong>
              <span>{{ recommendationCardText }} · {{ recommendedMoverCount }} movers</span>
            </div>
          </div>
          <div class="quote-price">
            <strong>${{ quoteEstimate.low }} – ${{ quoteEstimate.high }}</strong>
            <em>incl. truck, crew &amp; basic insurance</em>
          </div>
          <div class="quote-fact-grid">
            <div><AppIcon name="cube" :size="20" /><strong>~{{ totalVolume.toFixed(0) }} m³</strong><span>Estimated volume</span></div>
            <div><AppIcon name="box" :size="20" /><strong>{{ totalItems }} items</strong><span>To be moved</span></div>
            <div><AppIcon name="people" :size="20" /><strong>{{ recommendedMoverCount }} movers</strong><span>Recommended crew</span></div>
            <div><AppIcon name="clock" :size="20" /><strong>{{ estimatedMoveTime }}</strong><span>Estimated time</span></div>
          </div>
        </div>

        <div class="quote-includes">
          <h3>What's included</h3>
          <ul>
            <li><AppIcon name="check" :size="16" /> {{ recommendationCardText }} with driver</li>
            <li><AppIcon name="check" :size="16" /> {{ recommendedMoverCount }} professional movers</li>
            <li><AppIcon name="check" :size="16" /> Loading, transport and unloading</li>
            <li><AppIcon name="check" :size="16" /> Basic transit insurance cover</li>
          </ul>
        </div>
      </div>

      <aside class="summary-card quote-summary">
        <h2>Request your quote</h2>
        <p class="quote-summary-sub">Send your details and a move specialist will confirm your final price.</p>

        <form class="quote-form" @submit.prevent>
          <label>Full name<input type="text" placeholder="Jordan Smith" /></label>
          <label>Email<input type="email" placeholder="you@email.com" /></label>
          <label>Phone<input type="tel" placeholder="0400 000 000" /></label>
          <label>Preferred move date<input type="date" /></label>
          <button class="primary-button full-width" type="submit">
            Request final quote
            <AppIcon name="arrowRight" :size="18" />
          </button>
        </form>

        <button class="ghost-button full-width accent-ghost" type="button" @click="step = 4"><AppIcon name="edit" :size="16" /> Back to review</button>
        <p class="privacy-note"><AppIcon name="lock" :size="14" /> Your details are secure and private</p>
      </aside>
    </section>
  </main>
</template>
