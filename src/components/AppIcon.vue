<script setup>
import { computed } from 'vue';

// A single, lightweight line-icon set used across the quote builder. Each entry is the
// inner markup of a 24x24 stroke icon (fill: none, stroke: currentColor) so icons inherit
// the surrounding text colour. Add new glyphs here rather than scattering inline SVGs.
const icons = {
  // Room / home-detail glyphs
  bed: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
  bath: '<path d="M3 12h18v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-3Z"/><path d="M6 12V6.5A2.5 2.5 0 0 1 8.5 4a2.5 2.5 0 0 1 2.5 2.5"/><path d="M6.5 18 5.5 21"/><path d="M17.5 18l1 3"/>',
  sofa: '<path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3"/><path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H6v-2a2 2 0 0 0-4 0Z"/><path d="M5 18v2"/><path d="M19 18v2"/>',
  dining: '<path d="M3 2v7a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V2"/><path d="M6 11v11"/><path d="M19 2a4 4 0 0 0-4 4v6h4Z"/><path d="M19 12v10"/>',
  desk: '<rect x="3" y="4" width="18" height="11" rx="1"/><path d="M2 19h20"/><path d="M8 19v-2"/><path d="M16 19v-2"/><path d="M7 8h6"/>',
  garage: '<path d="M3 21V9.5l9-5 9 5V21"/><path d="M2 21h20"/><path d="M6 21v-7h12v7"/><path d="M6 17h12"/>',
  kitchen: '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M5 10h14"/><path d="M9 6v.01"/><path d="M9 14v.01"/>',
  laundry: '<rect width="18" height="20" x="3" y="2" rx="2"/><path d="M6 6h.01"/><path d="M10 6h.01"/><circle cx="12" cy="13" r="5"/><path d="M12 16a3 3 0 0 0 0-6"/>',
  // Home-type glyphs
  studio: '<path d="M5 21V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v15"/><path d="M3 21h18"/><path d="M10 21v-5h4v5"/><rect x="10" y="8" width="4" height="4" rx="0.5"/>',
  building: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/><path d="M9 6h.01M15 6h.01M12 6h.01M9 10h.01M12 10h.01M15 10h.01M9 14h.01M12 14h.01M15 14h.01"/>',
  townhouse: '<path d="M3 21V10l4.5-4L12 10"/><path d="M12 21V10l4.5-4L21 10v11"/><path d="M2 21h20"/><path d="M6 14h2"/><path d="M16 14h2"/><path d="M6 21v-3h2v3"/><path d="M16 21v-3h2v3"/>',
  house: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-7h6v7"/>',
  villa: '<path d="M2 21V12l5-3 5 3"/><path d="M12 21V14l5-3 5 3v7"/><path d="M2 21h20"/><path d="M5 21v-4h3v4"/><path d="M16 16h2"/>',
  duplex: '<path d="M3 21V8l9-5 9 5v13"/><path d="M12 3.5v17.5"/><path d="M2 21h20"/><path d="M6 21v-5h3v5"/><path d="M15 21v-5h3v5"/>',
  // Stat / utility glyphs
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  boxPlus: '<path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/><path d="M16 19h6"/><path d="M19 16v6"/>',
  cube: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  people: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  truck: '<path d="M2 6.5A1.5 1.5 0 0 1 3.5 5H13a1 1 0 0 1 1 1v9.5H2Z"/><path d="M14 8.5h3.6a1 1 0 0 1 .8.4l2.4 3.1a1 1 0 0 1 .2.6v3.4a1 1 0 0 1-1 1H14Z"/><circle cx="6.5" cy="17.5" r="2"/><circle cx="17.5" cy="17.5" r="2"/>',
  ruler: '<path d="M3 8l5-5 13 13-5 5z"/><path d="M8 8l1.5 1.5"/><path d="M11 5l1.5 1.5"/><path d="M14 8l1.5 1.5"/><path d="M5 11l1.5 1.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.5 2.5 0 1 1 3.6 2.3c-.8.5-1.1 1-1.1 1.8v.4"/><path d="M12 17h.01"/>',
  refresh: '<path d="M3 12a9 9 0 1 0 2.6-6.3L3 8"/><path d="M3 3v5h5"/>',
  lock: '<rect width="16" height="11" x="4" y="11" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  swap: '<path d="m17 3 4 4-4 4"/><path d="M21 7H9"/><path d="m7 21-4-4 4-4"/><path d="M3 17h12"/>',
  shield: '<path d="M12 3 5 6v5c0 4.4 3 8.3 7 10 4-1.7 7-5.6 7-10V6Z"/><path d="m9 12 2 2 4-4"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  sliders: '<path d="M4 6h10"/><path d="M18 6h2"/><path d="M4 12h4"/><path d="M12 12h8"/><path d="M4 18h12"/><path d="M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
};

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 24 },
});

const inner = computed(() => icons[props.name] || '');
</script>

<template>
  <svg
    class="app-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="inner"
  />
</template>

<style scoped>
.app-icon {
  display: block;
  flex: 0 0 auto;
}
</style>
