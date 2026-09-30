import type {
  Coord,
  RerouteStrategy,
  RouteGeometry,
  RouteSource,
  RouteStep,
} from '@amble/shared';
import { haversineM } from '../lib/geo.js';
import type { Router, RoutedPath } from './routing.js';

/** Routing is down (no key, ORS error, timeout): the client falls back to a "rejoin" arrow. */
export class RoutingUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Routing unavailable');
    this.cause = cause;
  }
}

export type RerouteInput = {
  route: RouteGeometry;
  steps: RouteStep[];
  source: RouteSource;
  start: Coord;
  here: Coord;
  /** The walk's curiosities, any order; `order` defines their sequence along the route. */
  curiosities: { lat: number; lng: number; order: number; found: boolean }[];
  distanceKm: number;
  strategy: RerouteStrategy;
  /** Last on-route vertex; coords[0..fromIndex] are kept as the walked part. */
  fromIndex?: number;
  router: Router;
};

export type ReroutePlan = {
  route: RouteGeometry;
  steps: RouteStep[];
  distanceKm: number;
  source: RouteSource;
};

type LngLat = [number, number];
const toCoord = ([lng, lat]: LngLat): Coord => ({ lat, lng });

/** Length of a polyline in metres. */
export function lineLengthM(coords: LngLat[]): number {
  let m = 0;
  for (let i = 1; i < coords.length; i++) m += haversineM(toCoord(coords[i - 1]!), toCoord(coords[i]!));
  return m;
}

/**
 * For points listed in route order, the index of the route vertex each sits
 * nearest to — searching forward from the previous point's index, so on a loop
 * (where the start and end share a location) the order along the walk wins.
 */
export function orderedNearestIndices(coords: LngLat[], points: Coord[]): number[] {
  const out: number[] = [];
  let from = 0;
  for (const p of points) {
    let best = from;
    let bestD = Infinity;
    for (let i = from; i < coords.length; i++) {
      const d = haversineM(p, toCoord(coords[i]!));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    out.push(best);
    from = best;
  }
  return out;
}

async function route(router: Router, waypoints: Coord[]): Promise<RoutedPath> {
  try {
    return await router.routeThrough(waypoints);
  } catch (err) {
    throw new RoutingUnavailableError(err);
  }
}

const shift = (steps: RouteStep[], by: number): RouteStep[] =>
  steps.map((s) => ({ ...s, startIndex: s.startIndex + by }));

const km = (m: number) => Math.round(m / 100) / 10;

/**
 * Plan a new route for a walk in progress. Pure apart from the injected router,
 * so it's tested offline. Throws `RoutingUnavailableError` when routing fails.
 */
export async function planReroute(input: RerouteInput): Promise<ReroutePlan> {
  const { here, start, router } = input;
  const coords = input.route.coordinates as LngLat[];

  // A synthetic walk has no real route to approach — plan a real one from here.
  const strategy = input.source === 'synthetic' ? 'rejoin' : input.strategy;
  const fromIndex = input.source === 'synthetic' ? undefined : input.fromIndex;

  if (strategy === 'approach') {
    const path = await route(router, [here, start]);
    const approach = path.geometry.coordinates as LngLat[];
    const approachSteps = path.steps.filter((s) => s.type !== 10); // no "arrive" at the start
    // The original route begins at the start, which is where the approach ends.
    const offset = approach.length - 1;
    return {
      route: { type: 'LineString', coordinates: [...approach, ...coords.slice(1)] },
      steps: [...approachSteps, ...shift(input.steps, offset)],
      distanceKm: km(path.distanceM + input.distanceKm * 1000),
      source: input.source,
    };
  }

  // rejoin: keep what's been walked, then route through what's left, home.
  const prefix = fromIndex !== undefined ? coords.slice(0, Math.min(fromIndex, coords.length - 1) + 1) : [];

  const ordered = input.curiosities.slice().sort((a, b) => a.order - b.order);
  const indices = orderedNearestIndices(coords, ordered);
  const ahead = ordered.filter(
    (c, i) => !c.found && (fromIndex === undefined || indices[i]! > fromIndex),
  );

  const path = await route(router, [here, ...ahead.map((c) => ({ lat: c.lat, lng: c.lng })), start]);
  const joinM = prefix.length ? haversineM(toCoord(prefix[prefix.length - 1]!), here) : 0;

  return {
    route: { type: 'LineString', coordinates: [...prefix, ...(path.geometry.coordinates as LngLat[])] },
    steps: shift(path.steps, prefix.length),
    distanceKm: km(lineLengthM(prefix) + joinM + path.distanceM),
    source: 'through',
  };
}
