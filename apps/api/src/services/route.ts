import type { Category, Coord, Pace, RouteGeometry, RouteSource, RouteStep } from '@amble/shared';
import { PACE_METRES_PER_MIN } from '@amble/shared';
import { bearingDeg, destination, haversineM } from '../lib/geo.js';
import { orsRouter, type RoutedPath, type Router } from './routing.js';
import { routeLegs } from './legs.js';
import { SPUR_REACH_M, stopSpurs } from './spurs.js';

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

/** An end point closer than this to the start just means "loop back here". */
export const MIN_END_M = 150;
/** An A→B wander is at least this much longer than the straight line. */
const MIN_AB_FACTOR = 1.15;
/** Real streets are roughly this much longer than the straight lines between points. */
const STREET_FACTOR = 1.25;

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

/** Curiosities lying within `thresholdM` of the route (close enough to be
 *  revealed from it), ordered by position along it. */
function curiositiesAlong(
  geometry: RouteGeometry,
  candidates: Candidate[],
  minutes: number,
  thresholdM = SPUR_REACH_M,
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

/**
 * Pick and order curiosities for an A→B wander. Candidates must fit in an
 * ellipse with the two ends as foci (going via them stays within the distance
 * budget), are spread out along the way (one per stretch of the start→end
 * axis), and are visited in order along it — so the walk keeps heading for the
 * finish. A short walk only takes ones close to the line; a long one detours.
 */
function selectStopsAB(
  start: Coord,
  end: Coord,
  target: number,
  minutes: number,
  candidates: Candidate[],
  rand: () => number,
): Candidate[] {
  const direct = haversineM(start, end);
  const budget = Math.max(direct * 1.05, target / STREET_FACTOR);
  const axis = bearingDeg(start, end);

  const inside = candidates
    .map((c) => {
      const p = toCoord(c);
      const ds = haversineM(start, p);
      const de = haversineM(p, end);
      // Position along the start→end axis, 0..1.
      const rel = ((bearingDeg(start, p) - axis) * Math.PI) / 180;
      const t = (ds * Math.cos(rel)) / direct;
      return { c, ds, de, t, extra: ds + de - direct };
    })
    .filter((x) => x.ds > 40 && x.de > 40 && x.ds + x.de <= budget && x.t > 0.05 && x.t < 0.95);
  if (inside.length === 0) return [];

  const count = Math.min(stopCount(minutes), inside.length);
  // Share the spare distance between the stops: that's how far off the line each may go.
  const wantExtra = ((budget - direct) / count) * 0.8;
  const chosen: typeof inside = [];
  for (let k = 0; k < count; k++) {
    const free = inside.filter((x) => !chosen.includes(x));
    const bucket = free.filter((x) => x.t >= k / count && x.t < (k + 1) / count);
    const pool = bucket.length ? bucket : free;
    const best = pool
      .map((x) => ({ x, score: Math.abs(x.extra - wantExtra) + rand() * Math.max(wantExtra, 80) * 0.5 }))
      .sort((a, b) => a.score - b.score)[0];
    if (best) chosen.push(best.x);
  }
  return chosen.sort((a, b) => a.t - b.t).map((x) => x.c);
}

/** The stylized fallback: gently bowed lines through the stops, home or to the
 *  end (or round a synthetic ring when there are none). No real streets, no
 *  turn-by-turn. */
function synthRoute(
  start: Coord,
  end: Coord | null,
  chosen: Candidate[],
  target: number,
  rand: () => number,
): PlannedRoute {
  const via: Coord[] =
    chosen.length >= 1
      ? chosen.map(toCoord)
      : end
        ? []
        : Array.from({ length: 4 }, (_, i) =>
            destination(start, (rand() * 360 + i * 90) % 360, target / (2 * Math.PI)),
          );

  const waypoints: Coord[] = [start, ...via, end ?? start];
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
 * Route start → stops → finish, leg by leg without retracing streets. A stop
 * up a side street is passed at the side street's junction when it can be seen
 * from there, and left out otherwise (see `spurs.ts`). Null when every stop was
 * left out.
 */
async function throughStops(
  router: Router,
  start: Coord,
  finish: Coord,
  chosen: Candidate[],
): Promise<PlannedRoute | null> {
  let path = await routeLegs(router, [start, ...chosen.map(toCoord), finish]);
  let stops = chosen;
  const spurs = stopSpurs(path, chosen.map(toCoord));
  if (spurs.some(Boolean)) {
    const kept = chosen
      .map((c, i) => ({ c, spur: spurs[i] }))
      .filter((x) => !x.spur || x.spur.reachable);
    if (kept.length === 0) return null;
    try {
      path = await routeLegs(router, [
        start,
        ...kept.map((x) => x.spur?.junction ?? toCoord(x.c)),
        finish,
      ]);
      stops = kept.map((x) => x.c);
    } catch {
      // Keep the first route — spurs and all — rather than lose real streets.
    }
  }
  return {
    stops: makeStops(start, stops),
    route: path.geometry,
    steps: path.steps,
    distanceKm: round1(path.distanceM / 1000),
    source: 'through',
  };
}

/**
 * A real wander of about `target` metres with no stops to aim for: round a
 * ring of made-up waypoints back home, or — to an end point — via a point off
 * to one side when there's distance to spare. ORS's own round trip is the
 * loop's second choice: it's happy to double back on itself.
 */
async function wanderWithoutStops(
  router: Router,
  start: Coord,
  end: Coord | null,
  target: number,
  seed: number,
  rand: () => number,
): Promise<RoutedPath> {
  if (end) {
    const direct = haversineM(start, end);
    const axis = bearingDeg(start, end);
    const reach = target / STREET_FACTOR / 2;
    const via: Coord[] = [];
    if (reach > (direct / 2) * 1.15) {
      const offset = Math.sqrt(reach * reach - (direct / 2) ** 2);
      const mid = destination(start, axis, direct / 2);
      const side = rand() < 0.5 ? 90 : -90;
      via.push(destination(mid, (axis + side + 360) % 360, offset));
    }
    return routeLegs(router, [start, ...via, end]);
  }
  const radius = target / STREET_FACTOR / (2 * Math.PI);
  const turn = rand() * 360;
  const ring = [0, 120, 240].map((b) => destination(start, (turn + b) % 360, radius));
  try {
    return await routeLegs(router, [start, ...ring, start]);
  } catch {
    return router.roundTrip(start, target, seed);
  }
}

/**
 * Build a wander that always succeeds. It loops back to the start, or — with
 * an `end` — finishes there, and never walks the same street twice unless it
 * has to (see `legs.ts`).
 * 1. `through`: curiosities nearby → real streets through them.
 * 2. `loop`: none in reach → a real route of the right length anyway, picking
 *    up any curiosities that happen to lie along it.
 * 3. `synthetic`: the router is unavailable (no key / network) → a stylized
 *    route with no turn-by-turn.
 * For A→B, the length decides how much to wander: never less than the direct
 * way (× 1.15); a longer one detours through more of the area.
 */
export async function generateWander(opts: {
  start: Coord;
  end?: Coord | null;
  minutes: number;
  pace: Pace;
  candidates: Candidate[];
  seed?: number;
  router?: Router;
}): Promise<PlannedRoute> {
  const { start, minutes, pace, candidates, seed = 1, router = orsRouter } = opts;
  const end = opts.end && haversineM(start, opts.end) > MIN_END_M ? opts.end : null;
  const byTime = minutes * PACE_METRES_PER_MIN[pace];
  const target = end ? Math.max(haversineM(start, end) * MIN_AB_FACTOR, byTime) : byTime;
  const rand = mulberry32(seed);
  const chosen = end
    ? selectStopsAB(start, end, target, minutes, candidates, rand)
    : selectStops(start, target, minutes, candidates, rand);

  try {
    if (chosen.length >= 1) {
      const planned = await throughStops(router, start, end ?? start, chosen);
      if (planned) return planned;
    }
    const path = await wanderWithoutStops(router, start, end, target, seed, rand);
    const near = curiositiesAlong(path.geometry, candidates, minutes);
    return {
      stops: makeStops(start, near),
      route: path.geometry,
      steps: path.steps,
      distanceKm: round1(path.distanceM / 1000),
      source: 'loop',
    };
  } catch {
    return synthRoute(start, end, chosen, target, rand);
  }
}
