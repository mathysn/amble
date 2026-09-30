import { FILTER_ACCEL_MPS2, GAP_MS, OUTLIER_MAX_REJECTS, OUTLIER_MPS } from './constants';
import { makeProjection, type Projection } from './geo';
import type { Fix } from './tracker';

/**
 * Smooths raw GPS fixes before anything else sees them. Phone GPS scatters a
 * few metres around the truth on every reading, which makes the walker's dot
 * shiver and can nudge progress and reveals. This is a small constant-velocity
 * Kalman filter per axis (in local metres): each reading is trusted in
 * proportion to its reported accuracy, and the walker is expected to keep
 * roughly the pace and direction they had, so a steady walk isn't dragged
 * behind. Readings that would mean a sudden sprint are dropped as glitches —
 * unless they keep coming, which means the walker really is over there.
 *
 * The reported accuracy is passed through unchanged, so every trust threshold
 * downstream (snapping, off-route, reveals) behaves as before.
 */

/** Position and velocity along one axis, with their covariance. */
type Axis = { p: number; v: number; pp: number; pv: number; vv: number };

export type FixFilterState = {
  proj: Projection;
  x: Axis;
  y: Axis;
  t: number;
  /** Consecutive readings dropped as outliers. */
  rejects: number;
} | null;

export const initFixFilter = (): FixFilterState => null;

function start(fix: Fix): NonNullable<FixFilterState> {
  const proj = makeProjection(fix);
  const r = fix.accuracy * fix.accuracy;
  const axis = (): Axis => ({ p: 0, v: 0, pp: r, pv: 0, vv: 4 });
  return { proj, x: axis(), y: axis(), t: fix.t, rejects: 0 };
}

/** Advance an axis by `dt` seconds of constant velocity plus random acceleration. */
function predict(a: Axis, dt: number): Axis {
  const q = FILTER_ACCEL_MPS2 * FILTER_ACCEL_MPS2;
  const dt2 = dt * dt;
  return {
    p: a.p + a.v * dt,
    v: a.v,
    pp: a.pp + 2 * dt * a.pv + dt2 * a.vv + (q * dt2 * dt2) / 4,
    pv: a.pv + dt * a.vv + (q * dt2 * dt) / 2,
    vv: a.vv + q * dt2,
  };
}

/** Fold in a position reading `z` with variance `r`. */
function correct(a: Axis, z: number, r: number): Axis {
  const s = a.pp + r;
  const kp = a.pp / s;
  const kv = a.pv / s;
  const innov = z - a.p;
  return {
    p: a.p + kp * innov,
    v: a.v + kv * innov,
    pp: (1 - kp) * a.pp,
    pv: (1 - kp) * a.pv,
    vv: a.vv - kv * a.pv,
  };
}

/**
 * Feed one raw fix. Returns the new state and the smoothed fix, or `fix: null`
 * when the reading was dropped as a glitch (the caller keeps the previous one).
 */
export function filterFix(s: FixFilterState, fix: Fix): { state: FixFilterState; fix: Fix | null } {
  const dtMs = s ? fix.t - s.t : Infinity;
  // First fix, or back after a long gap (screen off, tunnel): start over from it.
  if (!s || dtMs > GAP_MS) return { state: start(fix), fix };

  const dt = Math.max(0, dtMs) / 1000;
  const x = predict(s.x, dt);
  const y = predict(s.y, dt);
  const [zx, zy] = s.proj.toXY(fix);

  const jumpM = Math.hypot(zx - x.p, zy - y.p);
  if (jumpM > OUTLIER_MPS * Math.max(dt, 1) + fix.accuracy) {
    if (s.rejects < OUTLIER_MAX_REJECTS) return { state: { ...s, rejects: s.rejects + 1 }, fix: null };
    // Several in a row agree: the walker really moved. Trust the new place.
    return { state: start(fix), fix };
  }

  const r = fix.accuracy * fix.accuracy;
  const nx = correct(x, zx, r);
  const ny = correct(y, zy, r);
  const at = s.proj.toCoord([nx.p, ny.p]);
  return {
    state: { proj: s.proj, x: nx, y: ny, t: fix.t, rejects: 0 },
    fix: { ...fix, lat: at.lat, lng: at.lng },
  };
}
