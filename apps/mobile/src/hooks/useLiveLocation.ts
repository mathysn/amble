import { useEffect, useRef, useState } from 'react';
import type { RouteGeometry } from '@amble/shared';
import { watchFixes, watchHeading } from '../lib/location';
import { angleDiff, bearingDeg, buildRouteIndex, simulateWalk, smoothHeading, type Fix } from '../lib/nav';

/** Compass updates are smoothed, then passed on at most this often… */
const HEADING_MIN_MS = 250;
/** …and only when they've turned at least this much. */
const HEADING_MIN_DEG = 3;
/** The dev simulation walks at a brisk jog so a whole loop fits in a few minutes. */
const SIM_SPEED_MPS = 4;

export type LiveLocation = {
  fix: Fix | null;
  /** Smoothed compass heading, degrees; null until the first reading. */
  heading: number | null;
  error: string | null;
};

/**
 * The walker's live position and compass heading while navigating. In dev
 * builds, `simulate` replays a fake walk of that route instead (one fix per
 * second, with a detour a third of the way round to exercise rerouting).
 */
export function useLiveLocation({
  enabled,
  simulate,
}: {
  enabled: boolean;
  simulate?: RouteGeometry | null;
}): LiveLocation {
  const [fix, setFix] = useState<Fix | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const smoothed = useRef<number | null>(null);
  const lastEmit = useRef({ t: 0, deg: -1000 });
  const onHeading = useRef((raw: number) => {
    const deg = smoothHeading(smoothed.current, raw);
    smoothed.current = deg;
    const now = Date.now();
    if (now - lastEmit.current.t < HEADING_MIN_MS) return;
    if (Math.abs(angleDiff(deg, lastEmit.current.deg)) < HEADING_MIN_DEG) return;
    lastEmit.current = { t: now, deg };
    setHeading(deg);
  }).current;

  const simulating = !!simulate;
  // The simulation follows the route it was started on, even after a reroute.
  const simRoute = useRef<RouteGeometry | null>(null);
  if (!simulating) simRoute.current = null;
  else if (!simRoute.current) simRoute.current = simulate ?? null;

  useEffect(() => {
    if (!enabled || simulating) return;
    setError(null);
    const stopFixes = watchFixes(setFix, (e) => setError(e instanceof Error ? e.message : String(e)));
    const stopHeading = watchHeading(onHeading);
    return () => {
      stopFixes();
      stopHeading();
    };
  }, [enabled, simulating, onHeading]);

  useEffect(() => {
    const route = simRoute.current;
    if (!enabled || !simulating || !route) return;
    const totalM = buildRouteIndex(route, []).totalM;
    const fixes = simulateWalk(route, {
      speedMps: SIM_SPEED_MPS,
      detour: { atM: totalM * 0.33, lengthM: Math.min(220, totalM * 0.1), offsetM: 70 },
      seed: Date.now() & 0xffff,
    });
    let i = 0;
    let prev: Fix | null = null;
    const timer = setInterval(() => {
      const f = fixes[i++];
      if (!f) return clearInterval(timer);
      const now: Fix = { ...f, t: Date.now() };
      if (prev) onHeading(bearingDeg(prev, now));
      prev = now;
      setFix(now);
    }, 1000);
    return () => clearInterval(timer);
  }, [enabled, simulating, onHeading]);

  return { fix, heading, error };
}
