import type { Units } from '@amble/shared';
import { CHAIN_M, NOW_M, PREPARE_M, PREPARE_MIN_STEP_M } from './constants';
import { MANEUVER, type IndexedStep } from './routeIndex';
import { maneuverPhrase, nowPhrase, preparePhrase } from './phrases';

export type HapticCue = 'left' | 'right' | 'arrive' | null;

export type Announcement = {
  key: string;
  stage: 'start' | 'prepare' | 'now';
  /** What to say; null = a silent cue (haptic only). */
  text: string | null;
  haptic: HapticCue;
};

/**
 * Keys already announced (reset whenever the route changes), steps already
 * mentioned as "…, then X", and when we last spoke.
 */
export type AnnouncerState = {
  routeKey: string;
  done: Record<string, true>;
  mentioned: Record<number, true>;
  lastSpokeT: number;
};

export const initAnnouncer = (routeKey = ''): AnnouncerState => ({
  routeKey,
  done: {},
  mentioned: {},
  lastSpokeT: -Infinity,
});

/** A turn already announced as "then X" isn't spoken again this soon after. */
const MENTIONED_QUIET_MS = 8_000;

/** Nothing to do at these: the walker just keeps going. */
const SILENT = new Set<number>([MANEUVER.straight, MANEUVER.depart]);

const LEFTISH = new Set<number>([
  MANEUVER.left,
  MANEUVER.sharpLeft,
  MANEUVER.slightLeft,
  MANEUVER.keepLeft,
  MANEUVER.uTurn,
]);
const RIGHTISH = new Set<number>([
  MANEUVER.right,
  MANEUVER.sharpRight,
  MANEUVER.slightRight,
  MANEUVER.keepRight,
]);

/** One tap for left-ish turns, two for right-ish, a success buzz on arrival. */
export function hapticFor(type: number | null): HapticCue {
  if (type === null) return null;
  if (type === MANEUVER.arrive) return 'arrive';
  if (LEFTISH.has(type)) return 'left';
  if (RIGHTISH.has(type)) return 'right';
  return null;
}

/**
 * Decide whether something should be said now. Each maneuver gets at most a
 * "prepare" cue (~60 m out, skipped on short steps) and a "now" cue (~15 m),
 * plus a one-off "start" cue for the first step. Kept calm on purpose: "carry
 * on" steps are skipped, and a turn already mentioned as "…, then X" only
 * buzzes if it comes right after. Pure: returns the new state.
 */
export function nextAnnouncement(
  state: AnnouncerState,
  ctx: {
    routeKey: string;
    steps: IndexedStep[];
    stepIndex: number;
    distToNextM: number | null;
    units: Units;
    /** ms timestamp, for spacing out speech */
    now?: number;
  },
): { state: AnnouncerState; announcement: Announcement | null } {
  const s = ctx.routeKey === state.routeKey ? state : initAnnouncer(ctx.routeKey);
  const now = ctx.now ?? 0;
  const next = (patch: Partial<AnnouncerState>, keys: string[]): AnnouncerState => ({
    ...s,
    ...patch,
    done: { ...s.done, ...Object.fromEntries(keys.map((k) => [k, true as const])) },
  });

  const current = ctx.steps[ctx.stepIndex];
  const upcoming = ctx.steps[ctx.stepIndex + 1];
  if (!current) return { state: s, announcement: null };

  // Setting off: say the first step once ("Set off along King Street").
  const startKey = `${s.routeKey}:0:start`;
  if (ctx.stepIndex === 0 && !s.done[startKey] && (ctx.distToNextM ?? 0) > PREPARE_M) {
    return {
      state: next({ lastSpokeT: now }, [startKey]),
      announcement: {
        key: startKey,
        stage: 'start',
        text: `${maneuverPhrase(current, { first: true })}.`,
        haptic: null,
      },
    };
  }

  if (!upcoming || ctx.distToNextM === null) return { state: s, announcement: null };
  const n = ctx.stepIndex + 1;
  const nowKey = `${s.routeKey}:${n}:now`;
  const prepareKey = `${s.routeKey}:${n}:prepare`;
  if (s.done[nowKey]) return { state: s, announcement: null };

  // Straight on / "depart" mid-route: nothing to announce.
  if (upcoming.type !== null && SILENT.has(upcoming.type)) {
    return { state: next({}, [nowKey, prepareKey]), announcement: null };
  }

  if (ctx.distToNextM <= NOW_M) {
    const after = ctx.steps[n + 1];
    const chain =
      after && after.type !== null && !SILENT.has(after.type) && after.alongM - upcoming.alongM <= CHAIN_M
        ? after
        : null;
    const quiet = !!s.mentioned[n] && now - s.lastSpokeT < MENTIONED_QUIET_MS;
    const mentioned = chain ? { ...s.mentioned, [n + 1]: true as const } : s.mentioned;
    const haptic = hapticFor(upcoming.type);
    if (quiet && !haptic) {
      return { state: next({ mentioned }, [nowKey, prepareKey]), announcement: null };
    }
    return {
      state: next({ mentioned, lastSpokeT: quiet ? s.lastSpokeT : now }, [nowKey, prepareKey]),
      announcement: {
        key: nowKey,
        stage: 'now',
        text: quiet ? null : nowPhrase(upcoming, chain),
        haptic,
      },
    };
  }

  const stepLength = upcoming.alongM - current.alongM;
  if (ctx.distToNextM <= PREPARE_M && stepLength >= PREPARE_MIN_STEP_M && !s.done[prepareKey]) {
    return {
      state: next({ lastSpokeT: now }, [prepareKey]),
      announcement: {
        key: prepareKey,
        stage: 'prepare',
        text: preparePhrase(upcoming, ctx.distToNextM, ctx.units),
        haptic: null,
      },
    };
  }

  return { state: s, announcement: null };
}
