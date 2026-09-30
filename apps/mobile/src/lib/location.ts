import * as Location from 'expo-location';
import type { Coord } from '@amble/shared';
import type { Fix } from './nav';

export type LocationResult = { granted: boolean; coord?: Coord };

/** Ask for foreground permission and read a single position. */
export async function requestLocation(): Promise<LocationResult> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return { granted: false };
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { granted: true, coord: { lat: pos.coords.latitude, lng: pos.coords.longitude } };
}

/** Read the current position only if permission was already granted. */
export async function getCurrentIfGranted(): Promise<Coord | null> {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== 'granted') return null;
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
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
