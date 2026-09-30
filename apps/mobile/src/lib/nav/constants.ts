/**
 * Tuning for the navigation engine. Distances in metres, times in ms, speeds in
 * m/s. Walking pace is ~1.4 m/s, phone GPS is typically 5–15 m accurate in a
 * city, and a fix arrives roughly every second.
 */

// ── fix quality ──────────────────────────────────────────────────────────
/** Fixes worse than this only move the puck; they never change progress or off-route. */
export const MAX_ACCURACY_M = 40;
/** Snap the puck onto the route only when on-route and at least this accurate. */
export const SNAP_ACCURACY_M = 25;
/** Proximity reveals only trust fixes at least this accurate. */
export const REVEAL_ACCURACY_M = 50;

// ── progress tracking ────────────────────────────────────────────────────
/** How far back along the route a fix may land (GPS jitter, a step backwards). */
export const WINDOW_BACK_M = 30;
/** Minimum look-ahead window; grows with speed × time since the last fix. */
export const WINDOW_AHEAD_MIN_M = 80;
/** After a gap this long (screen off, tunnel), search the whole route again. */
export const GAP_MS = 30_000;
/** Among near-equal matches, distances within this are treated as a tie. */
export const TIE_M = 10;

// ── off-route ────────────────────────────────────────────────────────────
export const OFF_ROUTE_M = 35;
export const BACK_ON_ROUTE_M = 20;
export const OFF_ROUTE_MIN_FIXES = 3;
export const OFF_ROUTE_MIN_MS = 6_000;

// ── joining the route (start chosen by address, far from the walker) ─────
/** The walker "joins" once a fix is this close to the route (scaled by accuracy). */
export const JOIN_MIN_M = 25;
export const JOIN_MAX_M = 40;
/** Before joining, this far from the start (on 2 accurate fixes) asks for an approach route. */
export const APPROACH_REROUTE_M = 100;
export const APPROACH_MIN_FIXES = 2;

// ── arrival ──────────────────────────────────────────────────────────────
export const ARRIVE_M = 25;

// ── announcements ────────────────────────────────────────────────────────
export const PREPARE_M = 60;
/** Don't announce "in 60 m…" on steps shorter than this — the "now" cue is enough. */
export const PREPARE_MIN_STEP_M = 90;
export const NOW_M = 15;
/** Chain "…, then bear right" when the following maneuver is this close. */
export const CHAIN_M = 40;

// ── rerouting ────────────────────────────────────────────────────────────
export const REROUTE_MIN_GAP_MS = 20_000;
export const REROUTE_BACKOFF_MS = [20_000, 40_000, 60_000] as const;
export const NO_REROUTE_NEAR_END_M = 60;

// ── camera ───────────────────────────────────────────────────────────────
/** Heading-up follows the route this far ahead of the walker. */
export const CAMERA_LOOKAHEAD_M = 25;
/** Below this along-route speed, the camera follows the compass instead. */
export const MOVING_MPS = 0.6;
/** Ignore compass wobble smaller than this when standing still. */
export const COMPASS_DEADBAND_DEG = 10;
