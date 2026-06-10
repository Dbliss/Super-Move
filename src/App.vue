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
import logoUrl from '../images/logo.png';
import truckUrl from '../images/truck.png';

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
      // Bedroom section
      bedDouble: 1,
      cabinetBedDrawer: 1,
      sideTableDrawers: 2,
      boxSmallBedroom: 6,
      boxMediumBedroom: 14,
      boxLargeBedroom: 6,
      boxWardrobeBedroom: 2,
      // Living section
      televisionModern: 1,
      cabinetTelevision: 1,
      tableCoffee: 1,
      bookcaseOpen: 1,
      pottedPlantLiving: 4,
      // Kitchen section
      kitchenFridge: 1,
      kitchenMicrowave: 1,
      // Bathroom section
      bathroomMirror: 1,
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
      boxMediumBedroom: 13,
      boxWardrobeBedroom: 3,
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
      boxMediumKitchen: 13,
      washer: 1,
      dryer: 1,
      bathroomCabinet: 1,
      bathroomMirror: 1,
      boxSmallBathroom: 1,
      boxMediumBathroom: 6,
      pottedPlantLiving: 6,
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
      boxMediumBedroom: 15,
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
      desk: 2,
      chairDesk: 2,
      computerScreen: 2,
      boxSmallOffice: 12,
      boxMediumOffice: 2,
      washer: 1,
      dryer: 1,
      bathroomCabinet: 1,
      bathroomMirror: 1,
      boxSmallBathroom: 11,
      boxMediumBathroom: 1,
      bench: 2,
      bookcaseClosedGarage: 1,
      boxSmallGarage: 3,
      boxMediumGarage: 13,
      pottedPlantLiving: 11,
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
      boxMediumBedroom: 17,
      boxWardrobeBedroom: 6,
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
      pottedPlantLiving: 12,
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
      boxMediumBedroom: 16,
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
      pottedPlantLiving: 12,
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
      boxMediumBedroom: 19,
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
      boxMediumBathroom: 12,
      bench: 1,
      bookcaseClosedGarage: 2,
      boxSmallGarage: 6,
      boxMediumGarage: 6,
      pottedPlantLiving: 15,
    },
  },
];

// Card copy + Move-summary facts for each home type, keyed by id.
const houseTypeMeta = {
  studio: { icon: 'studio', tagline: 'Single open-plan area', blurb: 'Best for compact single-level homes with one open area.', sizeRange: '15 – 20 m³', crew: '2 movers', time: '1.5 – 3 hrs' },
  apartment: { icon: 'building', tagline: 'Multi-storey building', blurb: 'Best for apartments and units in multi-storey buildings.', sizeRange: '20 – 30 m³', crew: '2 movers', time: '2.5 – 4 hrs' },
  townhouse: { icon: 'townhouse', tagline: 'Shares a wall', blurb: 'Best for multi-level homes that share a wall.', sizeRange: '25 – 40 m³', crew: '3 movers', time: '3 – 5 hrs' },
  house: { icon: 'house', tagline: 'Detached home', blurb: 'Best for detached houses with separate outdoor access.', sizeRange: '35 – 50 m³', crew: '3 – 4 movers', time: '4 – 6 hrs' },
  villa: { icon: 'villa', tagline: 'Larger / luxury home', blurb: 'Best for larger or luxury homes with more space and rooms.', sizeRange: '50 – 80 m³', crew: '4 – 5 movers', time: '5 – 7 hrs' },
  duplex: { icon: 'duplex', tagline: 'Two self-contained homes', blurb: 'Best for two self-contained homes on one property.', sizeRange: '40 – 55 m³', crew: '3 – 4 movers', time: '4 – 6 hrs' },
};

// Typical crew limit per home type. Extra rooms beyond what's normal for the
// type can push the recommended crew one above this limit.
const crewLimitByHouse = {
  studio: 2,
  apartment: 2,
  townhouse: 3,
  house: 4,
  villa: 5,
  duplex: 4,
};

const truckSizes = [
  {
    id: 'small',
    name: 'Small',
    capacity: 15,
    width: 130,
    gridColumns: 10,
    gridRows: 5,
    cargoLength: 3.25,
    cargoWidth: 2.2,
    cargoHeight: 2.1,
  },
  {
    id: 'large',
    name: 'Large',
    capacity: 35,
    width: 220,
    gridColumns: 18,
    gridRows: 5,
    cargoLength: 6.1,
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
const inventoryChoice = ref('quick');
const selectedHouseType = ref('apartment');
const previewedHouseType = ref(null);
const activeRoomId = ref('bedroom');
const breakdownExpanded = ref(false);
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
const searchInputEl = ref(null);
// Whether the search field has focus, used to reveal the suggestion dropdown even
// before the customer types anything.
const searchFocused = ref(false);
let blurTimer = null;
const onSearchFocus = () => {
  if (blurTimer) clearTimeout(blurTimer);
  searchFocused.value = true;
};
// Delay closing so a click on a suggestion (which blurs the input first) still registers.
const onSearchBlur = () => {
  blurTimer = setTimeout(() => {
    searchFocused.value = false;
  }, 150);
};
const customNameInput = ref(null);
const customDraft = reactive({
  name: '',
  widthCm: '',
  depthCm: '',
  heightCm: '',
});

const quoteFormDefaults = {
  fullName: 'John Smith',
  email: '',
  phone: '',
  pickupAddress: '',
  dropoffAddress: '',
  preferredMoveDate: '',
  notes: '',
};

const quoteForm = reactive({ ...quoteFormDefaults });
const quoteSubmitted = ref(false);
const requiredQuoteFields = Object.keys(quoteFormDefaults);
const WIX_QUOTE_MESSAGE_TYPE = 'superMove.quoteSubmitted';

const quoteFormIsComplete = computed(() =>
  requiredQuoteFields.every((field) => String(quoteForm[field] || '').trim().length > 0),
);

const householdDefaultsByHouse = {
  studio: { bedrooms: 1, bathrooms: 0, living: 0, dining: 0, office: 0, garage: 0 },
  apartment: { bedrooms: 2, bathrooms: 1, living: 1, dining: 1, office: 0, garage: 0 },
  townhouse: { bedrooms: 3, bathrooms: 2, living: 1, dining: 1, office: 1, garage: 1 },
  house: { bedrooms: 4, bathrooms: 2, living: 2, dining: 1, office: 1, garage: 1 },
  villa: { bedrooms: 5, bathrooms: 3, living: 2, dining: 1, office: 1, garage: 1 },
  duplex: { bedrooms: 4, bathrooms: 2, living: 2, dining: 1, office: 1, garage: 1 },
};

// Base volume per home type (m³) — kitchen, bathrooms, laundry and hallways
// are already included in this figure. Per-room increments are added on top.
const homeTypeBaseVolume = {
  studio: 18,
  apartment: 10,
  townhouse: 15,
  house: 20,
  duplex: 25,
  villa: 30,
};

// Volume (m³) added per counted room/feature in the home-details step.
const roomVolumeIncrements = {
  bedrooms: 4,
  living: 4,
  dining: 4,
  office: 4,
  garage: 6,
  bathrooms: 1,
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
    ? // A studio is one physical room, but its furniture is still organised by the areas it
      // comes from. We surface those areas (Bedroom, Living, Kitchen, Bathroom) as their own
      // room tabs so the picker matches the multi-room layout.
      rooms.filter((room) => selectedHouseRoomIds.value.has(room.id))
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

// Estimated move profile from the home-details room counts: a base volume for
// the home type plus a per-room increment for each counted room/feature.
const estimatedRoomVolume = computed(() => {
  const base = homeTypeBaseVolume[selectedHouseType.value] ?? 0;
  return Object.entries(roomVolumeIncrements).reduce(
    (sum, [key, perRoom]) => sum + (householdDetails[key] || 0) * perRoom,
    base,
  );
});

// Displayed estimate as a range: -10% (low) to +15% (high) of the point estimate.
const estimatedVolumeRange = computed(() => {
  const v = estimatedRoomVolume.value;
  return `${Math.round(v * 0.9)} – ${Math.round(v * 1.15)} m³`;
});

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

const fillPercent = computed(() => {
  // Prefer the packer's real usable-space accounting: each truck reports the cells it consumes
  // (cargo + dead air above closed-top items + trapped air under cargo) vs its total cells, summed
  // fleet-wide. This charges for space that can never be filled — e.g. a plant freezes the whole
  // column above it — so it reflects actual usable space left, not just summed item volume.
  if (packedTrucks.value.length) {
    const used = packedTrucks.value.reduce((sum, t) => sum + (t.usedCells || 0), 0);
    const total = packedTrucks.value.reduce((sum, t) => sum + (t.gridCells || 0), 0);
    if (total) return Math.min(100, Math.round((used / total) * 100));
  }
  // Before the first pack lands (no grid yet) fall back to a plain volume estimate so the meter
  // is never blank during the packing spinner.
  if (!packedTruckCapacity.value) return 0;
  return Math.min(100, Math.round((totalVolume.value / packedTruckCapacity.value) * 100));
});

// Fill health for the usage bar. 60–85% is the sweet spot — enough left for padding/awkward gaps
// without paying for a truck that's mostly air, and not so jammed it won't actually load.
const fillHealth = computed(() => {
  const p = fillPercent.value;
  if (p < 60) return 'low';
  if (p <= 85) return 'good';
  return 'high';
});

const fillHealthLabel = computed(
  () => ({ low: 'Room to spare', good: 'Healthy fit', high: 'Packed tight' })[fillHealth.value],
);

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

// Packing is an exhaustive, time-budgeted search (up to ~15s on big loads), so it runs in a Web
// Worker off the main thread — the UI stays responsive and shows a live progress bar + ETA. The
// result lands in `packedTrucks` asynchronously; until the first result, dependent computeds fall
// back to the cheap `recommendedPlan` estimate, so the screen is never blank.
const PACKING_BUDGET_MS = 5000;
const packedTrucks = ref([]);
const isPacking = ref(false);
const packingProgress = ref(0); // 0..1
const packingEtaMs = ref(0);

// Playful one-liners cycled on the full-screen "reviewing your truck fit" loader.
const packingMessages = [
  'Playing Tetris with your furniture…',
  'Convincing the fridge it is stackable…',
  'Making the mattress pull its weight…',
  'Trying 10,000 ways to fit your stuff…',
  'Politely negotiating with bulky furniture…',
  'Checking whether the chair can go there… no, there… no, there…',
  'Making awkward items slightly less awkward…',
  'Optimising every cubic centimetre…',
];
const packingMessageIndex = ref(0);
let packingMessageTimer = null;

// Cycle the loader one-liners slowly while a full-page pack is in flight; reset when it ends.
watch(isPacking, (packing) => {
  if (packingMessageTimer) {
    clearInterval(packingMessageTimer);
    packingMessageTimer = null;
  }
  if (packing) {
    packingMessageIndex.value = Math.floor(Math.random() * packingMessages.length);
    packingMessageTimer = setInterval(() => {
      packingMessageIndex.value = (packingMessageIndex.value + 1) % packingMessages.length;
    }, 2600);
  }
});

const packingMessage = computed(() => packingMessages[packingMessageIndex.value]);

// Shape a raw packer truck into the view model the scene/breakdown expect (packingGrid + per-item
// batch/zIndex). Mirrors the old computed's mapping.
const mapPackedTrucks = (trucks) =>
  trucks.map((truck) => ({
    ...truck,
    packingGrid: { columns: truck.cellsX, rows: truck.cellsY, maxHeight: truck.cellsZ },
    items: truck.items.map((item) => ({
      ...item,
      batch: Math.floor(item.sequence / 4),
      zIndex: 20 + item.z * truck.cellsX * truck.cellsY + item.y * truck.cellsX + item.x,
    })),
  }));

let packingWorker = null;
let packingRunId = 0;
let packingDebounce = null;

const disposeWorker = () => {
  if (packingWorker) {
    packingWorker.terminate();
    packingWorker = null;
  }
};

const runPacking = () => {
  const items = packedUnits.value;
  const runId = (packingRunId += 1);

  if (!items.length) {
    disposeWorker();
    packedTrucks.value = [];
    isPacking.value = false;
    packingProgress.value = 0;
    return;
  }

  isPacking.value = true;
  packingProgress.value = 0;
  packingEtaMs.value = 0;

  // Terminate any in-flight run and start a fresh worker so a long search is cleanly cancelled when
  // the inventory changes.
  disposeWorker();
  try {
    packingWorker = new Worker(new URL('./utils/packing.worker.js', import.meta.url), { type: 'module' });
  } catch (err) {
    // Fallback: no worker available — pack synchronously (UI will block briefly).
    const { trucks } = planAndPack(items, { truckSizes: truckSizesWithCells.value, budgetMs: 2000 });
    packedTrucks.value = mapPackedTrucks(trucks);
    isPacking.value = false;
    packingProgress.value = 1;
    return;
  }

  packingWorker.onmessage = (event) => {
    const msg = event.data || {};
    if (msg.runId !== packingRunId) return; // stale run — ignore
    if (msg.type === 'progress') {
      packingProgress.value = msg.fraction;
      packingEtaMs.value = msg.etaMs;
    } else if (msg.type === 'done') {
      packedTrucks.value = mapPackedTrucks(msg.trucks);
      packingProgress.value = 1;
      isPacking.value = false;
      disposeWorker();
    } else if (msg.type === 'error') {
      console.error('Packing worker error:', msg.message);
      isPacking.value = false;
      disposeWorker();
    }
  };

  packingWorker.postMessage({
    runId,
    items: JSON.parse(JSON.stringify(items)), // ensure structured-clone-safe (drop any reactivity)
    truckSizes: JSON.parse(JSON.stringify(truckSizesWithCells.value)),
    budgetMs: PACKING_BUDGET_MS,
  });
};

// Re-pack (debounced) whenever the inventory or truck catalog changes.
watch(
  [packedUnits, truckSizesWithCells],
  () => {
    if (packingDebounce) clearTimeout(packingDebounce);
    packingDebounce = setTimeout(runPacking, 150);
  },
  { immediate: true, deep: false },
);

onBeforeUnmount(() => {
  if (packingDebounce) clearTimeout(packingDebounce);
  if (packingMessageTimer) clearInterval(packingMessageTimer);
  disposeWorker();
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

// Truck size summary for the quote summary row (e.g. "Small + Large").
const quoteTruckList = computed(() => {
  const source = packedTrucks.value.length ? packedTrucks.value : recommendedPlan.value;
  if (!source.length) return [];
  const counts = new Map();
  for (const truck of source) {
    counts.set(truck.name, (counts.get(truck.name) || 0) + (truck.count || 1));
  }
  return [...counts.entries()].map(([name, count]) => (count > 1 ? `${count} x ${name}` : name));
});

const quoteTruckNames = computed(() => quoteTruckList.value.join(' + ') || 'TBC');

const quoteTruckLabel = computed(() => (quoteTruckList.value.length > 1 ? 'Trucks' : 'Truck'));

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
      // A studio is a single fixed unit, so its defaults are taken as-is. Multi-room homes
      // fall back to a suggested quantity for rooms the customer hasn't counted, then scale
      // each item by how many of that room they actually have.
      if (isStudioSelected.value) {
        quantities[item.id] = Math.max(0, defaults[item.id] || 0);
        return;
      }
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
    activeRoomId.value = includedRooms.value[0]?.id || 'bedroom';
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

// Continue from the inventory-choice page using the currently selected option.
const continueFromInventoryChoice = () => {
  if (inventoryChoice.value === 'custom') {
    customiseInventory();
  } else {
    useQuickEstimate();
  }
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

// Short "W × D × H cm" label from the catalog dimensions for an item.
const dimsLabel = (item) => {
  const d = dimsForAsset(item.asset);
  return `${Math.round(d.widthCm)} × ${Math.round(d.depthCm)} × ${Math.round(d.heightCm)} cm`;
};

// Catalog items the customer pulled into a room via the search/suggestion dropdown, keyed by
// room id. These render alongside the room's native items so an added item shows up where it
// was added, not just in its original room.
const addedRoomItems = reactive({});

// Ids already present in a room's picker (its native catalog items plus anything added here).
const roomItemIds = (roomId) => {
  const room = rooms.find((r) => r.id === roomId);
  const ids = new Set((room?.items || []).map((item) => item.id));
  for (const item of addedRoomItems[roomId] || []) ids.add(item.id);
  return ids;
};

// The native catalog items for a room plus the ones added through search, deduped.
const roomPickerItems = (roomId) => {
  const room = rooms.find((r) => r.id === roomId);
  const native = (room?.items || []).map((item) => ({ ...item, room: room.name }));
  return [...native, ...(addedRoomItems[roomId] || [])];
};

// Add an item to the active room from the search dropdown: bump its quantity and, if it isn't
// already in this room's picker, surface it there so the customer sees what they added. Adding
// closes the dropdown and clears the field so focus returns to the room's furniture.
const addItemHere = (item) => {
  const roomId = activeRoom.value?.id;
  if (!roomId) return;
  changeQuantity(item.id, 1);
  if (!roomItemIds(roomId).has(item.id)) {
    (addedRoomItems[roomId] ||= []).push({ ...item });
  }
  if (blurTimer) clearTimeout(blurTimer);
  searchFocused.value = false;
  itemSearch.value = '';
  searchInputEl.value?.blur();
};

// On focus (before any typing) suggest a handful of items the active room doesn't already
// list, so customers discover furniture from other rooms without leaving the page. Boxes are
// skipped since every room already offers them.
const searchSuggestions = computed(() => {
  const presentIds = roomItemIds(activeRoom.value?.id);
  const seen = new Set();
  const results = [];
  for (const room of rooms) {
    if (room.id === activeRoom.value?.id) continue;
    for (const item of room.items) {
      if (modelAssetFor(item.asset) === 'cardboardBoxClosed') continue;
      if (presentIds.has(item.id) || seen.has(item.name)) continue;
      // Skip anything already on the quote so suggestions only surface new items.
      if (quantities[item.id] > 0) continue;
      seen.add(item.name);
      results.push({ ...item, room: room.name });
    }
  }
  // No hard cap — the dropdown is scrollable and shows ~5 rows at a time.
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

// Step values: 0 Home type · 1 Home details · 2 Inventory choice · 3 Furniture · 4 Review · 5 Extras · 6 Quote.
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

const recommendedMoverCount = computed(() => {
  const houseId = selectedHouseType.value;
  const limit = crewLimitByHouse[houseId] || 2;
  const normalDefaults = householdDefaultsByHouse[houseId];
  if (!normalDefaults) return limit;
  const sumRooms = (rooms) =>
    rooms.bedrooms + rooms.bathrooms + rooms.living + rooms.dining + rooms.office + rooms.garage;
  // More rooms than is normal for this home type can add one extra mover.
  const extraRooms = sumRooms(householdDetails) > sumRooms(normalDefaults) ? 1 : 0;
  return limit + extraRooms;
});

// Add-on services offered after the truck review, before the final quote form.
// Things that set us apart — storage isn't on the list since we don't offer it.
// No prices are shown: the move cost varies too much by access, stairs, distance,
// weather and item weight, so the team confirms it after reviewing the request.
const extraDefs = [
  {
    id: 'tipRun',
    name: 'Tip run',
    icon: 'truck',
    blurb: 'We take unwanted furniture, e-waste and rubbish straight to the tip after we load.',
  },
  {
    id: 'pressureCleaning',
    name: 'Pressure cleaning',
    icon: 'bolt',
    blurb: 'Driveway, paths and patio blasted clean, perfect before handing back the keys.',
  },
  {
    id: 'houseCleaning',
    name: 'End-of-lease clean',
    icon: 'laundry',
    blurb: 'Full bond-back clean by our trusted crew so you walk away with your deposit.',
  },
  {
    id: 'packingService',
    name: 'Packing service',
    icon: 'box',
    blurb: "We pack every room into boxes the day before, so you don't lift a thing.",
    recommended: true,
  },
  {
    id: 'unpackingService',
    name: 'Unpacking service',
    icon: 'boxPlus',
    blurb: 'We unpack and lay out essentials in the new home so you can settle in tonight.',
  },
  {
    id: 'furnitureAssembly',
    name: 'Furniture assembly',
    icon: 'sliders',
    blurb: 'Beds, wardrobes and flat-pack disassembled and put back together at the new place.',
  },
  {
    id: 'specialtyMove',
    name: 'Piano / pool table move',
    icon: 'cube',
    blurb: 'Specialist crew and equipment for pianos, pool tables, safes and oversized art.',
  },
  {
    id: 'packingMaterials',
    name: 'Boxes & packing materials',
    icon: 'cube',
    blurb: 'Sturdy boxes, butcher paper, bubble wrap and tape delivered ahead of moving day.',
  },
];

const extras = computed(() => extraDefs);

const selectedExtras = reactive({});
const toggleExtra = (id) => {
  selectedExtras[id] = !selectedExtras[id];
};
const chosenExtras = computed(() => extras.value.filter((extra) => selectedExtras[extra.id]));

// Human-readable home size for the quote summary (e.g. "2-bedroom apartment").
// Studios get their own short label since they have no bedroom count.
const homeSizeLabel = computed(() => {
  const house = selectedHouse.value;
  if (!house) return '-';
  if (isStudioSelected.value) return 'Studio';
  const bedrooms = householdDetails.bedrooms || 0;
  return `${bedrooms}-bedroom ${house.name.toLowerCase()}`;
});

const trimQuoteForm = () =>
  Object.fromEntries(Object.entries(quoteForm).map(([key, value]) => [key, String(value || '').trim()]));

const buildQuoteSubmissionPayload = () => {
  const customer = trimQuoteForm();
  return {
    source: 'super-move-quote-builder',
    type: WIX_QUOTE_MESSAGE_TYPE,
    submittedAt: new Date().toISOString(),
    customer,
    move: {
      homeSize: homeSizeLabel.value,
      houseType: selectedHouse.value?.name || null,
      householdDetails: { ...householdDetails },
      totalItems: totalItems.value,
      totalVolumeM3: Number(totalVolume.value.toFixed(2)),
      recommendedTruck: recommendationCardText.value,
      truckLoadCount: truckLoadCount.value,
      recommendedMoverCount: recommendedMoverCount.value,
      estimatedMoveTime: estimatedMoveTime.value,
    },
    extras: chosenExtras.value.map((extra) => ({
      id: extra.id,
      name: extra.name,
    })),
    inventory: inventory.value.map((item) => ({
      id: item.id,
      name: item.name,
      room: item.room,
      quantity: item.quantity,
      volumeM3: Number((item.volume || 0).toFixed(3)),
      custom: Boolean(item.custom),
      dimensionsCm: item.custom
        ? { width: item.widthCm, depth: item.depthCm, height: item.heightCm }
        : dimsForAsset(item.asset),
    })),
  };
};

const sendQuoteToWix = (payload) => {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: WIX_QUOTE_MESSAGE_TYPE, payload }, '*');
  }
  window.dispatchEvent(new CustomEvent(WIX_QUOTE_MESSAGE_TYPE, { detail: payload }));
};

const submitQuoteRequest = (event) => {
  const form = event?.currentTarget;
  Object.assign(quoteForm, trimQuoteForm());
  if (form && !form.reportValidity()) return;
  if (!quoteFormIsComplete.value) return;

  const payload = buildQuoteSubmissionPayload();
  sendQuoteToWix(payload);
  quoteSubmitted.value = true;
};

const resetQuoteForm = () => {
  Object.assign(quoteForm, quoteFormDefaults);
  quoteSubmitted.value = false;
};

const extrasGridEl = ref(null);
const scrollToExtras = () => {
  extrasGridEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

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
  Object.keys(selectedExtras).forEach((key) => {
    selectedExtras[key] = false;
  });
  resetQuoteForm();
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
          <strong>{{ estimatedVolumeRange }}</strong>
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
          <button
            class="inventory-choice-card recommended"
            type="button"
            :class="{ selected: inventoryChoice === 'quick' }"
            :aria-pressed="inventoryChoice === 'quick'"
            @click="inventoryChoice = 'quick'"
          >
            <span class="choice-flag">Fastest</span>
            <span class="home-type-badge"><AppIcon name="bolt" :size="26" /></span>
            <span class="choice-name">Quick estimate</span>
            <p class="choice-blurb">We'll use the average inventory for a {{ selectedHouse?.name || 'home' }} this size. Best if selecting every item feels like too much.</p>
            <ul class="choice-points">
              <li><AppIcon name="check" :size="15" /> Pre-filled with typical furniture</li>
              <li><AppIcon name="check" :size="15" /> Skip straight to your truck &amp; quote</li>
              <li><AppIcon name="check" :size="15" /> {{ estimatedVolumeRange }} estimated to start</li>
              <li><AppIcon name="check" :size="15" /> Ready in under a minute</li>
              <li><AppIcon name="check" :size="15" /> Tweak the details later if you need to</li>
            </ul>
          </button>

          <button
            class="inventory-choice-card"
            type="button"
            :class="{ selected: inventoryChoice === 'custom' }"
            :aria-pressed="inventoryChoice === 'custom'"
            @click="inventoryChoice = 'custom'"
          >
            <span class="home-type-badge"><AppIcon name="sliders" :size="26" /></span>
            <span class="choice-name">Customise furniture</span>
            <p class="choice-blurb">Go room by room and adjust every item for the most accurate quote.</p>
            <ul class="choice-points">
              <li><AppIcon name="check" :size="15" /> Add or remove items per room</li>
              <li><AppIcon name="check" :size="15" /> Add your own custom items</li>
              <li><AppIcon name="check" :size="15" /> Most accurate estimate</li>
              <li><AppIcon name="check" :size="15" /> Account for bulky or fragile pieces</li>
              <li><AppIcon name="check" :size="15" /> Avoid surprises on moving day</li>
            </ul>
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
          <strong>{{ estimatedVolumeRange }}</strong>
          <p>Typical for a {{ selectedHouse?.name || 'home' }} of this size, but you can still adjust it.</p>
        </div>

        <button class="primary-button full-width" type="button" @click="continueFromInventoryChoice">
          Continue
          <AppIcon name="arrowRight" :size="18" />
        </button>
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
            <input
              ref="searchInputEl"
              v-model="itemSearch"
              type="search"
              placeholder="Search for any item across all rooms…"
              aria-label="Search items"
              @focus="onSearchFocus"
              @blur="onSearchBlur"
            />
            <button v-if="itemSearch" type="button" class="item-search-clear" aria-label="Clear search" @click="itemSearch = ''">×</button>

            <div
              v-if="searchFocused && (searchQuery ? true : searchSuggestions.length)"
              class="search-suggestions"
            >
              <template v-if="searchQuery">
                <p class="search-suggestions-title">Search results</p>
                <button
                  v-for="item in searchResults"
                  :key="item.id"
                  type="button"
                  class="search-suggestion"
                  @mousedown.prevent
                  @click="addItemHere(item)"
                >
                  <img :src="imageFor(item.asset)" :alt="item.name" />
                  <span class="search-suggestion-text">
                    <strong>{{ item.name }}</strong>
                    <small>{{ dimsLabel(item) }} · {{ item.room }}</small>
                  </span>
                  <span v-if="quantities[item.id]" class="search-suggestion-count">{{ quantities[item.id] }}</span>
                  <span class="search-suggestion-add"><AppIcon name="boxPlus" :size="16" /></span>
                </button>
                <p v-if="!searchResults.length" class="search-empty">No items match “{{ searchQuery }}”.</p>
                <div class="cant-find">
                  <span>Can't find an item?</span>
                  <button type="button" class="ghost-button" @mousedown.prevent @click="goToCustomItem">
                    <AppIcon name="boxPlus" :size="16" /> Add a custom item
                  </button>
                </div>
              </template>
              <template v-else>
                <p class="search-suggestions-title">Suggested items</p>
                <button
                  v-for="item in searchSuggestions"
                  :key="item.id"
                  type="button"
                  class="search-suggestion"
                  @mousedown.prevent
                  @click="addItemHere(item)"
                >
                  <img :src="imageFor(item.asset)" :alt="item.name" />
                  <span class="search-suggestion-text">
                    <strong>{{ item.name }}</strong>
                    <small>{{ dimsLabel(item) }} · {{ item.room }}</small>
                  </span>
                  <span v-if="quantities[item.id]" class="search-suggestion-count">{{ quantities[item.id] }}</span>
                  <span class="search-suggestion-add"><AppIcon name="boxPlus" :size="16" /></span>
                </button>
              </template>
            </div>
          </div>

          <div class="furniture-grid">
            <article v-for="item in roomPickerItems(activeRoom.id)" :key="item.id" class="furniture-picker">
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
        <button class="ghost-button full-width accent-ghost" type="button" @click="step = 2"><AppIcon name="swap" :size="16" /> Back</button>
      </aside>
    </section>

    <section v-else-if="step === 4 && isPacking" class="packing-page">
      <div class="packing-loader">
        <div class="packing-orbit">
          <span class="packing-orbit-ring"></span>
          <span class="packing-orbit-dot"></span>
          <img class="packing-logo" :src="logoUrl" alt="Super Move" />
        </div>
        <p class="packing-line" :key="packingMessageIndex">{{ packingMessage }}</p>
      </div>
    </section>

    <section v-else-if="step === 4" class="review-page">
      <div class="review-heading">
        <div>
          <h1>Review your truck fit</h1>
          <p>Here's how your items fit in the recommended truck.</p>
        </div>
      </div>

      <div class="review-grid">
        <div class="review-main">
          <div class="truck-fit-stage" :class="{ empty: !inventory.length }">
            <TruckFitScene v-if="packedTrucks.length" class="truck-fit-canvas" :trucks="packedTrucks" />
            <p v-else class="empty-state">Add items with the plus buttons.</p>
            <div class="scene-help">Click and drag to rotate</div>
          </div>

          <div class="review-breakdown" :class="{ expanded: breakdownExpanded }">
            <button
              type="button"
              class="review-breakdown-head"
              :aria-expanded="breakdownExpanded"
              @click="breakdownExpanded = !breakdownExpanded"
            >
              <span class="soft-icon small"><AppIcon name="house" :size="18" /></span>
              <div>
                <strong>{{ selectedHouse?.name || 'Home' }}</strong>
                <span>{{ homeDetailLine || 'Home details selected' }}</span>
              </div>
              <AppIcon class="breakdown-chevron" name="chevronDown" :size="20" />
            </button>
            <div v-if="breakdownExpanded">
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
        </div>

        <aside class="summary-card recommendation-panel" aria-label="Truck recommendation">
          <div class="recommendation-header">
            <span class="rec-header-icon"><AppIcon name="star" :size="22" /></span>
            <div class="rec-header-text">
              <h2>Recommended truck</h2>
              <p>Best match for your move</p>
            </div>
          </div>

          <div class="recommended-truck-card">
            <div class="truck-card-title">
              <span class="soft-icon truck-icon"><img :src="truckUrl" alt="Truck" class="truck-photo" /></span>
              <div class="truck-card-info">
                <span class="best-match-pill"><AppIcon name="check" :size="14" /> Best match</span>
                <strong>{{ recommendationCardText }}</strong>
                <span class="truck-capacity">{{ primaryTruck.capacity }} m³ capacity</span>
                <span class="truck-dims">{{ primaryTruck.cargoLength }}m (L) x {{ primaryTruck.cargoWidth }}m (W) x {{ primaryTruck.cargoHeight }}m (H)</span>
              </div>
            </div>

            <div class="usage-box">
              <div class="truck-metrics">
                <div>
                  <strong>{{ fillPercent }}%</strong>
                  <span>Space used</span>
                </div>
                <span class="health-pill" :class="`health-${fillHealth}`">{{ fillHealthLabel }}</span>
              </div>
              <div class="usage-bar" :class="`usage-${fillHealth}`">
                <span :style="{ width: `${fillPercent}%` }"></span>
              </div>
              <div class="usage-ticks" aria-hidden="true"></div>
              <div class="usage-scale">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>

            <div class="mini-facts">
              <div class="mini-fact">
                <span class="mini-fact-icon"><AppIcon name="box" :size="20" /></span>
                <span>{{ totalItems }} items<br /><small>{{ truckLoadCount }} truck load{{ truckLoadCount === 1 ? '' : 's' }}</small></span>
              </div>
              <div class="mini-fact">
                <span class="mini-fact-icon"><AppIcon name="people" :size="20" /></span>
                <span>{{ recommendedMoverCount }} movers<br /><small>Recommended</small></span>
              </div>
            </div>
          </div>

          <button class="primary-button full-width quote-button" type="button" :disabled="!inventory.length" @click="step = 5">
            Get my quote
            <AppIcon name="arrowRight" :size="18" />
          </button>
          <button class="ghost-button full-width accent-ghost" type="button" @click="step = 3"><AppIcon name="edit" :size="16" /> Adjust items</button>

          <p class="privacy-note"><AppIcon name="lock" :size="14" /> Your details are secure and private</p>
        </aside>
      </div>
    </section>

    <section v-else-if="step === 5" class="page-grid extras-page">
      <div class="page-main">
        <div class="page-title">
          <h1>Add extras to your move</h1>
          <p>Optional services our team can bundle in. Pick what you need, or skip and continue to your quote.</p>
        </div>

        <div class="extras-info-banner">
          <span class="extras-info-icon"><AppIcon name="info" :size="16" /></span>
          <span>Select any extras that apply. You can review them in your quote summary.</span>
        </div>

        <div ref="extrasGridEl" class="extras-grid">
          <button
            v-for="extra in extras"
            :key="extra.id"
            type="button"
            class="extra-card"
            :class="{ selected: selectedExtras[extra.id] }"
            @click="toggleExtra(extra.id)"
          >
            <span class="extra-icon"><AppIcon :name="extra.icon" :size="22" /></span>
            <div class="extra-text">
              <strong class="extra-name">{{ extra.name }}</strong>
              <p class="extra-blurb">{{ extra.blurb }}</p>
            </div>
            <span class="extra-check" :class="{ checked: selectedExtras[extra.id] }" aria-hidden="true">
              <AppIcon v-if="selectedExtras[extra.id]" name="check" :size="14" />
            </span>
          </button>
        </div>
      </div>

      <aside class="summary-card extras-summary">
        <h2>Your quote summary</h2>

        <div class="qs-details">
          <strong class="qs-details-title">Move details</strong>
          <div class="qs-rows">
            <div class="qs-row">
              <span class="qs-row-label"><AppIcon name="house" :size="15" /> Home size</span>
              <strong>{{ homeSizeLabel }}</strong>
            </div>
            <div class="qs-row">
              <span class="qs-row-label"><AppIcon name="cube" :size="15" /> Volume</span>
              <strong>~{{ Math.round(totalVolume) || Math.round(estimatedRoomVolume) }} m³</strong>
            </div>
            <div class="qs-row">
              <span class="qs-row-label"><AppIcon name="truck" :size="15" /> {{ quoteTruckLabel }}</span>
              <strong>{{ quoteTruckNames }}</strong>
            </div>
            <div class="qs-row">
              <span class="qs-row-label"><AppIcon name="people" :size="15" /> Crew</span>
              <strong>{{ recommendedMoverCount }} movers</strong>
            </div>
          </div>
        </div>

        <div class="qs-breakdown">
          <div class="qs-breakdown-row">
            <span>Extras selected</span>
            <strong>{{ chosenExtras.length }}</strong>
          </div>
        </div>

        <button class="primary-button full-width" type="button" @click="step = 6">
          Continue to quote
          <AppIcon name="arrowRight" :size="18" />
        </button>
        <button class="ghost-button full-width accent-ghost" type="button" @click="step = 4">
          <AppIcon name="chevronLeft" :size="16" /> Back
        </button>
        <p class="privacy-note"><AppIcon name="lock" :size="14" /> Your details are secure and private</p>
      </aside>
    </section>

    <section v-else class="page-grid quote-page">
      <div class="page-main">
        <div class="page-title">
          <h1>Review &amp; request your quote</h1>
          <p>Send us your move details and a specialist will get back to you with a tailored quote.</p>
        </div>

        <div class="quote-includes move-summary-card">
          <h3><AppIcon name="cube" :size="18" /> Your move summary</h3>
          <div class="quote-fact-grid">
            <div><AppIcon name="box" :size="20" /><strong>{{ totalItems }} items</strong><span>To be moved</span></div>
            <div><AppIcon name="people" :size="20" /><strong>{{ recommendedMoverCount }} movers</strong><span>Recommended crew</span></div>
            <div><AppIcon name="truck" :size="20" /><strong>{{ primaryTruck?.name ? primaryTruck.name + ' truck' : '-' }}</strong><span>With driver</span></div>
            <div><AppIcon name="building" :size="20" /><strong>{{ homeSizeLabel }}</strong><span>Home size</span></div>
          </div>
        </div>

        <div class="quote-two-col">
          <div class="quote-includes">
            <h3><AppIcon name="shield" :size="18" /> What's included</h3>
            <ul>
              <li><AppIcon name="check" :size="16" /> {{ recommendationCardText }} with driver</li>
              <li><AppIcon name="check" :size="16" /> {{ recommendedMoverCount }} professional movers</li>
              <li><AppIcon name="check" :size="16" /> Loading, transport and unloading</li>
              <li><AppIcon name="check" :size="16" /> Basic furniture protection</li>
              <li><AppIcon name="check" :size="16" /> Public liability insurance</li>
            </ul>
          </div>

          <div class="quote-includes">
            <h3 class="quote-extras-head">
              <span><AppIcon name="gift" :size="18" /> Selected extras</span>
              <span v-if="chosenExtras.length" class="qs-count-pill">{{ chosenExtras.length }} item{{ chosenExtras.length === 1 ? '' : 's' }}</span>
            </h3>
            <div v-if="chosenExtras.length" class="qs-extras-list">
              <div v-for="extra in chosenExtras" :key="extra.id" class="qs-extra-row qs-extra-row-static">
                <span class="qs-extra-icon"><AppIcon :name="extra.icon" :size="15" /></span>
                <span class="qs-extra-name">{{ extra.name }}</span>
                <AppIcon name="check" :size="15" />
              </div>
            </div>
            <p v-else class="qs-empty">No extras selected.</p>
          </div>
        </div>

        <div class="quote-includes good-to-know">
          <div class="gtk-grid">
            <div class="gtk-item">
              <span class="gtk-icon gtk-icon-green"><AppIcon name="lock" :size="18" /></span>
              <div>
                <strong>No obligation</strong>
                <span>Sending your details is free and commits you to nothing.</span>
              </div>
            </div>
            <div class="gtk-item">
              <span class="gtk-icon gtk-icon-blue"><AppIcon name="shield" :size="18" /></span>
              <div>
                <strong>We'll confirm all the final details</strong>
                <span>Our team will confirm all the final details required to provide an accurate quote. This includes details such as parking, stairs, property access, and more.</span>
              </div>
            </div>
            <div class="gtk-item">
              <span class="gtk-icon gtk-icon-orange"><AppIcon name="edit" :size="18" /></span>
              <div>
                <strong>You can still edit your inventory</strong>
                <span>Need to make a change? You can update your items anytime.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside class="summary-card quote-summary">
        <h2>Request your quote</h2>
        <p class="quote-summary-sub">Send your details and a move specialist will be in touch with your tailored quote.</p>

        <form class="quote-form" @submit.prevent="submitQuoteRequest">
          <label>Full name<input v-model="quoteForm.fullName" type="text" placeholder="John Smith" autocomplete="name" required /></label>
          <label>Email<input v-model="quoteForm.email" type="email" placeholder="you@email.com" autocomplete="email" required /></label>
          <label>Phone<input v-model="quoteForm.phone" type="tel" placeholder="0400 000 000" autocomplete="tel" required /></label>
          <label>Pickup address<input v-model="quoteForm.pickupAddress" type="text" placeholder="Load from (street, suburb)" autocomplete="street-address" required /></label>
          <label>Drop-off address<input v-model="quoteForm.dropoffAddress" type="text" placeholder="Unload to (street, suburb)" required /></label>
          <label>Preferred move date<input v-model="quoteForm.preferredMoveDate" type="text" placeholder="e.g. Friday 26 June, flexible" required /></label>
          <label>Any additional information<textarea v-model="quoteForm.notes" rows="4" placeholder="Access details, parking, stairs, fragile items, time restrictions..." required></textarea></label>
          <button class="primary-button full-width" type="submit">
            Request final quote
            <AppIcon name="arrowRight" :size="18" />
          </button>
        </form>

        <button class="ghost-button full-width accent-ghost" type="button" @click="step = 5"><AppIcon name="edit" :size="16" /> Back to extras</button>
        <p class="privacy-note"><AppIcon name="lock" :size="14" /> Your details are secure and private</p>
      </aside>
    </section>

    <div v-if="quoteSubmitted" class="quote-modal-backdrop" role="presentation" @click.self="quoteSubmitted = false">
      <div class="quote-modal" role="dialog" aria-modal="true" aria-labelledby="quote-modal-title">
        <span class="quote-modal-icon"><AppIcon name="check" :size="24" /></span>
        <h2 id="quote-modal-title">Quote request submitted</h2>
        <p>Thank you for sending through your move details. Our team will review your request and contact you shortly to confirm the final quote.</p>
        <button class="primary-button full-width" type="button" @click="quoteSubmitted = false">Close</button>
      </div>
    </div>
  </main>
</template>
