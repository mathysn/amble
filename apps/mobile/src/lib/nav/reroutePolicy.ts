import type { RerouteStrategy } from '@amble/shared';
import { NO_REROUTE_NEAR_END_M, REROUTE_BACKOFF_MS, REROUTE_MIN_GAP_MS } from './constants';

export type ReroutePolicy = {
  lastAttemptT: number | null;
  failures: number;
  inFlight: boolean;
};

export const initReroutePolicy = (): ReroutePolicy => ({ lastAttemptT: null, failures: 0, inFlight: false });

/**
 * Should we ask the server for a new route right now, and which kind? Rerouting
 * costs an ORS call and redraws the walk, so it's throttled (≥20 s apart, backing
 * off after failures) and never happens when it can't help: paused, arrived,
 * screen not in front, nearly home, or on a synthetic route with no streets to
 * rejoin (that one is upgraded once, separately).
 */
export function shouldReroute(
  p: ReroutePolicy,
  ctx: {
    now: number;
    offRoute: boolean;
    approachNeeded: boolean;
    arrived: boolean;
    paused: boolean;
    focused: boolean;
    real: boolean;
    remainingM: number;
  },
): RerouteStrategy | null {
  if (p.inFlight || ctx.arrived || ctx.paused || !ctx.focused) return null;
  const gap =
    p.failures === 0
      ? REROUTE_MIN_GAP_MS
      : REROUTE_BACKOFF_MS[Math.min(p.failures, REROUTE_BACKOFF_MS.length) - 1]!;
  if (p.lastAttemptT !== null && ctx.now - p.lastAttemptT < gap) return null;
  if (ctx.approachNeeded) return 'approach';
  if (!ctx.real || !ctx.offRoute) return null;
  if (ctx.remainingM <= NO_REROUTE_NEAR_END_M) return null;
  return 'rejoin';
}

export const rerouteStarted = (p: ReroutePolicy, now: number): ReroutePolicy => ({
  ...p,
  lastAttemptT: now,
  inFlight: true,
});

export const rerouteFinished = (p: ReroutePolicy, ok: boolean): ReroutePolicy => ({
  ...p,
  inFlight: false,
  failures: ok ? 0 : p.failures + 1,
});
