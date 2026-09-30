import type { Coord } from '@amble/shared';
import {
  APPROACH_MIN_FIXES,
  APPROACH_REROUTE_M,
  ARRIVE_M,
  BACK_ON_ROUTE_M,
  GAP_MS,
  JOIN_MAX_M,
  JOIN_MIN_M,
  MAX_ACCURACY_M,
  OFF_ROUTE_M,
  OFF_ROUTE_MIN_FIXES,
  OFF_ROUTE_MIN_MS,
  SNAP_ACCURACY_M,
  WINDOW_AHEAD_MIN_M,
  WINDOW_BACK_M,
} from './constants';
import { bearingDeg, haversineM } from './geo';
import { locate, pointAt, type IndexedStep, type RouteIndex } from './routeIndex';

/** One GPS reading. `t` is ms since epoch. */
export type Fix = { lat: number; lng: number; accuracy: number; t: number };

export type TrackerState = {
  /** Metres along the route — only moves with on-route, accurate fixes. */
  alongM: number;
  /** Segment (= index of the vertex at or before `alongM`). */
  seg: number;
  /** The on-route point at `alongM`. */
  snapped: Coord;
  /** Where to draw the walker: snapped when confidently on-route, else the raw fix. */
  display: Coord | null;
  accuracy: number;
  lastFix: Fix | null;
  /** Time of the last fix accurate enough to move progress. */
  lastGoodT: number | null;
  /** Distance from the route of the last accurate fix. */
  offDistM: number;
  offRoute: boolean;
  offStreak: { count: number; since: number } | null;
  /** Along-route speed, smoothed. */
  speedMps: number;
  /** False until the walker first reaches the route. */
  joined: boolean;
  approachStreak: number;
  arrived: boolean;
};

/** Everything the UI needs, derived from the state. */
export type NavView = {
  /** Index into `index.steps` of the step being walked. */
  stepIndex: number;
  /** The next maneuver (turn / arrive), if any. */
  next: IndexedStep | null;
  /** Along-route metres to `next`. */
  distToNextM: number | null;
  remainingM: number;
  /** Before joining: how far and which way the start is. */
  toStart: { distM: number; bearing: number } | null;
  /** Two accurate fixes far from the start before joining: ask for an approach route. */
  approachNeeded: boolean;
};

export function initTracker(index: RouteIndex, opts: { fromAlongM?: number; joined?: boolean } = {}): TrackerState {
  const alongM = opts.fromAlongM ?? 0;
  const at = pointAt(index, alongM);
  return {
    alongM,
    seg: at.seg,
    snapped: at.coord,
    display: null,
    accuracy: 0,
    lastFix: null,
    lastGoodT: null,
    offDistM: 0,
    offRoute: false,
    offStreak: null,
    speedMps: 0,
    joined: opts.joined ?? false,
    approachStreak: 0,
    arrived: false,
  };
}

/** Advance the tracker by one GPS fix. Pure: returns a new state. */
export function updateTracker(index: RouteIndex, s: TrackerState, fix: Fix): TrackerState {
  const here: Coord = { lat: fix.lat, lng: fix.lng };
  const base = { ...s, lastFix: fix, display: here, accuracy: fix.accuracy };

  // Poor fixes move the puck but decide nothing.
  if (fix.accuracy > MAX_ACCURACY_M) return base;

  const p = index.proj.toXY(here);

  // ── not on the route yet: join wherever the walker first meets it ───────
  // Usually the start; mid-route after an app reload during a walk. Near-ties
  // go to the earliest point, so a loop's shared start/end resolves to the start.
  if (!s.joined) {
    const head = locate(index, p, { preferAtLeastM: 0 });
    const joinWithin = Math.max(JOIN_MIN_M, Math.min(fix.accuracy, JOIN_MAX_M));
    if (!head || head.distM > joinWithin) {
      const start = pointAt(index, 0).coord;
      const far = haversineM(here, start) > APPROACH_REROUTE_M;
      return { ...base, lastGoodT: fix.t, approachStreak: far ? s.approachStreak + 1 : 0 };
    }
    const at = pointAt(index, head.alongM);
    return {
      ...base,
      joined: true,
      approachStreak: 0,
      alongM: head.alongM,
      seg: at.seg,
      snapped: at.coord,
      lastGoodT: fix.t,
      offDistM: head.distM,
      display: snapDisplay(at.coord, here, head.distM, fix.accuracy, false),
    };
  }

  // ── on the route: search near where we were ─────────────────────────────
  const dt = s.lastGoodT === null ? Infinity : fix.t - s.lastGoodT;
  let hit;
  if (dt > GAP_MS) {
    hit = locate(index, p, { preferAtLeastM: s.alongM - WINDOW_BACK_M });
  } else {
    const ahead = Math.max(WINDOW_AHEAD_MIN_M, 3 * Math.max(s.speedMps, 1.5) * (dt / 1000) + fix.accuracy);
    // Where the way out and the way back share a street, the walker is on the
    // pass that matches where they should be by now at their current pace.
    hit = locate(index, p, {
      fromM: s.alongM - WINDOW_BACK_M,
      toM: s.alongM + ahead,
      expectAlongM: s.alongM + Math.max(s.speedMps, 1) * (dt / 1000),
    });
    // Clearly on a later part of the route (a shortcut): accept it.
    if (hit && hit.distM > OFF_ROUTE_M) {
      const anywhere = locate(index, p, { preferAtLeastM: s.alongM });
      if (anywhere && anywhere.distM <= BACK_ON_ROUTE_M && anywhere.alongM > s.alongM) hit = anywhere;
    }
  }
  if (!hit) return base;

  // Off-route hysteresis: several fixes over several seconds to leave, a clear return to rejoin.
  let offRoute = s.offRoute;
  let offStreak = s.offStreak;
  if (index.real) {
    if (!offRoute) {
      if (hit.distM > OFF_ROUTE_M) {
        const streak = offStreak ?? { count: 0, since: fix.t };
        offStreak = { count: streak.count + 1, since: streak.since };
        offRoute = offStreak.count >= OFF_ROUTE_MIN_FIXES && fix.t - offStreak.since >= OFF_ROUTE_MIN_MS;
      } else {
        offStreak = null;
      }
    } else if (hit.distM < BACK_ON_ROUTE_M) {
      offRoute = false;
      offStreak = null;
    }
  }

  // Progress only follows fixes that are actually on the route.
  const onRoute = hit.distM <= OFF_ROUTE_M || !index.real;
  const alongM = onRoute && !offRoute ? hit.alongM : s.alongM;
  const at = pointAt(index, alongM);

  let speedMps = s.speedMps;
  if (Number.isFinite(dt) && dt > 0 && dt <= GAP_MS) {
    const inst = Math.max(0, (alongM - s.alongM) / (dt / 1000));
    speedMps = 0.7 * s.speedMps + 0.3 * Math.min(inst, 5);
  }

  return {
    ...base,
    alongM,
    seg: at.seg,
    snapped: at.coord,
    lastGoodT: fix.t,
    offDistM: hit.distM,
    offRoute,
    offStreak,
    speedMps,
    arrived: s.arrived || (index.totalM > 2 * ARRIVE_M && index.totalM - alongM <= ARRIVE_M),
    display: index.real ? snapDisplay(at.coord, here, hit.distM, fix.accuracy, offRoute) : here,
  };
}

function snapDisplay(snapped: Coord, raw: Coord, distM: number, accuracy: number, offRoute: boolean): Coord {
  return !offRoute && distM <= OFF_ROUTE_M && accuracy <= SNAP_ACCURACY_M ? snapped : raw;
}

/** Derive what the UI shows from the tracker state. */
export function navView(index: RouteIndex, s: TrackerState): NavView {
  const remainingM = Math.max(0, index.totalM - s.alongM);

  let stepIndex = 0;
  for (let i = 0; i < index.steps.length; i++) {
    if (index.steps[i]!.alongM <= s.alongM + 1) stepIndex = i;
    else break;
  }
  const next = index.steps[stepIndex + 1] ?? null;

  let toStart: NavView['toStart'] = null;
  if (!s.joined && s.lastFix) {
    const here = { lat: s.lastFix.lat, lng: s.lastFix.lng };
    const start = pointAt(index, 0).coord;
    toStart = { distM: haversineM(here, start), bearing: bearingDeg(here, start) };
  }

  return {
    stepIndex,
    next,
    distToNextM: next ? Math.max(0, next.alongM - s.alongM) : null,
    remainingM,
    toStart,
    approachNeeded: !s.joined && s.approachStreak >= APPROACH_MIN_FIXES,
  };
}
