import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  PACE_METRES_PER_MIN,
  type Pace,
  type RerouteStrategy,
  type Units,
  type Walk,
  type WalkCuriosity,
} from '@amble/shared';
import { qk, useReroute } from '../api/hooks';
import { ApiError } from '../api/client';
import { routeSignature, type LngLat } from '../lib/map/bridge';
import {
  bearingAlong,
  bearingDeg,
  buildRouteIndex,
  cameraBearing,
  CAMERA_LOOKAHEAD_M,
  haversineM,
  initAnnouncer,
  initReroutePolicy,
  initTracker,
  MAX_ACCURACY_M,
  navView,
  nextAnnouncement,
  REVEAL_ACCURACY_M,
  rerouteFinished,
  rerouteStarted,
  shouldReroute,
  updateTracker,
  type Fix,
  type NavView,
  type RouteIndex,
  type TrackerState,
} from '../lib/nav';
import { speak, stopSpeaking } from '../lib/voice';
import { turnCue, warning } from '../lib/haptics';

/** A curiosity is revealed when the walker gets this close. */
export const REVEAL_THRESHOLD_M = 60;

/**
 * What the banner is doing:
 * - finding — no GPS fix yet
 * - approach — not on the route yet; pointing to the start
 * - navigating — turn-by-turn
 * - rerouting — asking the server for a new way
 * - rejoin — off the route and no new route (yet): pointing back to it
 * - compass — a synthetic walk (no streets): pointing to the next curiosity / home
 * - paused, arrived
 */
export type NavStatus =
  | 'finding'
  | 'approach'
  | 'navigating'
  | 'rerouting'
  | 'rejoin'
  | 'compass'
  | 'paused'
  | 'arrived';

export type Navigation = {
  status: NavStatus;
  index: RouteIndex | null;
  tracker: TrackerState | null;
  view: NavView | null;
  /** Map bearing for the follow camera. */
  cameraBearing: number;
  /** For approach / rejoin / compass: absolute bearing and distance to aim for. */
  pointer: { bearing: number; distM: number } | null;
  remainingM: number | null;
  etaMin: number | null;
  nextCuriosity: WalkCuriosity | null;
  nextCuriosityM: number | null;
};

type Options = {
  walk: Walk | undefined;
  fix: Fix | null;
  compass: number | null;
  units: Units;
  pace: Pace;
  /** The walk screen is in front (no modal on top). */
  focused: boolean;
  muted: boolean;
  revealedIds: string[];
  onReveal: (c: WalkCuriosity) => void;
};

/**
 * The live navigation session for the walk screen: feeds fixes through the
 * tracker, speaks and buzzes turn cues, reroutes when the walker strays (per
 * the policy's throttling), reveals curiosities by proximity, and works out
 * where the camera should face. Everything that makes noise or costs a request
 * is frozen while the walk is paused or another screen is on top.
 */
export function useNavigation(o: Options): Navigation {
  const { walk, fix, compass, units, pace, focused, muted, revealedIds, onReveal } = o;
  const qc = useQueryClient();
  const reroute = useReroute();
  const paused = walk?.status === 'paused';

  const coords = walk?.route.coordinates as LngLat[] | undefined;
  const routeKey = useMemo(() => (coords ? routeSignature(coords) : ''), [coords]);
  const index = useMemo(
    () => (walk ? buildRouteIndex(walk.route, walk.steps, routeKey) : null),
    // steps only ever change together with the route
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routeKey],
  );

  // ── tracker ────────────────────────────────────────────────────────────
  const [tracker, setTracker] = useState<{ key: string; state: TrackerState } | null>(null);
  /** Where to resume on the next route, set when a reroute is requested. */
  const seed = useRef<{ fromKey: string; alongIndex: number } | null>(null);

  useEffect(() => {
    if (!index) return;
    setTracker((prev) => {
      let t = prev;
      if (!t || t.key !== index.key) {
        const s = seed.current;
        seed.current = null;
        const resume = s && t && s.fromKey === t.key;
        t = {
          key: index.key,
          state: initTracker(
            index,
            resume
              ? { fromAlongM: index.cum[Math.min(s.alongIndex, index.cum.length - 1)]!, joined: true }
              : {},
          ),
        };
      }
      if (fix && fix !== t.state.lastFix) t = { key: t.key, state: updateTracker(index, t.state, fix) };
      return t;
    });
  }, [index, fix]);

  const state = tracker && index && tracker.key === index.key ? tracker.state : null;
  const view = useMemo(() => (index && state ? navView(index, state) : null), [index, state]);

  // ── voice + haptic cues ────────────────────────────────────────────────
  const announcer = useRef(initAnnouncer());
  useEffect(() => {
    if (!index || !state || !view || !index.real) return;
    if (!state.joined || state.offRoute || paused || !focused) return;
    const r = nextAnnouncement(announcer.current, {
      routeKey: index.key,
      steps: index.steps,
      stepIndex: view.stepIndex,
      distToNextM: view.distToNextM,
      units,
      now: Date.now(),
    });
    // Advance even while muted, so un-muting doesn't replay a backlog.
    announcer.current = r.state;
    if (!r.announcement) return;
    if (!muted && r.announcement.text) speak(r.announcement.text, r.announcement.stage === 'now');
    turnCue(r.announcement.haptic);
  }, [index, state, view, paused, focused, muted, units]);

  useEffect(() => {
    if (muted || paused || !focused) stopSpeaking();
  }, [muted, paused, focused]);
  useEffect(() => () => stopSpeaking(), []);

  // A buzz when leaving the route.
  const wasOff = useRef(false);
  useEffect(() => {
    const off = !!state?.offRoute;
    if (off && !wasOff.current && !paused && focused) warning();
    wasOff.current = off;
  }, [state?.offRoute, paused, focused]);

  // ── rerouting ──────────────────────────────────────────────────────────
  const policy = useRef(initReroutePolicy());
  const [rerouting, setRerouting] = useState(false);
  const upgradeTried = useRef<string | null>(null);

  useEffect(() => {
    if (!walk || !index || !state || !view || !fix || fix.accuracy > MAX_ACCURACY_M) return;
    if (policy.current.inFlight) return;
    const now = Date.now();
    let strategy: RerouteStrategy | null = shouldReroute(policy.current, {
      now,
      offRoute: state.offRoute,
      approachNeeded: view.approachNeeded,
      arrived: state.arrived,
      paused,
      focused,
      real: index.real,
      remainingM: view.remainingM,
    });
    let fromIndex: number | undefined;
    if (strategy === 'rejoin') {
      fromIndex = state.seg;
    } else if (!strategy && !index.real && upgradeTried.current !== walk.id && !paused && focused) {
      // A synthetic walk gets one try at becoming a real, street-following one.
      upgradeTried.current = walk.id;
      strategy = 'rejoin';
    }
    if (!strategy) return;

    policy.current = rerouteStarted(policy.current, now);
    // After a rejoin, the new route is prefix (0..seg) + path from here: resume at seg + 1.
    seed.current = { fromKey: index.key, alongIndex: fromIndex !== undefined ? fromIndex + 1 : 0 };
    setRerouting(true);
    reroute.mutate(
      {
        walkId: walk.id,
        body: { lat: fix.lat, lng: fix.lng, strategy, fromIndex, coordsCount: index.coords.length },
      },
      {
        onSuccess: () => {
          policy.current = rerouteFinished(policy.current, true);
          setRerouting(false);
        },
        onError: (err) => {
          seed.current = null;
          policy.current = rerouteFinished(policy.current, false);
          setRerouting(false);
          if (err instanceof ApiError && err.status === 409) {
            void qc.invalidateQueries({ queryKey: qk.walk(walk.id) });
          }
        },
      },
    );
    // Deliberately driven by tracker updates only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // ── reveals ────────────────────────────────────────────────────────────
  const revealRef = useRef(onReveal);
  revealRef.current = onReveal;
  useEffect(() => {
    if (!walk || !fix || paused || !focused || walk.status !== 'active') return;
    if (fix.accuracy > REVEAL_ACCURACY_M) return;
    const near = walk.curiosities.find(
      (c) => !c.found && !revealedIds.includes(c.id) && haversineM(fix, c) <= REVEAL_THRESHOLD_M,
    );
    if (near) revealRef.current(near);
  }, [walk, fix, paused, focused, revealedIds]);

  // ── camera & pointers ──────────────────────────────────────────────────
  const prevCamera = useRef(0);
  const camera = useMemo(() => {
    if (!index || !state) return prevCamera.current;
    const onRoute = state.joined && !state.offRoute && index.real;
    return cameraBearing({
      onRoute,
      speedMps: state.speedMps,
      routeBearing: onRoute ? bearingAlong(index, state.alongM, CAMERA_LOOKAHEAD_M) : null,
      compass,
      prev: prevCamera.current,
    });
  }, [index, state, compass]);
  useEffect(() => {
    prevCamera.current = camera;
  }, [camera]);

  const nextCuriosity = walk?.curiosities.find((c) => !c.found) ?? null;
  const nextCuriosityM = nextCuriosity && fix ? haversineM(fix, nextCuriosity) : null;

  let status: NavStatus;
  let pointer: Navigation['pointer'] = null;
  if (!walk || !index || !state || !fix) status = 'finding';
  else if (paused) status = 'paused';
  else if (state.arrived) status = 'arrived';
  else if (!state.joined && view?.toStart) {
    status = 'approach';
    pointer = { bearing: view.toStart.bearing, distM: view.toStart.distM };
  } else if (!index.real) {
    status = 'compass';
    const target = nextCuriosity ?? { lat: walk.startLat, lng: walk.startLng };
    pointer = { bearing: bearingDeg(fix, target), distM: haversineM(fix, target) };
  } else if (rerouting) status = 'rerouting';
  else if (state.offRoute) {
    status = 'rejoin';
    pointer = { bearing: bearingDeg(fix, state.snapped), distM: state.offDistM };
  } else status = 'navigating';

  const remainingM = view?.remainingM ?? null;
  const etaMin = remainingM !== null ? remainingM / PACE_METRES_PER_MIN[pace] : null;

  return {
    status,
    index,
    tracker: state,
    view,
    cameraBearing: camera,
    pointer,
    remainingM,
    etaMin,
    nextCuriosity,
    nextCuriosityM,
  };
}
