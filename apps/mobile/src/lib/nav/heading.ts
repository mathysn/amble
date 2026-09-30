import { COMPASS_DEADBAND_DEG, MOVING_MPS } from './constants';
import { angleDiff, normDeg } from './geo';

/**
 * Circular low-pass filter for compass readings: blends along the shortest arc,
 * so 350° → 10° passes through 0°, not 180°.
 */
export function smoothHeading(prev: number | null, next: number, alpha = 0.3): number {
  if (prev === null) return normDeg(next);
  return normDeg(prev + angleDiff(next, prev) * alpha);
}

/**
 * Which way the map should face in follow mode. While walking along the route,
 * face the way the route goes (steady, like Google Maps); when standing still or
 * off the route, face where the phone points — but ignore small wobble.
 */
export function cameraBearing(opts: {
  onRoute: boolean;
  speedMps: number;
  routeBearing: number | null;
  compass: number | null;
  prev: number;
}): number {
  const { onRoute, speedMps, routeBearing, compass, prev } = opts;
  if (onRoute && speedMps >= MOVING_MPS && routeBearing !== null) return normDeg(routeBearing);
  if (compass !== null && Math.abs(angleDiff(compass, prev)) > COMPASS_DEADBAND_DEG) {
    return normDeg(compass);
  }
  return prev;
}
