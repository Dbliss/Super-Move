// Single source of truth for the furniture catalog the customer can add to a quote.
// Consumed by the quote builder (src/App.vue) and the bounding-box editor
// (src/dimensions/DimensionsApp.vue) so new furniture only has to be added once.
//
// Each item: { id (unique), name (label), asset (Kenny GLTF filename), volume (m³ fallback) }.
// Note that several items intentionally share an `asset` (e.g. packed boxes), and dimensions
// are keyed by `asset`, so editing one box size updates every item that reuses that model.

// Packing boxes are offered in every room as a fixed set of sizes. Each size has its own
// `asset` so it carries its own (unique) dimensions in objectDimensions.json, while all of
// them render with the shared cardboard-box model via modelAssetFor() below. The Wardrobe
// box is bedroom-only. Per-room item ids keep each room's box counts independent.
const boxSizes = [
  { suffix: 'Small', name: 'Small box', asset: 'boxSmall', volume: 0.036 },
  { suffix: 'Medium', name: 'Medium box', asset: 'boxMedium', volume: 0.081 },
  { suffix: 'Large', name: 'Large box', asset: 'boxLarge', volume: 0.162 },
];
const wardrobeBox = { suffix: 'Wardrobe', name: 'Wardrobe box', asset: 'boxWardrobe', volume: 0.36 };

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const boxesForRoom = (roomId, { wardrobe = false } = {}) =>
  (wardrobe ? [...boxSizes, wardrobeBox] : boxSizes).map((b) => ({
    id: `box${b.suffix}${cap(roomId)}`,
    name: b.name,
    asset: b.asset,
    volume: b.volume,
  }));

// Box sizes all reuse a single physical model; map their asset to the real GLTF/side-image file.
const boxModelAssets = new Set([wardrobeBox, ...boxSizes].map((b) => b.asset));
export const modelAssetFor = (asset) => (boxModelAssets.has(asset) ? 'cardboardBoxClosed' : asset);

export const rooms = [
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
      ...boxesForRoom('bedroom', { wardrobe: true }),
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
      ...boxesForRoom('living'),
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
      ...boxesForRoom('dining'),
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
      ...boxesForRoom('kitchen'),
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
      ...boxesForRoom('office'),
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
      ...boxesForRoom('laundry'),
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
      ...boxesForRoom('bathroom'),
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
      ...boxesForRoom('garage'),
    ],
  },
];

// Distinct GLTF assets across all rooms, each tagged with the item label(s) that use it.
// Drives the bounding-box editor's item list.
export const uniqueAssets = (() => {
  const byAsset = new Map();
  for (const room of rooms) {
    for (const item of room.items) {
      const entry = byAsset.get(item.asset);
      if (entry) {
        entry.usedBy.push({ id: item.id, name: item.name, room: room.name });
      } else {
        byAsset.set(item.asset, {
          asset: item.asset,
          name: item.name,
          volume: item.volume,
          usedBy: [{ id: item.id, name: item.name, room: room.name }],
        });
      }
    }
  }
  return [...byAsset.values()];
})();
