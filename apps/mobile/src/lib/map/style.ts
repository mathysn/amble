import type {
  ExpressionSpecification,
  LayerSpecification,
  StyleSpecification,
} from '@maplibre/maplibre-gl-style-spec';
import { colors } from '../../theme';

/**
 * Amble's own MapLibre style, built in code on OpenFreeMap's free, keyless
 * OpenMapTiles vector tiles — so the map looks like the rest of the app (paper,
 * sage, ink) and doesn't depend on a third-party style's layer ids.
 *
 * - Tiles: never hard-code the versioned tile URL; the TileJSON at
 *   `tiles.openfreemap.org/planet` points at the current build.
 * - Glyphs: OpenFreeMap only serves "Noto Sans Regular|Bold|Italic", and each
 *   `text-font` must be a single-entry array (the whole stack is one request).
 * - Our own overlay sources (route, stops) are part of the style from the start,
 *   so the page never races `addLayer` against style load.
 */

export const OFM_TILEJSON = 'https://tiles.openfreemap.org/planet';
export const OFM_GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

/** Layer ids the map page toggles or feeds at runtime. */
export const MAP_LAYERS = {
  buildingFlat: 'building',
  building3d: 'building-3d',
} as const;

export const MAP_SOURCES = {
  base: 'openmaptiles',
  routeWalked: 'route-walked',
  routeRemaining: 'route-remaining',
  stops: 'stops',
} as const;

/** The route's direction chevron — drawn by the map page at runtime (see html.ts). */
export const ROUTE_ARROW_IMAGE = 'route-arrow';

// A few map-only tints derived from the palette (kept here, not in theme.ts,
// because nothing outside the map uses them).
const TINT = {
  residential: '#EFE9DB',
  park: '#DCE4D2',
  wood: '#D2DCC5',
  water: '#D5DDD8',
  waterLine: '#B9C7BE',
  casing: 'rgba(46,43,38,0.14)',
  casingMajor: 'rgba(46,43,38,0.22)',
  path: 'rgba(46,43,38,0.32)',
  rail: 'rgba(46,43,38,0.28)',
  label: 'rgba(46,43,38,0.78)',
  labelMuted: 'rgba(46,43,38,0.5)',
} as const;

const REGULAR = ['Noto Sans Regular'];
const BOLD = ['Noto Sans Bold'];
const ITALIC = ['Noto Sans Italic'];

const NAME: ExpressionSpecification = ['coalesce', ['get', 'name:latin'], ['get', 'name']];
const NOT_TUNNEL: ExpressionSpecification = ['!=', ['get', 'brunnel'], 'tunnel'];

/** Width that grows with zoom the way road widths do on real maps. */
function zoomWidth(stops: [number, number][]): ExpressionSpecification {
  return ['interpolate', ['exponential', 1.5], ['zoom'], ...stops.flat()] as ExpressionSpecification;
}

function classIn(classes: string[]): ExpressionSpecification {
  return ['match', ['get', 'class'], classes, true, false];
}

const MINOR = ['minor', 'service', 'track'];
const MAJOR = ['primary', 'secondary', 'tertiary', 'trunk'];
const PATHS = ['path', 'pedestrian'];

const src = { source: MAP_SOURCES.base } as const;

const baseLayers: LayerSpecification[] = [
  { id: 'background', type: 'background', paint: { 'background-color': colors.paper } },

  // ── land ──────────────────────────────────────────────────────────────
  {
    id: 'landuse-residential',
    type: 'fill',
    ...src,
    'source-layer': 'landuse',
    filter: ['==', ['get', 'class'], 'residential'],
    paint: { 'fill-color': TINT.residential },
  },
  {
    id: 'landcover-grass',
    type: 'fill',
    ...src,
    'source-layer': 'landcover',
    filter: ['==', ['get', 'class'], 'grass'],
    paint: { 'fill-color': TINT.park },
  },
  { id: 'park', type: 'fill', ...src, 'source-layer': 'park', paint: { 'fill-color': TINT.park } },
  {
    id: 'landcover-wood',
    type: 'fill',
    ...src,
    'source-layer': 'landcover',
    filter: ['==', ['get', 'class'], 'wood'],
    paint: { 'fill-color': TINT.wood },
  },

  // ── water ─────────────────────────────────────────────────────────────
  {
    id: 'water',
    type: 'fill',
    ...src,
    'source-layer': 'water',
    filter: NOT_TUNNEL,
    paint: { 'fill-color': TINT.water },
  },
  {
    id: 'waterway',
    type: 'line',
    ...src,
    'source-layer': 'waterway',
    filter: ['all', NOT_TUNNEL, classIn(['river', 'canal', 'stream'])],
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': TINT.waterLine, 'line-width': zoomWidth([[11, 0.5], [18, 6]]) },
  },

  // ── buildings (flat; hidden while the 3D layer is on) ──────────────────
  {
    id: MAP_LAYERS.buildingFlat,
    type: 'fill',
    ...src,
    'source-layer': 'building',
    minzoom: 13,
    paint: {
      'fill-color': colors.sand,
      'fill-outline-color': 'rgba(46,43,38,0.12)',
    },
  },

  // ── roads: casings first, then fills, so junctions merge cleanly ───────
  {
    id: 'road-path',
    type: 'line',
    ...src,
    'source-layer': 'transportation',
    minzoom: 14,
    filter: ['all', NOT_TUNNEL, classIn(PATHS)],
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': TINT.path,
      'line-dasharray': [1.2, 1],
      'line-width': zoomWidth([[14, 1], [18, 2.4]]),
    },
  },
  {
    id: 'road-minor-casing',
    type: 'line',
    ...src,
    'source-layer': 'transportation',
    minzoom: 13,
    filter: ['all', NOT_TUNNEL, classIn(MINOR)],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': TINT.casing, 'line-width': zoomWidth([[13, 1.5], [18, 15]]) },
  },
  {
    id: 'road-major-casing',
    type: 'line',
    ...src,
    'source-layer': 'transportation',
    filter: ['all', NOT_TUNNEL, classIn(MAJOR)],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': TINT.casingMajor, 'line-width': zoomWidth([[10, 1], [18, 22]]) },
  },
  {
    id: 'road-motorway-casing',
    type: 'line',
    ...src,
    'source-layer': 'transportation',
    filter: ['all', NOT_TUNNEL, ['==', ['get', 'class'], 'motorway']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': TINT.casingMajor, 'line-width': zoomWidth([[8, 1], [18, 24]]) },
  },
  {
    id: 'road-minor',
    type: 'line',
    ...src,
    'source-layer': 'transportation',
    minzoom: 13,
    filter: ['all', NOT_TUNNEL, classIn(MINOR)],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': colors.paperRaised, 'line-width': zoomWidth([[13, 0.8], [18, 12]]) },
  },
  {
    id: 'road-major',
    type: 'line',
    ...src,
    'source-layer': 'transportation',
    filter: ['all', NOT_TUNNEL, classIn(MAJOR)],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': colors.paperRaised, 'line-width': zoomWidth([[10, 0.6], [18, 18]]) },
  },
  {
    id: 'road-motorway',
    type: 'line',
    ...src,
    'source-layer': 'transportation',
    filter: ['all', NOT_TUNNEL, ['==', ['get', 'class'], 'motorway']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': colors.sand, 'line-width': zoomWidth([[8, 0.6], [18, 20]]) },
  },
  {
    id: 'rail',
    type: 'line',
    ...src,
    'source-layer': 'transportation',
    filter: ['all', NOT_TUNNEL, classIn(['rail', 'transit'])],
    paint: { 'line-color': TINT.rail, 'line-dasharray': [3, 3], 'line-width': 1.2 },
  },

  // ── 3D buildings (toggled by the page; route/labels draw over them) ─────
  {
    id: MAP_LAYERS.building3d,
    type: 'fill-extrusion',
    ...src,
    'source-layer': 'building',
    minzoom: 15,
    filter: ['!=', ['get', 'hide_3d'], true],
    layout: { visibility: 'none' },
    paint: {
      'fill-extrusion-color': colors.sandDeep,
      'fill-extrusion-opacity': 0.7,
      'fill-extrusion-height': [
        'interpolate', ['linear'], ['zoom'],
        15, 0,
        16, ['coalesce', ['get', 'render_height'], 0],
      ],
      'fill-extrusion-base': [
        'interpolate', ['linear'], ['zoom'],
        15, 0,
        16, ['coalesce', ['get', 'render_min_height'], 0],
      ],
    },
  },
];

const routeLayers: LayerSpecification[] = [
  // The part already walked: a quiet dotted trail, like the rest of Amble's maps.
  {
    id: 'route-walked',
    type: 'line',
    source: MAP_SOURCES.routeWalked,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': colors.sageDark,
      'line-opacity': 0.55,
      'line-width': zoomWidth([[12, 2], [18, 5]]),
      'line-dasharray': [0.1, 1.8],
    },
  },
  // The way ahead: solid sage with a darker casing so it reads over any street.
  {
    id: 'route-remaining-casing',
    type: 'line',
    source: MAP_SOURCES.routeRemaining,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': colors.sageDark, 'line-width': zoomWidth([[12, 4], [18, 13]]) },
  },
  {
    id: 'route-remaining',
    type: 'line',
    source: MAP_SOURCES.routeRemaining,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': colors.sage, 'line-width': zoomWidth([[12, 2.5], [18, 9]]) },
  },
  // Chevrons along the way ahead, pointing the way round the loop. The style has
  // no sprite: the page runtime draws this one icon when MapLibre asks for it.
  {
    id: 'route-arrows',
    type: 'symbol',
    source: MAP_SOURCES.routeRemaining,
    // From 11 so a long route's preview (zoomed well out) still shows which way round it goes.
    minzoom: 11,
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': ['interpolate', ['linear'], ['zoom'], 11, 40, 18, 110],
      'icon-image': ROUTE_ARROW_IMAGE,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.5, 18, 1.1],
      'icon-rotation-alignment': 'map',
      'icon-pitch-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  },
];

const labelLayers: LayerSpecification[] = [
  {
    id: 'label-road',
    type: 'symbol',
    ...src,
    'source-layer': 'transportation_name',
    minzoom: 14.5,
    filter: classIn([...MINOR, ...MAJOR, ...PATHS]),
    layout: {
      'symbol-placement': 'line',
      'text-field': NAME,
      'text-font': REGULAR,
      'text-size': ['interpolate', ['linear'], ['zoom'], 14.5, 10.5, 18, 13],
      'text-rotation-alignment': 'map',
      'text-pitch-alignment': 'viewport',
    },
    paint: { 'text-color': TINT.label, 'text-halo-color': colors.paper, 'text-halo-width': 1.6 },
  },
  {
    id: 'label-water',
    type: 'symbol',
    ...src,
    'source-layer': 'water_name',
    layout: { 'text-field': NAME, 'text-font': ITALIC, 'text-size': 12 },
    paint: { 'text-color': colors.sageDark, 'text-halo-color': colors.paper, 'text-halo-width': 1.4 },
  },
  // Neighbourhood names echo the app's Overline style: small, spaced capitals.
  {
    id: 'label-neighbourhood',
    type: 'symbol',
    ...src,
    'source-layer': 'place',
    minzoom: 12,
    maxzoom: 17,
    filter: classIn(['suburb', 'quarter', 'neighbourhood']),
    layout: {
      'text-field': NAME,
      'text-font': REGULAR,
      'text-size': 10.5,
      'text-transform': 'uppercase',
      'text-letter-spacing': 0.18,
      'text-max-width': 8,
    },
    paint: { 'text-color': TINT.labelMuted, 'text-halo-color': colors.paper, 'text-halo-width': 1.4 },
  },
  {
    id: 'label-town',
    type: 'symbol',
    ...src,
    'source-layer': 'place',
    maxzoom: 14,
    filter: classIn(['city', 'town', 'village']),
    layout: {
      'text-field': NAME,
      'text-font': BOLD,
      'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 13, 15],
      'text-max-width': 8,
    },
    paint: { 'text-color': colors.ink, 'text-halo-color': colors.paper, 'text-halo-width': 1.6 },
  },
];

const stopLayers: LayerSpecification[] = [
  // Soft halo behind the next curiosity so the eye finds it.
  {
    id: 'stops-next-halo',
    type: 'circle',
    source: MAP_SOURCES.stops,
    filter: ['==', ['get', 'state'], 'next'],
    paint: {
      'circle-radius': 16,
      'circle-color': colors.sage,
      'circle-opacity': 0.2,
      'circle-pitch-alignment': 'map',
    },
  },
  {
    id: 'stops',
    type: 'circle',
    source: MAP_SOURCES.stops,
    paint: {
      'circle-radius': ['match', ['get', 'state'], 'start', 7, 'end', 8, 'next', 7.5, 6],
      'circle-color': [
        'match', ['get', 'state'],
        'start', colors.ink,
        'end', colors.sageDark,
        'found', colors.sage,
        'next', colors.sage,
        colors.paperRaised,
      ],
      'circle-stroke-color': [
        'match', ['get', 'state'],
        'unfound', colors.sage,
        colors.paperRaised,
      ],
      'circle-stroke-width': 3,
      'circle-pitch-alignment': 'map',
    },
  },
];

const EMPTY = { type: 'FeatureCollection', features: [] } as const;

/** The complete Amble style. Pure data — safe to JSON-serialise into the map page. */
export function buildAmbleStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'Amble',
    glyphs: OFM_GLYPHS,
    sources: {
      [MAP_SOURCES.base]: { type: 'vector', url: OFM_TILEJSON },
      [MAP_SOURCES.routeWalked]: { type: 'geojson', data: EMPTY },
      [MAP_SOURCES.routeRemaining]: { type: 'geojson', data: EMPTY },
      [MAP_SOURCES.stops]: { type: 'geojson', data: EMPTY },
    },
    layers: [...baseLayers, ...routeLayers, ...labelLayers, ...stopLayers],
  } as StyleSpecification;
}
