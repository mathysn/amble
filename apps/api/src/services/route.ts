import type { Category, Coord, Pace, RouteGeometry, RouteSource, RouteStep } from '@amble/shared';
import { PACE_METRES_PER_MIN } from '@amble/shared';
import { bearingDeg, destination, haversineM } from '../lib/geo.js';
import { orsRouter, type Router } from './routing.js';

/** A candidate the route planner can choose from (DB id + position + category). */
export type Candidate = {
  id: string;
  lat: number;
  lng: number;
  category: Category;
};

export type PlannedStop = {
  candidate: Candidate;
  order: number;
  distanceM: number;
  detourMin: number;
};

export type PlannedRoute = {
  stops: PlannedStop[];
  route: RouteGeometry;
  steps: RouteStep[];
  distanceKm: number;
  source: RouteSource;
};

/** How many curiosities to reveal for a walk of `minutes` minutes. */
export function stopCount(minutes: number): number {
  return Math.min(5, Math.max(2, Math.round(minutes / 12)));
}

/** Deterministic-ish RNG so `reshuffle` can vary the pick with a seed. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const toCoord = (c: Candidate): Coord => ({ lat: c.lat, lng: c.lng });
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Pick and order curiosities for the loop — near an ideal ring, spread around the
 *  compass, ordered by bearing so the walk sweeps around and home. May return []. */
function selectStops(
  start: Coord,
  target: number,
  minutes: number,
  candidates: Candidate[],
  rand: () => number,
): Candidate[] {
  const idealRadius = target / (2 * Math.PI);
  const maxRadius = target / 3;

  const withDist = candidates
    .map((c) => ({ c, d: haversineM(start, toCoord(c)) }))
    .filter((x) => x.d > 40 && x.d <= maxRadius);
  if (withDist.length === 0) return [];

  const count = Math.min(stopCount(minutes), withDist.length);
  const ranked = withDist
    .map((x) => ({ ...x, score: Math.abs(x.d - idealRadius) + rand() * idealRadius * 0.35 }))
    .sort((a, b) => a.score - b.score);

  const pool = ranked.slice(0, Math.max(count, Math.min(ranked.length, count * 3)));
  pool.sort((a, b) => bearingDeg(start, toCoord(a.c)) - bearingDeg(start, toCoord(b.c)));
  const offset = Math.floor(rand() * pool.length);
  const chosen: Candidate[] = [];
  for (let i = 0; i < count; i++) {
    const item = pool[(offset + Math.floor((i * pool.length) / count)) % pool.length];
    if (item && !chosen.includes(item.c)) chosen.push(item.c);
  }
  chosen.sort((a, b) => bearingDeg(start, toCoord(a)) - bearingDeg(start, toCoord(b)));
  return chosen;
}

/** Curiosities lying within `thresholdM` of the route, ordered by position along it. */
function curiositiesAlong(
  geometry: RouteGeometry,
  candidates: Candidate[],
  minutes: number,
  thresholdM = 80,
): Candidate[] {
  const along = candidates
    .map((c) => {
      let best = Infinity;
      let atIndex = 0;
      geometry.coordinates.forEach(([lng, lat], i) => {
        const d = haversineM(toCoord(c), { lat, lng });
        if (d < best) {
          best = d;
          atIndex = i;
        }
      });
      return { c, best, atIndex };
    })
    .filter((x) => x.best <= thresholdM)
    .sort((a, b) => a.atIndex - b.atIndex);

  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const x of along) {
    if (seen.has(x.c.id)) continue;
    seen.add(x.c.id);
    out.push(x.c);
    if (out.length >= stopCount(minutes)) break;
  }
  return out;
}

function makeStops(start: Coord, ordered: Candidate[]): PlannedStop[] {
  return ordered.map((candidate, i) => {
    const straightM = haversineM(start, toCoord(candidate));
    return {
      candidate,
      order: i + 1,
      distanceM: Math.round(straightM),
      detourMin: Math.max(1, Math.round(straightM / 400)),
    };
  });
}

/** The stylized fallback: a gently bowed loop through the stops (or a synthetic
 *  ring when there are none). No real streets, no turn-by-turn. */
function synthLoop(
  start: Coord,
  chosen: Candidate[],
  target: number,
  rand: () => number,
): PlannedRoute {
  const ring: Coord[] =
    chosen.length >= 1
      ? chosen.map(toCoord)
      : Array.from({ length: 4 }, (_, i) =>
          destination(start, (rand() * 360 + i * 90) % 360, target / (2 * Math.PI)),
        );

  const waypoints: Coord[] = [start, ...ring, start];
  const coords: [number, number][] = [[start.lng, start.lat]];
  let distanceM = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i]!;
    const to = waypoints[i + 1]!;
    const legM = haversineM(from, to);
    const brng = bearingDeg(from, to);
    const side = i % 2 === 0 ? 1 : -1;
    const mid = destination(from, brng, legM / 2);
    const bowed = destination(mid, (brng + 90 * side + 360) % 360, legM * 0.18);
    coords.push([bowed.lng, bowed.lat], [to.lng, to.lat]);
    distanceM += legM * 1.2; // wander factor — real streets aren't straight lines
  }

  return {
    stops: makeStops(start, chosen),
    route: { type: 'LineString', coordinates: coords },
    steps: [],
    distanceKm: round1(distanceM / 1000),
    source: 'synthetic',
  };
}

/**
 * Build a wander that always succeeds. With curiosities nearby, route through
 * them on real streets; otherwise generate a real round-trip loop of the target
 * length from where you stand. Either way you get real geometry + turn-by-turn.
 * If the router is unavailable (no key / network), fall back to a stylized loop.
 */
export async function generateWander(opts: {
  start: Coord;
  minutes: number;
  pace: Pace;
  candidates: Candidate[];
  seed?: number;
  router?: Router;
}): Promise<PlannedRoute> {
  const { start, minutes, pace, candidates, seed = 1, router = orsRouter } = opts;
  const target = minutes * PACE_METRES_PER_MIN[pace];
  const rand = mulberry32(seed);
  const chosen = selectStops(start, target, minutes, candidates, rand);

  try {
    if (chosen.length >= 1) {
      const path = await router.routeThrough([start, ...chosen.map(toCoord), start]);
      return {
        stops: makeStops(start, chosen),
        route: path.geometry,
        steps: path.steps,
        distanceKm: round1(path.distanceM / 1000),
        source: 'through',
      };
    }
    // No curiosities within reach — a real loop of the requested length still works.
    const path = await router.roundTrip(start, target, seed);
    const near = curiositiesAlong(path.geometry, candidates, minutes);
    return {
      stops: makeStops(start, near),
      route: path.geometry,
      steps: path.steps,
      distanceKm: round1(path.distanceM / 1000),
      source: 'loop',
    };
  } catch {
    return synthLoop(start, chosen, target, rand);
  }
}
