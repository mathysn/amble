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

/** mm:ss for an elapsed duration given in milliseconds. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
