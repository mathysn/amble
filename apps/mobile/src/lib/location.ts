import * as Location from 'expo-location';
import type { Coord } from '@amble/shared';
import type { Fix } from './nav';

export type LocateResult =
  | { status: 'ok'; coord: Coord }
  | { status: 'denied' }
  | { status: 'failed' };

/** How long to wait for a fresh fix before giving up (the walker can pick an address). */
const LOCATE_TIMEOUT_MS = 15_000;

/**
 * Find where the walker is, once: a recent last-known position if the phone has
 * one (instant), else a fresh fix (a few seconds, up to LOCATE_TIMEOUT_MS).
 * `ask` requests permission if it hasn't been granted; otherwise a missing
 * permission is just `denied`. Never throws.
 */
export async function locateOnce({ ask = false }: { ask?: boolean } = {}): Promise<LocateResult> {
  try {
    const perm = ask
      ? await Location.requestForegroundPermissionsAsync()
      : await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') return { status: 'denied' };

    const toCoord = (p: Location.LocationObject): LocateResult => ({
      status: 'ok',
      coord: { lat: p.coords.latitude, lng: p.coords.longitude },
    });
    const recent = await Location.getLastKnownPositionAsync({
      maxAge: 2 * 60_000,
      requiredAccuracy: 100,
    }).catch(() => null);
    if (recent) return toCoord(recent);

    const fresh = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), LOCATE_TIMEOUT_MS)),
    ]);
    return fresh ? toCoord(fresh) : { status: 'failed' };
  } catch {
    return { status: 'failed' };
  }
}

type Unsubscribe = () => void;

/**
 * Subscribe to an expo-location watcher from a React effect: returns a sync
 * unsubscribe that also works if the effect is torn down before the watcher's
 * promise resolves (the subscription is removed as soon as it arrives), and
 * reports failures (e.g. permission revoked) instead of rejecting unhandled.
 */
function subscribe(
  start: () => Promise<Location.LocationSubscription>,
  onError?: (err: unknown) => void,
): Unsubscribe {
  let cancelled = false;
  let sub: Location.LocationSubscription | null = null;
  start()
    .then((s) => {
      if (cancelled) s.remove();
      else sub = s;
    })
    .catch((err) => onError?.(err));
  return () => {
    cancelled = true;
    sub?.remove();
  };
}

/**
 * Stream GPS fixes for navigation: best accuracy, about once a second (Android)
 * or every couple of metres (iOS, which ignores `timeInterval`). GPS course and
 * speed are deliberately not used — Android reports 0 when unknown; the
 * navigation engine derives them from progress along the route instead.
 */
export function watchFixes(onFix: (f: Fix) => void, onError?: (err: unknown) => void): Unsubscribe {
  return subscribe(
    () =>
      Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 2, timeInterval: 1000 },
        (pos) =>
          onFix({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? 50,
            t: pos.timestamp,
          }),
        (reason) => onError?.(new Error(reason)),
      ),
    onError,
  );
}

/** Stream compass headings (degrees from true north when available, else magnetic). */
export function watchHeading(onHeading: (deg: number) => void, onError?: (err: unknown) => void): Unsubscribe {
  return subscribe(
    () =>
      Location.watchHeadingAsync((h) => {
        const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
        if (Number.isFinite(deg) && deg >= 0) onHeading(deg);
      }),
    onError,
  );
}
