import type { Coord, RouteGeometry, RouteStep } from '@amble/shared';
import { haversineM } from './geo';

export type CurrentManeuver = {
  instruction: string;
  wayName: string | null;
  distanceToTurnM: number;
};

/**
 * Given the walker's position, the route geometry and its turn-by-turn steps,
 * work out the upcoming maneuver and how far off it is. Returns null when there
 * are no steps (e.g. a stylized synthetic route) so callers can fall back.
 */
export function currentManeuver(
  position: Coord,
  route: RouteGeometry,
  steps: RouteStep[],
): CurrentManeuver | null {
  if (steps.length === 0 || route.coordinates.length < 2) return null;

  // Nearest route vertex to where we are.
  let nearest = 0;
  let best = Infinity;
  route.coordinates.forEach(([lng, lat], i) => {
    const d = haversineM(position, { lat, lng });
    if (d < best) {
      best = d;
      nearest = i;
    }
  });

  // The step we're currently on = last one that has already started.
  let cur = 0;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i]!.startIndex <= nearest) cur = i;
    else break;
  }

  // Show the *upcoming* maneuver (the next step), or the final one if we're on it.
  const upcoming = steps[cur + 1] ?? steps[cur]!;
  const turn = route.coordinates[upcoming.startIndex] ?? route.coordinates.at(-1)!;
  return {
    instruction: upcoming.instruction,
    wayName: upcoming.wayName,
    distanceToTurnM: Math.round(haversineM(position, { lat: turn[1], lng: turn[0] })),
  };
}
