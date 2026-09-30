import type { Coord, RouteGeometry } from '@amble/shared';
import { bearingAlong, buildRouteIndex, pointAt } from './routeIndex';
import { clamp, makeProjection, type XY } from './geo';
import type { Fix } from './tracker';

/**
 * A fake walker for tests and the dev-only "simulate walk" mode: walks the route
 * at a steady pace with GPS-like noise, optionally wandering off for a detour or
 * starting somewhere else and walking to the start first.
 */
export type SimOptions = {
  speedMps?: number;
  intervalMs?: number;
  /** ~1σ position noise, metres. */
  noiseM?: number;
  accuracy?: number;
  /** Leave the route sideways by `offsetM` for `lengthM` of it, starting `atM` along. */
  detour?: { atM: number; lengthM: number; offsetM: number };
  /** Start here and walk straight to the route's start first. */
  approachFrom?: Coord;
  /** Stop after this many metres of route (default: the whole route). */
  untilM?: number;
  seed?: number;
  startT?: number;
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulateWalk(route: RouteGeometry, opts: SimOptions = {}): Fix[] {
  const {
    speedMps = 1.4,
    intervalMs = 1000,
    noiseM = 3,
    accuracy = 8,
    detour,
    approachFrom,
    seed = 7,
    startT = 1_700_000_000_000,
  } = opts;
  const index = buildRouteIndex(route, []);
  const untilM = Math.min(opts.untilM ?? index.totalM, index.totalM);
  const rand = mulberry32(seed);
  const gauss = () => {
    const u = Math.max(rand(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };
  const step = (speedMps * intervalMs) / 1000;
  const fixes: Fix[] = [];
  const push = (xy: XY) => {
    const noisy: XY = [xy[0] + gauss() * noiseM, xy[1] + gauss() * noiseM];
    const c = index.proj.toCoord(noisy);
    fixes.push({ lat: c.lat, lng: c.lng, accuracy, t: startT + fixes.length * intervalMs });
  };

  if (approachFrom) {
    const from = index.proj.toXY(approachFrom);
    const to = index.xy[0]!;
    const dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
    for (let d = 0; d < dist; d += step) {
      const t = d / dist;
      push([from[0] + t * (to[0] - from[0]), from[1] + t * (to[1] - from[1])]);
    }
  }

  for (let along = 0; along <= untilM; along += step) {
    let xy = pointAt(index, along).xy;
    if (detour && along >= detour.atM && along <= detour.atM + detour.lengthM) {
      // Trapezoid: ease out over the first 15%, back in over the last 15%.
      const u = (along - detour.atM) / detour.lengthM;
      const k = clamp(Math.min(u, 1 - u) / 0.15, 0, 1);
      const b = (bearingAlong(index, along, 10) * Math.PI) / 180;
      // perpendicular to the direction of travel (to its right)
      xy = [xy[0] + Math.cos(b) * detour.offsetM * k, xy[1] - Math.sin(b) * detour.offsetM * k];
    }
    push(xy);
  }
  return fixes;
}

/** A small square-ish loop (lng, lat) around a point, handy for tests. */
export function loopAround(center: Coord, sizeM: number, pointsPerSide = 4): RouteGeometry {
  const proj = makeProjection(center);
  const h = sizeM / 2;
  const corners: XY[] = [[-h, -h], [h, -h], [h, h], [-h, h], [-h, -h]];
  const coords: [number, number][] = [];
  for (let c = 0; c < 4; c++) {
    const a = corners[c]!;
    const b = corners[c + 1]!;
    for (let i = 0; i < pointsPerSide; i++) {
      const t = i / pointsPerSide;
      const p = proj.toCoord([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      coords.push([p.lng, p.lat]);
    }
  }
  coords.push(coords[0]!);
  return { type: 'LineString', coordinates: coords };
}
