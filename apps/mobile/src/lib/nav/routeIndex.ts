import type { Coord, RouteGeometry, RouteStep } from '@amble/shared';
import {
  bearingXY,
  clamp,
  distXY,
  makeProjection,
  projectOnSegment,
  type LngLat,
  type Projection,
  type XY,
} from './geo';
import { TIE_M } from './constants';

/** ORS maneuver type codes the engine cares about. */
export const MANEUVER = {
  left: 0,
  right: 1,
  sharpLeft: 2,
  sharpRight: 3,
  slightLeft: 4,
  slightRight: 5,
  straight: 6,
  roundaboutEnter: 7,
  roundaboutExit: 8,
  uTurn: 9,
  arrive: 10,
  depart: 11,
  keepLeft: 12,
  keepRight: 13,
} as const;

export type IndexedStep = RouteStep & { alongM: number };

/**
 * A route prepared for navigation: flat coordinates, cumulative distance at each
 * vertex, and each step's position along the route. `real` is false for the
 * stylized synthetic loop (no steps, not on streets) — it can be followed
 * roughly but not snapped to or rerouted from.
 */
export type RouteIndex = {
  key: string;
  coords: LngLat[];
  xy: XY[];
  cum: number[];
  totalM: number;
  proj: Projection;
  steps: IndexedStep[];
  real: boolean;
};

export type RoutePoint = { alongM: number; seg: number; x: number; y: number; distM: number };

export function buildRouteIndex(route: RouteGeometry, steps: RouteStep[], key = ''): RouteIndex {
  const coords = route.coordinates as LngLat[];
  const first = coords[0]!;
  const proj = makeProjection({ lng: first[0], lat: first[1] });
  const xy = coords.map((c) => proj.toXY(c));
  const cum = [0];
  for (let i = 1; i < xy.length; i++) cum.push(cum[i - 1]! + distXY(xy[i - 1]!, xy[i]!));

  const real = steps.length > 0;
  // Walks stored before the arrive step was kept end on the last turn; add a
  // virtual "arrive" so the final stretch still has something to count down to.
  const withArrive =
    real && steps[steps.length - 1]!.type !== MANEUVER.arrive
      ? [
          ...steps,
          {
            instruction: 'Arrive',
            distanceM: 0,
            wayName: null,
            type: MANEUVER.arrive,
            startIndex: coords.length - 1,
          },
        ]
      : steps;

  return {
    key,
    coords,
    xy,
    cum,
    totalM: cum[cum.length - 1]!,
    proj,
    steps: withArrive.map((s) => ({
      ...s,
      alongM: cum[clamp(s.startIndex, 0, coords.length - 1)]!,
    })),
    real,
  };
}

/** The segment containing `alongM` (binary search on the cumulative distances). */
function segmentAt(index: RouteIndex, alongM: number): number {
  const { cum } = index;
  let lo = 0;
  let hi = cum.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cum[mid]! <= alongM) lo = mid;
    else hi = mid - 1;
  }
  return Math.max(0, lo);
}

/** The point `alongM` metres along the route. */
export function pointAt(index: RouteIndex, alongM: number): { xy: XY; coord: Coord; seg: number } {
  const along = clamp(alongM, 0, index.totalM);
  const seg = segmentAt(index, along);
  const a = index.xy[seg]!;
  const b = index.xy[Math.min(seg + 1, index.xy.length - 1)]!;
  const len = index.cum[seg + 1]! - index.cum[seg]!;
  const t = len > 0 ? (along - index.cum[seg]!) / len : 0;
  const xy: XY = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  return { xy, coord: index.proj.toCoord(xy), seg };
}

/** Direction of travel at `alongM`, looking `aheadM` further along the route. */
export function bearingAlong(index: RouteIndex, alongM: number, aheadM: number): number {
  const from = pointAt(index, Math.min(alongM, index.totalM - 1)).xy;
  const to = pointAt(index, Math.min(alongM + aheadM, index.totalM)).xy;
  return distXY(from, to) < 0.5 ? bearingXY(index.xy[0]!, index.xy[1] ?? index.xy[0]!) : bearingXY(from, to);
}

/**
 * Nearest point on the route to `p` within [fromM, toM] of along-route
 * distance. Where the route passes the same spot more than once, near-ties
 * (within TIE_M) are broken by:
 * - `expectAlongM`: the match closest to where the walker should be by now —
 *   keeps the outbound pass at the mouth of an out-and-back spur, and picks the
 *   return pass once they've turned round;
 * - `preferAtLeastM`: the earliest match at or beyond that distance — so on a
 *   loop, a fix at the shared start/end resolves to the start when setting off.
 */
export function locate(
  index: RouteIndex,
  p: XY,
  opts: { fromM?: number; toM?: number; preferAtLeastM?: number; expectAlongM?: number } = {},
): RoutePoint | null {
  const fromM = opts.fromM ?? 0;
  const toM = opts.toM ?? index.totalM;
  const candidates: RoutePoint[] = [];
  for (let i = 0; i < index.xy.length - 1; i++) {
    const c0 = index.cum[i]!;
    const c1 = index.cum[i + 1]!;
    if (c1 < fromM || c0 > toM) continue;
    const r = projectOnSegment(p, index.xy[i]!, index.xy[i + 1]!);
    let along = c0 + r.t * (c1 - c0);
    let x = r.x;
    let y = r.y;
    let d = r.d;
    if (along < fromM || along > toM) {
      along = clamp(along, fromM, toM);
      [x, y] = pointAt(index, along).xy;
      d = Math.hypot(p[0] - x, p[1] - y);
    }
    candidates.push({ alongM: along, seg: i, x, y, distM: d });
  }
  if (candidates.length === 0) return null;

  let best = candidates[0]!;
  for (const c of candidates) if (c.distM < best.distM) best = c;

  if (opts.expectAlongM !== undefined) {
    const expect = opts.expectAlongM;
    let closest = best;
    for (const c of candidates) {
      if (c.distM > best.distM + TIE_M) continue;
      if (Math.abs(c.alongM - expect) < Math.abs(closest.alongM - expect)) closest = c;
    }
    return closest;
  }
  if (opts.preferAtLeastM === undefined) return best;

  let preferred: RoutePoint | null = null;
  for (const c of candidates) {
    if (c.distM > best.distM + TIE_M || c.alongM < opts.preferAtLeastM) continue;
    if (!preferred || c.alongM < preferred.alongM) preferred = c;
  }
  return preferred ?? best;
}

/**
 * Along-route position of each point, taken in order and searching forward from
 * the previous one (curiosities are listed in walking order).
 */
export function alongOfOrdered(index: RouteIndex, points: Coord[]): number[] {
  const out: number[] = [];
  let from = 0;
  for (const p of points) {
    const hit = locate(index, index.proj.toXY(p), { fromM: from });
    const along = hit?.alongM ?? from;
    out.push(along);
    from = along;
  }
  return out;
}
