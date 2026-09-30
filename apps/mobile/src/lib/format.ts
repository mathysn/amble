import type { Units } from '@amble/shared';

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Distance in the user's units, e.g. "2.1 km" or "1.3 mi". */
export function formatDistance(km: number, units: Units = 'km'): string {
  if (units === 'mi') return `${(km * 0.621371).toFixed(1)} mi`;
  return `${km.toFixed(1)} km`;
}

/** A short metre/kilometre label for proximity, e.g. "60 m" or "1.2 km". */
export function formatMetres(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

/**
 * Navigation distance in the user's units, rounded the way a nav banner shows
 * it: "40 m" / "350 m" / "1.2 km", or "90 yd" / "0.4 mi".
 */
export function formatNavDistance(m: number, units: Units = 'km'): string {
  if (units === 'mi') {
    const mi = m / 1609.344;
    if (mi < 0.1) return `${Math.max(10, Math.round((m * 1.09361) / 10) * 10)} yd`;
    return `${mi.toFixed(1)} mi`;
  }
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

/** A walking duration, e.g. "38 min" or "1 h 5 min". */
export function formatDuration(minutes: number): string {
  const total = Math.max(1, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Clock time of arrival, e.g. "18:42". */
export function formatArrival(d: Date): string {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

/** mm:ss for an elapsed duration given in milliseconds. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
