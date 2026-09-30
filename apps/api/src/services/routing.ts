import type { Coord, RouteGeometry, RouteStep } from '@amble/shared';
import { ORS } from '../config.js';

/**
 * Real walking routes from OpenRouteService (foot-walking profile). Two shapes:
 * routing *through* a set of waypoints, and generating a round-trip loop of a
 * target length from a single start. Both return real street geometry plus
 * turn-by-turn steps. Every call throws on failure (missing key, network, no
 * route) so the planner can fall back to the stylized synthetic loop.
 */

export type RoutedPath = {
  geometry: RouteGeometry;
  steps: RouteStep[];
  distanceM: number;
};

export type Router = {
  routeThrough: (coords: Coord[]) => Promise<RoutedPath>;
  roundTrip: (start: Coord, targetM: number, seed: number) => Promise<RoutedPath>;
};

// ── tiny TTL cache (same idea as osm.ts) ───────────────────────────────────
const cache = new Map<string, { expires: number; value: RoutedPath }>();
function cached(key: string, fn: () => Promise<RoutedPath>): Promise<RoutedPath> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value);
  return fn().then((value) => {
    cache.set(key, { value, expires: Date.now() + 10 * 60_000 });
    return value;
  });
}

// ── ORS response shapes (only the bits we use) ─────────────────────────────
type OrsStep = {
  distance: number;
  instruction: string;
  name?: string;
  type?: number;
  exit_number?: number;
  way_points: [number, number];
};
export type OrsResponse = {
  features: {
    geometry: { type: 'LineString'; coordinates: [number, number][] };
    properties: {
      summary?: { distance?: number };
      segments: { steps: OrsStep[] }[];
    };
  }[];
};

/** ORS maneuver type for "arrive at the destination / a waypoint". */
const ORS_ARRIVE = 10;

/**
 * Turn an ORS GeoJSON directions response into our route + steps.
 *
 * - Every leg ends in a zero-length "arrive" step. Only the **final** one is
 *   kept (the walker's goal: home); arrivals at intermediate waypoints are
 *   curiosities, which the app reveals by proximity instead of announcing.
 * - Other zero-length steps are noise, except the very first (depart).
 */
export function parseOrsResponse(data: OrsResponse): RoutedPath {
  const feature = data.features?.[0];
  if (!feature || feature.geometry.coordinates.length < 2) throw new Error('ORS empty route');

  const segments = feature.properties.segments ?? [];
  const steps: RouteStep[] = [];
  segments.forEach((segment, si) => {
    const lastSegment = si === segments.length - 1;
    for (const s of segment.steps ?? []) {
      if (s.type === ORS_ARRIVE) {
        if (!lastSegment) continue;
      } else if (s.distance <= 0 && steps.length > 0) {
        continue;
      }
      steps.push({
        instruction: s.instruction,
        distanceM: Math.round(s.distance),
        wayName: s.name && s.name !== '-' ? s.name : null,
        type: s.type ?? null,
        startIndex: s.way_points[0],
        ...(s.exit_number != null ? { exitNumber: s.exit_number } : {}),
      });
    }
  });

  return {
    geometry: feature.geometry,
    steps,
    distanceM: Math.round(feature.properties.summary?.distance ?? 0),
  };
}

async function post(body: unknown): Promise<RoutedPath> {
  if (!ORS.apiKey) throw new Error('ORS_API_KEY not set');
  const res = await fetch(ORS.directionsUrl, {
    method: 'POST',
    headers: {
      Authorization: ORS.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/geo+json',
      'User-Agent': ORS.userAgent,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`ORS ${res.status}`);
  return parseOrsResponse((await res.json()) as OrsResponse);
}

export const orsRouter: Router = {
  routeThrough(coords) {
    const key = `through:${coords.map((c) => `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`).join(';')}`;
    return cached(key, () =>
      post({ coordinates: coords.map((c) => [c.lng, c.lat]), instructions: true }),
    );
  },
  roundTrip(start, targetM, seed) {
    const key = `loop:${start.lat.toFixed(4)},${start.lng.toFixed(4)}:${Math.round(targetM)}:${seed}`;
    return cached(key, () =>
      post({
        coordinates: [[start.lng, start.lat]],
        instructions: true,
        options: { round_trip: { length: Math.round(targetM), points: 4, seed } },
      }),
    );
  },
};
