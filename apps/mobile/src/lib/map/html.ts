import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { colors } from '../../theme';
import { safeJson } from './bridge';
import { ROUTE_ARROW_IMAGE } from './style';

/**
 * The self-contained page the WebMap's WebView loads: MapLibre GL JS (pinned,
 * from jsDelivr) rendering the Amble style, plus a small runtime that applies
 * batched messages from React Native (`window.__amble.recv([...])`, see
 * bridge.ts) and posts `boot` / `ready` / `error` / `gesture` / `perf` / `log`
 * back.
 *
 * Why these choices:
 * - maplibre-gl 5.24.0 exactly: v6 ships ESM only (no plain <script> build), and
 *   an exact URL is cached forever by the WebView.
 * - The style and the starting camera are embedded, so the map opens on the walk
 *   instead of a world view, and our overlay sources exist before `load`.
 * - The walker "puck" is one DOM marker lying flat on the map (accuracy halo,
 *   heading cone, dot) moved by a single capped animation loop; the follow
 *   camera rides the same loop, so puck and camera never drift apart.
 * - Errors before `load` decide the fallback (see WebMap); after `load` they're
 *   only logged — a single bad tile mid-walk must not kill the map.
 *
 * The runtime is a plain string (not a real function turned into a string):
 * Hermes compiles app code to bytecode, where `fn.toString()` has no source.
 * Keep it ES2017, no template literals.
 */

export const MAPLIBRE_VERSION = '5.24.0';
const CDN = `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist`;

export type MapPageMode = 'preview' | 'nav';

export type MapPageConfig = {
  style: StyleSpecification;
  center: [number, number];
  zoom: number;
  mode: MapPageMode;
};

const CONFIG_TOKEN = '__AMBLE_CONFIG__';

export const PAGE_SCRIPT = `
(function () {
  'use strict';
  var CFG = ${CONFIG_TOKEN};
  var NAV = CFG.mode === 'nav';
  var FOLLOW_ZOOM = 17;
  var FOLLOW_PITCH_3D = 50;
  var PUCK_TWEEN_MS = 1000;
  var ARROW_IMAGE = CFG.arrowImage;
  var FRAME_MS = 32;

  function post(msg) {
    try {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    } catch (e) { /* bridge gone */ }
  }
  window.addEventListener('error', function (e) {
    post({ type: 'log', level: 'error', msg: String(e && e.message) });
  });

  if (!window.maplibregl) { post({ type: 'error', reason: 'script' }); return; }
  post({ type: 'boot' });

  var map;
  try {
    map = new maplibregl.Map({
      container: 'map',
      style: CFG.style,
      center: CFG.center,
      zoom: CFG.zoom,
      maxPitch: 60,
      dragRotate: NAV,
      pitchWithRotate: NAV,
      touchPitch: NAV,
      keyboard: false,
      attributionControl: { compact: true },
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      fadeDuration: 0,
      canvasContextAttributes: { antialias: false }
    });
  } catch (e) {
    post({ type: 'error', reason: 'webgl', message: String(e && e.message) });
    return;
  }
  if (!NAV) map.touchZoomRotate.disableRotation();

  var S = {
    loaded: false,
    errors: 0,
    coords: [],
    routeKey: null,
    progress: null,
    insets: { top: 0, bottom: 0 },
    mode: NAV ? 'follow' : 'overview',
    threeD: false,
    animating: true,
    puck: null,
    from: null,
    to: null,
    t0: 0,
    acc: 0,
    cone: null,
    coneTarget: null,
    cam: 0,
    camTarget: 0,
    easeUntil: 0
  };

  // ── errors & lifecycle ────────────────────────────────────────────────
  map.on('error', function (e) {
    var msg = String((e && e.error && e.error.message) || 'map error');
    if (S.loaded) { post({ type: 'log', level: 'warn', msg: msg }); return; }
    S.errors++;
    var sourceFailed = !!(e && e.sourceId === 'openmaptiles' && !e.tile);
    if (sourceFailed || S.errors > 10) {
      post({ type: 'error', reason: sourceFailed ? 'source' : 'tiles', message: msg });
    }
  });

  // The route's direction chevrons: the style has no sprite, so draw the one
  // icon it needs (a light ">" that the line layout turns along the route).
  map.on('styleimagemissing', function (e) {
    if (!e || e.id !== ARROW_IMAGE || map.hasImage(ARROW_IMAGE)) return;
    var size = 24;
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = CFG.colors.paperRaised;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(9, 6);
    ctx.lineTo(16, 12);
    ctx.lineTo(9, 18);
    ctx.stroke();
    map.addImage(ARROW_IMAGE, ctx.getImageData(0, 0, size, size), { pixelRatio: 2 });
  });

  map.on('load', function () {
    S.loaded = true;
    // Start the attribution folded into its (i) button; tapping it expands it.
    var attrib = document.querySelector('.maplibregl-ctrl-attrib');
    if (attrib) attrib.classList.remove('maplibregl-compact-show');
    applyInsets();
    post({ type: 'ready' });
  });

  function onUserMove(e) {
    if (!NAV || !e || !e.originalEvent) return;
    if (S.mode !== 'free') {
      S.mode = 'free';
      post({ type: 'gesture' });
    }
  }
  ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart'].forEach(function (ev) {
    map.on(ev, onUserMove);
  });
  map.on('zoom', sizeHalo);

  // ── helpers ────────────────────────────────────────────────────────────
  var EMPTY = { type: 'FeatureCollection', features: [] };
  function line(coords) {
    if (coords.length < 2) return EMPTY;
    return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } };
  }
  function setData(id, data) {
    var s = map.getSource(id);
    if (s) s.setData(data);
  }
  function setVis(id, on) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  }
  function norm(a) { return ((a % 360) + 360) % 360; }
  function angleDiff(to, from) { return ((to - from + 540) % 360) - 180; }

  function padding() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    if (S.mode === 'follow') {
      var visible = Math.max(0, h - S.insets.top - S.insets.bottom);
      return { top: S.insets.top + visible * 0.35, bottom: S.insets.bottom, left: 0, right: 0 };
    }
    var p = Math.min(32, h * 0.12, w * 0.12);
    return { top: S.insets.top + p, bottom: S.insets.bottom + p, left: p, right: p };
  }

  function applyInsets() {
    document.documentElement.style.setProperty('--amble-bottom', S.insets.bottom + 'px');
    if (S.mode === 'follow' && S.puck) map.setPadding(padding());
    else if (S.mode === 'overview') fitRoute(false);
  }

  function fitRoute(animate) {
    var c = S.coords;
    if (c.length < 2) return;
    var b = new maplibregl.LngLatBounds(c[0], c[0]);
    for (var i = 1; i < c.length; i++) b.extend(c[i]);
    // The follow camera's padding persists on the map and would be added to ours.
    map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    map.fitBounds(b, { padding: padding(), bearing: 0, pitch: 0, maxZoom: 17, duration: animate ? 600 : 0 });
  }

  function enterFollow() {
    if (!S.puck) return;
    S.easeUntil = performance.now() + 750;
    map.easeTo({
      center: [S.puck.lng, S.puck.lat],
      zoom: FOLLOW_ZOOM,
      bearing: S.cam,
      pitch: S.threeD ? FOLLOW_PITCH_3D : 0,
      padding: padding(),
      duration: 700
    });
    kick();
  }

  function setMode(mode) {
    S.mode = mode;
    if (mode === 'overview') fitRoute(true);
    else if (mode === 'follow') enterFollow();
  }

  function drawRoute() {
    var c = S.coords;
    var p = S.progress;
    if (!p || c.length < 2) {
      setData('route-walked', EMPTY);
      setData('route-remaining', line(c));
      return;
    }
    var at = [p.lng, p.lat];
    var seg = Math.max(0, Math.min(p.seg, c.length - 2));
    setData('route-walked', line(c.slice(0, seg + 1).concat([at])));
    setData('route-remaining', line([at].concat(c.slice(seg + 1))));
  }

  // ── the walker puck ────────────────────────────────────────────────────
  var marker = null;
  var haloEl = null;
  var coneEl = null;

  function ensureMarker() {
    if (marker) return;
    var el = document.createElement('div');
    el.className = 'puck';
    haloEl = document.createElement('div');
    haloEl.className = 'puck-halo';
    coneEl = document.createElement('div');
    coneEl.className = 'puck-cone';
    coneEl.style.display = 'none';
    var dot = document.createElement('div');
    dot.className = 'puck-dot';
    el.appendChild(haloEl);
    el.appendChild(coneEl);
    el.appendChild(dot);
    marker = new maplibregl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' })
      .setLngLat([S.puck.lng, S.puck.lat])
      .addTo(map);
  }

  function sizeHalo() {
    if (!haloEl || !S.puck) return;
    var mpp = (40075016.686 * Math.cos((S.puck.lat * Math.PI) / 180)) / (512 * Math.pow(2, map.getZoom()));
    var d = Math.max(26, Math.min(240, (2 * (S.acc || 0)) / mpp));
    haloEl.style.width = d + 'px';
    haloEl.style.height = d + 'px';
  }

  function movePuck(m) {
    S.acc = m.accuracy;
    if (!S.puck) {
      S.puck = { lng: m.lng, lat: m.lat };
      S.from = null;
      S.to = null;
      ensureMarker();
      sizeHalo();
      if (S.mode === 'follow') enterFollow();
      return;
    }
    S.from = { lng: S.puck.lng, lat: S.puck.lat };
    S.to = { lng: m.lng, lat: m.lat };
    S.t0 = performance.now();
    sizeHalo();
    kick();
  }

  // ── one animation loop for puck + camera (≤30 fps, only while moving) ──
  var raf = 0;
  var lastStep = 0;
  var lastRaw = 0;
  var samples = [];
  var perfSent = false;

  function kick() {
    if (!raf && S.animating) raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    raf = 0;
    samplePerf(now);
    var busy = true;
    if (now - lastStep >= FRAME_MS) {
      lastStep = now;
      busy = step(now);
    }
    if (busy && S.animating) raf = requestAnimationFrame(frame);
    else lastRaw = 0;
  }

  // If 3D follow can't hold ~24 fps on this phone, tell RN (it drops to 2D).
  function samplePerf(now) {
    if (perfSent || !S.threeD || S.mode !== 'follow') { lastRaw = now; return; }
    if (lastRaw) samples.push(now - lastRaw);
    lastRaw = now;
    if (samples.length >= 90) {
      samples.sort(function (a, b) { return a - b; });
      var fps = 1000 / samples[45];
      samples = [];
      if (fps < 24) {
        perfSent = true;
        post({ type: 'perf', fps: Math.round(fps) });
      }
    }
  }

  function step(now) {
    var busy = false;
    if (S.puck && S.to) {
      var t = Math.min(1, (now - S.t0) / PUCK_TWEEN_MS);
      S.puck.lng = S.from.lng + (S.to.lng - S.from.lng) * t;
      S.puck.lat = S.from.lat + (S.to.lat - S.from.lat) * t;
      if (t < 1) busy = true;
      else S.to = null;
      marker.setLngLat([S.puck.lng, S.puck.lat]);
    }

    if (marker) {
      if (S.coneTarget === null || S.coneTarget === undefined) {
        if (S.cone !== null) { S.cone = null; coneEl.style.display = 'none'; }
      } else {
        if (S.cone === null) { S.cone = S.coneTarget; coneEl.style.display = 'block'; }
        var dCone = angleDiff(S.coneTarget, S.cone);
        if (Math.abs(dCone) > 0.5) { S.cone = norm(S.cone + dCone * 0.25); busy = true; }
        else S.cone = S.coneTarget;
        marker.setRotation(S.cone);
      }
    }

    var dCam = angleDiff(S.camTarget, S.cam);
    if (Math.abs(dCam) > 0.3) { S.cam = norm(S.cam + dCam * 0.15); busy = true; }
    else S.cam = S.camTarget;

    if (S.mode === 'follow' && S.puck) {
      if (now < S.easeUntil) busy = true;
      else map.jumpTo({ center: [S.puck.lng, S.puck.lat], bearing: S.cam });
    }
    return busy;
  }

  // ── messages from React Native ─────────────────────────────────────────
  var H = {
    insets: function (m) {
      S.insets = { top: m.top, bottom: m.bottom };
      applyInsets();
    },
    route: function (m) {
      if (m.key === S.routeKey) return;
      S.routeKey = m.key;
      S.coords = m.coords;
      S.progress = null;
      drawRoute();
      if (S.mode === 'overview' || !S.puck) fitRoute(false);
    },
    stops: function (m) {
      setData('stops', {
        type: 'FeatureCollection',
        features: m.items.map(function (s) {
          return { type: 'Feature', properties: { state: s.state }, geometry: { type: 'Point', coordinates: [s.lng, s.lat] } };
        })
      });
    },
    progress: function (m) {
      S.progress = m.at;
      drawRoute();
    },
    threeD: function (m) {
      if (S.threeD === m.on) return;
      S.threeD = m.on;
      setVis('building-3d', m.on);
      setVis('building', !m.on);
      samples = [];
      if (S.mode === 'follow') enterFollow();
    },
    camera: function (m) {
      if (m.mode !== S.mode) setMode(m.mode);
    },
    puck: movePuck,
    bearing: function (m) {
      S.coneTarget = m.puck;
      S.camTarget = m.camera;
      kick();
    },
    animating: function (m) {
      S.animating = m.on;
      if (m.on) kick();
    }
  };

  window.__amble = {
    recv: function (batch) {
      if (!S.loaded) return;
      for (var i = 0; i < batch.length; i++) {
        var msg = batch[i];
        try {
          if (H[msg.type]) H[msg.type](msg);
        } catch (e) {
          post({ type: 'log', level: 'error', msg: msg.type + ': ' + String(e && e.message) });
        }
      }
    }
  };
})();
`;

const PAGE_CSS = `
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; background: ${colors.paper}; }
  .maplibregl-ctrl-bottom-right, .maplibregl-ctrl-bottom-left { bottom: var(--amble-bottom, 0px); }
  .maplibregl-ctrl-attrib { font-size: 10px; background: rgba(245,241,232,0.85) !important; }
  .puck { position: relative; width: 120px; height: 120px; pointer-events: none; }
  .puck > * { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); }
  .puck-halo { border-radius: 50%; background: rgba(122,139,111,0.16); border: 1px solid rgba(122,139,111,0.35); }
  /* Heading cone: a 60° wedge pointing "up" (north before rotation), fading out
     with distance. CSS rather than an SVG gradient, which didn't paint inside
     the marker's 3D transform. */
  .puck-cone {
    width: 120px; height: 120px; border-radius: 50%;
    background: conic-gradient(from -30deg, rgba(122,139,111,0.7) 0deg 60deg, transparent 60deg 360deg);
    -webkit-mask-image: radial-gradient(circle, #000 12%, transparent 72%);
    mask-image: radial-gradient(circle, #000 12%, transparent 72%);
  }
  .puck-dot {
    width: 20px; height: 20px; border-radius: 50%;
    background: ${colors.ink}; border: 3px solid ${colors.paperRaised};
    box-shadow: 0 2px 6px rgba(46,43,38,0.35);
  }
`;

/** Build the full HTML document for one WebMap instance. */
export function buildMapHtml(config: MapPageConfig): string {
  const cfg = {
    ...config,
    arrowImage: ROUTE_ARROW_IMAGE,
    colors: { sage: colors.sage, ink: colors.ink, paperRaised: colors.paperRaised },
  };
  const script = PAGE_SCRIPT.replace(CONFIG_TOKEN, safeJson(cfg));
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link href="${CDN}/maplibre-gl.css" rel="stylesheet">
<style>${PAGE_CSS}</style>
</head>
<body>
<div id="map"></div>
<script src="${CDN}/maplibre-gl.js"></script>
<script>${script}</script>
</body>
</html>`;
}
