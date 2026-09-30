import type { Coord } from '@amble/shared';
import { haversineM } from '../lib/geo.js';
import type { RoutedPath } from './routing.js';

/**
 * Out-and-back detection. Routing *through* a curiosity makes the walker reach
 * its nearest road point: when that point is up a side street (or the next leg
 * leaves the way it came), the route goes out and doubles back on itself. The
 * planner uses this to route past the side street's junction instead, so every
 * curiosity sits on the loop rather than at the end of a spike.
 */

/** Out and back are "the same street" while they stay this close. */
const SAME_WAY_M = 8;
/** Resolution of the along-route comparison. */
const PROBE_STEP_M = 4;
/** Shorter doublings back are just the waypoint snap wobbling; ignore them. */
export const MIN_SPUR_M = 20;
/** A curiosity this close to its spur's junction is still revealed from the loop
 *  (the app reveals within 60 m; this leaves room for GPS error). */
export const SPUR_REACH_M = 45;

type LngLat = [number, number];

export type Spur = {
  /** Where the out-and-back leaves the loop. */
  junction: Coord;
  /** One-way length of the spur, metres. */
  spurM: number;
};

function cumulative(coords: LngLat[]): number[] {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    const [aLng, aLat] = coords[i - 1]!;
    const [bLng, bLat] = coords[i]!;
    cum.push(cum[i - 1]! + haversineM({ lat: aLat, lng: aLng }, { lat: bLat, lng: bLng }));
  }
  return cum;
}

/** The point `m` metres along the line (clamped to its ends). */
function pointAt(coords: LngLat[], cum: number[], m: number): Coord {
  const total = cum[cum.length - 1]!;
  const d = Math.max(0, Math.min(total, m));
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid]! <= d) lo = mid;
    else hi = mid;
  }
  const [aLng, aLat] = coords[lo]!;
  const [bLng, bLat] = coords[hi]!;
  const span = cum[hi]! - cum[lo]!;
  const t = span > 0 ? (d - cum[lo]!) / span : 0;
  return { lat: aLat + (bLat - aLat) * t, lng: aLng + (bLng - aLng) * t };
}

/**
 * For each intermediate waypoint (index into `waypointIndices`, excluding the
 * first and last), the out-and-back centred on it, or null when the route
 * passes straight through. Compares the route `d` metres before and after the
 * waypoint for growing `d`: while both points coincide, the walker is coming
 * back the way they went.
 */
export function findSpurs(coords: LngLat[], waypointIndices: number[]): (Spur | null)[] {
  if (coords.length < 3 || waypointIndices.length < 3) return [];
  const cum = cumulative(coords);
  const total = cum[cum.length - 1]!;

  return waypointIndices.slice(1, -1).map((wi) => {
    const at = cum[Math.min(Math.max(0, wi), cum.length - 1)]!;
    let spurM = 0;
    for (let d = PROBE_STEP_M; at - d >= 0 && at + d <= total; d += PROBE_STEP_M) {
      if (haversineM(pointAt(coords, cum, at - d), pointAt(coords, cum, at + d)) > SAME_WAY_M) break;
      spurM = d;
    }
    return spurM >= MIN_SPUR_M ? { junction: pointAt(coords, cum, at - spurM), spurM } : null;
  });
}

/**
 * The out-and-backs a routed path makes to its stops (listed in route order,
 * between the path's first and last waypoints), with whether each stop can
 * still be revealed from the junction. All null when the router didn't report
 * waypoint positions.
 */
export function stopSpurs(
  path: RoutedPath,
  stops: Coord[],
): ({ junction: Coord; reachable: boolean } | null)[] {
  const wp = path.waypointIndices;
  if (!wp || wp.length !== stops.length + 2) return stops.map(() => null);
  const spurs = findSpurs(path.geometry.coordinates as LngLat[], wp);
  return stops.map((stop, i) => {
    const spur = spurs[i];
    if (!spur) return null;
    return { junction: spur.junction, reachable: haversineM(stop, spur.junction) <= SPUR_REACH_M };
  });
}
