import * as Location from 'expo-location';
import type { Coord } from '@amble/shared';

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

/** Stream position updates during an active walk. Returns an unsubscribe fn. */
export async function watchLocation(onUpdate: (c: Coord) => void): Promise<() => void> {
  const sub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, distanceInterval: 8, timeInterval: 2000 },
    (pos) => onUpdate({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
  );
  return () => sub.remove();
}
