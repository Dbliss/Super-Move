<script setup>
// Photo cards for each home type, shown on the Home type selection page.
// Keyed by the same ids as houseTypes in App.vue (studio, apartment, townhouse,
// house, villa, duplex). Each id maps to `images/<id>.png`; if an
// `images/<id>_interior.png` exists, the card cross-fades to it while `hovered`.
// The photo is absolutely positioned to fill the whole card (behind the text),
// so the building can render large and is clipped only by the card's edge.
const photos = import.meta.glob('../../images/*.png', { eager: true, import: 'default' });

// Index the imported asset URLs by file basename (without extension), e.g. "studio".
const byName = {};
for (const [path, url] of Object.entries(photos)) {
  const name = path.split('/').pop().replace(/\.png$/, '');
  byName[name] = url;
}

const props = defineProps({
  id: { type: String, required: true },
  // Driven by the card's hover state (previewedHouseType) in App.vue.
  hovered: { type: Boolean, default: false },
});

const exterior = byName[props.id];
const interior = byName[`${props.id}_interior`];
</script>

<template>
  <span class="home-photo" :class="{ 'show-interior': hovered && interior }">
    <img v-if="exterior" class="home-photo__img home-photo__exterior" :src="exterior" alt="" />
    <img v-if="interior" class="home-photo__img home-photo__interior" :src="interior" alt="" />
  </span>
</template>

<style scoped>
.home-photo {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
}

.home-photo__img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  transform: scale(0.95);
  transition: opacity 0.2s ease;
}

.home-photo__interior {
  opacity: 0;
}

.home-photo.show-interior .home-photo__interior {
  opacity: 1;
}

.home-photo.show-interior .home-photo__exterior {
  opacity: 0;
}
</style>
