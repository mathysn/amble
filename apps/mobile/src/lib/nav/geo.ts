import type { Coord } from '@amble/shared';

export { haversineM } from '../geo';

export type LngLat = [number, number];
/** Metres east / north of a projection origin. */
export type XY = [number, number];

const R = 6_371_000;
const M_PER_DEG = (Math.PI * R) / 180;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Normalise an angle to [0, 360). */
export const normDeg = (a: number) => ((a % 360) + 360) % 360;

/** Signed smallest difference `to − from`, in [-180, 180). */
export const angleDiff = (to: number, from: number) => ((to - from + 540) % 360) - 180;

export type Projection = {
  toXY: (c: Coord | LngLat) => XY;
  toCoord: (p: XY) => Coord;
};

/**
 * A local flat (equirectangular) projection around `origin`. Over a walk's few
 * kilometres it's within a fraction of a percent of great-circle distance, and it
 * makes point-to-segment maths simple and fast.
 */
export function makeProjection(origin: Coord): Projection {
  const kx = M_PER_DEG * Math.cos(toRad(origin.lat));
  const ky = M_PER_DEG;
  return {
    toXY: (c) =>
      Array.isArray(c)
        ? [(c[0] - origin.lng) * kx, (c[1] - origin.lat) * ky]
        : [(c.lng - origin.lng) * kx, (c.lat - origin.lat) * ky],
    toCoord: ([x, y]) => ({ lng: origin.lng + x / kx, lat: origin.lat + y / ky }),
  };
}

export const distXY = (a: XY, b: XY) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Closest point to `p` on segment a→b: `t` in [0,1] along it, and the distance. */
export function projectOnSegment(p: XY, a: XY, b: XY): { t: number; x: number; y: number; d: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2, 0, 1);
  const x = a[0] + t * dx;
  const y = a[1] + t * dy;
  return { t, x, y, d: Math.hypot(p[0] - x, p[1] - y) };
}

/** Compass bearing from a to b in the flat projection (0 = north, clockwise). */
export const bearingXY = (a: XY, b: XY) => normDeg(toDeg(Math.atan2(b[0] - a[0], b[1] - a[1])));

/** Initial great-circle bearing from a to b. */
export function bearingDeg(a: Coord, b: Coord): number {
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLng);
  return normDeg(toDeg(Math.atan2(y, x)));
}
