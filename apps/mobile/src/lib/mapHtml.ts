import { colors } from '../theme';

/**
 * A self-contained HTML page for the WebMap's WebView: MapLibre GL JS (from its
 * CDN) rendering Stadia Maps' free "Alidade Smooth" basemap — a real, legible
 * vector map (streets, buildings, labels) — recoloured on load to the app's
 * paper palette. Route/stops/position draw on top in the same palette. React
 * Native pushes data in via `window.updateData(json)` (via injectJavaScript);
 * the page reports back only `{type:'ready'}` once the style has loaded.
 */
export function buildMapHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<script src="https://unpkg.com/maplibre-gl@4/dist/maplibre-gl.js"></script>
<link href="https://unpkg.com/maplibre-gl@4/dist/maplibre-gl.css" rel="stylesheet">
<style>
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: ${colors.paper}; }
  .maplibregl-ctrl-attrib { font-size: 10px; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  const SAGE = '${colors.sage}';
  const SAGE_DARK = '${colors.sageDark}';
  const INK = '${colors.ink}';
  const PAPER = '${colors.paper}';
  const SAND = '${colors.sand}';
  const SAND_DEEP = '${colors.sandDeep}';

  const map = new maplibregl.Map({
    container: 'map',
    style: 'https://tiles.stadiamaps.com/styles/alidade_smooth.json',
    center: [0, 0],
    zoom: 2,
    attributionControl: true,
  });

  let ready = false;
  let fittedOnce = false;

  function post(msg) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }

  // Recolour the base style toward the app's paper palette without losing the
  // road/building/label detail that makes it a real, usable map. Each call is
  // guarded so a future Stadia style update (renamed/missing layer) can't break
  // the whole map load.
  function paint(id, prop, value) {
    try {
      if (map.getLayer(id)) map.setPaintProperty(id, prop, value);
    } catch (e) {
      /* ignore — style layer schema may have changed upstream */
    }
  }

  function recolor() {
    paint('background', 'background-color', PAPER);
    paint('water', 'fill-color', SAND);
    paint('landcover_wood', 'fill-color', '#DCE4D2');
    paint('landcover_park', 'fill-color', '#DCE4D2');
    paint('park_fill', 'fill-color', '#DCE4D2');
    paint('landuse_residential', 'fill-color', '#EFE9DB');
    paint('building', 'fill-color', SAND_DEEP);
    paint('building', 'fill-outline-color', 'rgba(46,43,38,0.25)');
    paint('waterway', 'line-color', SAGE);

    paint('highway_path', 'line-color', SAGE);
    paint('highway_minor', 'line-color', 'rgba(46,43,38,0.35)');
    paint('highway_major_casing', 'line-color', INK);
    paint('highway_major_inner', 'line-color', PAPER);
    paint('highway_major_subtle', 'line-color', 'rgba(46,43,38,0.4)');
    paint('highway_motorway_casing', 'line-color', INK);
    paint('highway_motorway_inner', 'line-color', SAGE);
    paint('highway_motorway_subtle', 'line-color', 'rgba(122,139,111,0.6)');
    paint('railway', 'line-color', 'rgba(46,43,38,0.35)');
    paint('railway_dashline', 'line-color', 'rgba(46,43,38,0.35)');
    paint('boundary_state', 'line-color', 'rgba(46,43,38,0.25)');
    paint('boundary_country', 'line-color', 'rgba(46,43,38,0.3)');

    for (const id of ['highway_name_other', 'highway_name_major']) {
      paint(id, 'text-color', INK);
      paint(id, 'text-halo-color', PAPER);
    }
    for (const id of ['place_city', 'place_town', 'place_village', 'place_suburb', 'place_state', 'place_country_other', 'place_country_major']) {
      paint(id, 'text-color', INK);
      paint(id, 'text-halo-color', PAPER);
    }
    for (const id of ['water_name_nonocean', 'water_name_ocean', 'water_name_line']) {
      paint(id, 'text-color', SAGE_DARK);
      paint(id, 'text-halo-color', PAPER);
    }
  }

  map.on('load', () => {
    ready = true;
    recolor();

    map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} } });
    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': SAGE, 'line-width': 4, 'line-dasharray': [0.2, 1.6] },
    });

    post({ type: 'ready' });
  });

  map.on('error', (e) => post({ type: 'error', message: String(e && e.error && e.error.message) }));

  const markers = { start: null, position: null, stops: [] };

  function markerEl(bg, border, size) {
    const el = document.createElement('div');
    el.style.width = size + 'px';
    el.style.height = size + 'px';
    el.style.borderRadius = '50%';
    el.style.background = bg;
    if (border) el.style.boxShadow = '0 0 0 3px ' + border;
    return el;
  }

  window.updateData = function (data) {
    if (!ready) return;

    map.getSource('route').setData({
      type: 'Feature',
      properties: {},
      geometry: data.route,
    });

    if (markers.start) markers.start.remove();
    markers.start = new maplibregl.Marker({ element: markerEl(INK, null, 16) })
      .setLngLat([data.start.lng, data.start.lat])
      .addTo(map);

    markers.stops.forEach((m) => m.remove());
    markers.stops = (data.stops || []).map((s) =>
      new maplibregl.Marker({ element: markerEl(s.found ? SAGE : PAPER, SAGE, 14) })
        .setLngLat([s.lng, s.lat])
        .addTo(map),
    );

    if (data.position) {
      if (markers.position) markers.position.remove();
      markers.position = new maplibregl.Marker({ element: markerEl(INK, 'rgba(46,43,38,0.25)', 18) })
        .setLngLat([data.position.lng, data.position.lat])
        .addTo(map);
    }

    if (!fittedOnce && data.route.coordinates.length > 1) {
      fittedOnce = true;
      const bounds = data.route.coordinates.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(data.route.coordinates[0], data.route.coordinates[0]),
      );
      map.fitBounds(bounds, { padding: 48, animate: false });
    }
  };
</script>
</body>
</html>`;
}
