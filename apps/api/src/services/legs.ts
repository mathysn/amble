import type { Coord, RouteStep } from '@amble/shared';
import type { Polygon, RoutedPath, Router } from './routing.js';

/**
 * Routes that don't retrace their steps. A route through several stops is
 * asked for one leg at a time, and each leg is told to avoid (ORS
 * `avoid_polygons`) the streets every earlier leg already used — so the way
 * back is a different way. Near each leg's own ends the avoidance is lifted,
 * so a leg can always leave the stop it starts from and reach the one it's
 * heading for. When a leg simply can't be done without going back over old
 * ground (a dead end, the only bridge), it's asked again without avoidance.
 */

type LngLat = [number, number];

/** Avoidance is lifted this close to a leg's start and end. */
export const LEG_EXCLUDE_M = 60;
/** Half-width of the strip avoided around a used street. Parallel streets are further apart. */
const AVOID_HALF_WIDTH_M = 10;
/** Used streets are sampled about this often before being turned into strips. */
const AVOID_STEP_M = 25;
/** ORS request size stays sane: coarsen the sampling until the strips fit. */
const MAX_AVOID_POLYGONS = 150;
/** ORS maneuver type for "arrive". */
const ORS_ARRIVE = 10;

const M_PER_DEG = 111_320;

/** A local metric frame around `origin`, precise enough for a few kilometres. */
function frame(origin: Coord) {
  const kx = M_PER_DEG * Math.cos((origin.lat * Math.PI) / 180);
  return {
    toXY: ([lng, lat]: LngLat): [number, number] => [(lng - origin.lng) * kx, (lat - origin.lat) * M_PER_DEG],
    toLngLat: ([x, y]: [number, number]): LngLat => [origin.lng + x / kx, origin.lat + y / M_PER_DEG],
  };
}

const dist = (a: [number, number], b: [number, number]) => Math.hypot(b[0] - a[0], b[1] - a[1]);

function segDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Points along `line` about `stepM` apart. Long straight stretches are split
 * too — a 300 m street is often a single segment, and it mustn't be left out
 * whole just because one end is near a stop.
 */
function sample(line: [number, number][], stepM: number): [number, number][] {
  if (line.length < 2) return line;
  const dense: [number, number][] = [line[0]!];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const pieces = Math.max(1, Math.ceil(dist(a, b) / stepM));
    for (let k = 1; k <= pieces; k++) {
      dense.push([a[0] + ((b[0] - a[0]) * k) / pieces, a[1] + ((b[1] - a[1]) * k) / pieces]);
    }
  }
  const out: [number, number][] = [dense[0]!];
  let since = 0;
  for (let i = 1; i < dense.length; i++) {
    since += dist(dense[i - 1]!, dense[i]!);
    if (since >= stepM * 0.99 || i === dense.length - 1) {
      out.push(dense[i]!);
      since = 0;
    }
  }
  return out;
}

/**
 * Thin strips (closed, counter-clockwise quads) along `lines`, leaving out any
 * stretch that comes within `LEG_EXCLUDE_M` of a point in `keepClear`.
 */
export function avoidPolygons(lines: LngLat[][], keepClear: Coord[]): Polygon[] {
  const all = lines.flat();
  if (all.length < 2) return [];
  const f = frame({ lng: all[0]![0], lat: all[0]![1] });
  const clear = keepClear.map((c) => f.toXY([c.lng, c.lat]));
  const xyLines = lines.filter((l) => l.length >= 2).map((l) => l.map(f.toXY));

  let step = AVOID_STEP_M;
  for (;;) {
    const polys: Polygon[] = [];
    for (const line of xyLines) {
      const pts = sample(line, step);
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i]!;
        const b = pts[i + 1]!;
        const len = dist(a, b);
        if (len < 1) continue;
        if (clear.some((c) => segDist(c, a, b) < LEG_EXCLUDE_M)) continue;
        const ux = (b[0] - a[0]) / len;
        const uy = (b[1] - a[1]) / len;
        const w = AVOID_HALF_WIDTH_M;
        // Extend each strip a little past its ends so neighbouring strips overlap at bends.
        const a2: [number, number] = [a[0] - ux * w, a[1] - uy * w];
        const b2: [number, number] = [b[0] + ux * w, b[1] + uy * w];
        const nx = -uy * w; // left normal
        const ny = ux * w;
        const ring: [number, number][] = [
          [a2[0] - nx, a2[1] - ny],
          [b2[0] - nx, b2[1] - ny],
          [b2[0] + nx, b2[1] + ny],
          [a2[0] + nx, a2[1] + ny],
        ];
        const lngLat = ring.map(f.toLngLat);
        polys.push([[...lngLat, lngLat[0]!]]);
      }
    }
    if (polys.length <= MAX_AVOID_POLYGONS) return polys;
    step *= 1.6;
  }
}

/** Stitch consecutive legs into one path: one shared vertex at each join, one final arrival. */
export function joinLegs(legs: RoutedPath[]): RoutedPath {
  const coords: LngLat[] = [];
  const steps: RouteStep[] = [];
  const waypointIndices: number[] = [0];
  let distanceM = 0;
  legs.forEach((leg, li) => {
    const c = leg.geometry.coordinates as LngLat[];
    const offset = li === 0 ? 0 : coords.length - 1;
    coords.push(...(li === 0 ? c : c.slice(1)));
    const last = li === legs.length - 1;
    for (const s of leg.steps) {
      // Arriving at a stop isn't announced — curiosities are revealed by proximity.
      if (s.type === ORS_ARRIVE && !last) continue;
      steps.push({ ...s, startIndex: s.startIndex + offset });
    }
    distanceM += leg.distanceM;
    waypointIndices.push(coords.length - 1);
  });
  return {
    geometry: { type: 'LineString', coordinates: coords },
    steps,
    distanceM,
    waypointIndices,
  };
}

/**
 * Route through `waypoints` one leg at a time, each leg avoiding the streets
 * used before it (and `avoidAlso`, e.g. the part of a walk already done).
 * Throws when a leg can't be routed at all, so callers can fall back.
 */
export async function routeLegs(
  router: Router,
  waypoints: Coord[],
  opts: { avoidAlso?: LngLat[] } = {},
): Promise<RoutedPath> {
  const used: LngLat[][] = opts.avoidAlso && opts.avoidAlso.length >= 2 ? [opts.avoidAlso] : [];
  const legs: RoutedPath[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i]!;
    const to = waypoints[i + 1]!;
    const avoid = avoidPolygons(used, [from, to]);
    let leg: RoutedPath;
    try {
      leg = await router.routeThrough([from, to], avoid.length ? { avoid } : undefined);
    } catch (err) {
      if (!avoid.length) throw err;
      // No way round: going back over old ground is the only option here.
      leg = await router.routeThrough([from, to]);
    }
    legs.push(leg);
    used.push(leg.geometry.coordinates as LngLat[]);
  }
  return joinLegs(legs);
}

/**
 * Share of a route's length that retraces an earlier, non-adjacent part of it
 * (within a few metres). 0 for a clean loop; ~0.5 for a pure out-and-back.
 */
export function reusedFraction(coords: LngLat[], toleranceM = 8, gapM = 40): number {
  if (coords.length < 3) return 0;
  const f = frame({ lng: coords[0]![0], lat: coords[0]![1] });
  const xy = coords.map(f.toXY);
  const cum = [0];
  for (let i = 1; i < xy.length; i++) cum.push(cum[i - 1]! + dist(xy[i - 1]!, xy[i]!));
  const total = cum[cum.length - 1]!;
  if (total === 0) return 0;

  let reused = 0;
  for (let i = 0; i < xy.length - 1; i++) {
    const len = cum[i + 1]! - cum[i]!;
    if (len === 0) continue;
    const mid: [number, number] = [(xy[i]![0] + xy[i + 1]![0]) / 2, (xy[i]![1] + xy[i + 1]![1]) / 2];
    const at = (cum[i]! + cum[i + 1]!) / 2;
    for (let j = 0; j < i; j++) {
      if (cum[j + 1]! > at - gapM) break;
      if (segDist(mid, xy[j]!, xy[j + 1]!) <= toleranceM) {
        reused += len;
        break;
      }
    }
  }
  return reused / total;
}
