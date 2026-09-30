import type {
  Curiosity as PrismaCuriosity,
  Settings as PrismaSettings,
  Walk,
  WalkCuriosity,
} from '@prisma/client';
import type {
  Category,
  Curiosity,
  Pace,
  RouteGeometry,
  RouteSource,
  RouteStep,
  Settings,
  Units,
  Walk as WalkDto,
  WalkStatus,
  WalkSummary,
} from '@amble/shared';

export function toSettings(s: PrismaSettings): Settings {
  return {
    defaultLength: s.defaultLength,
    pace: s.pace as Pace,
    avoidBusyRoads: s.avoidBusyRoads,
    includeNiche: s.includeNiche,
    includeHidden: s.includeHidden,
    includeScenic: s.includeScenic,
    units: s.units as Units,
  };
}

export function toCuriosity(c: PrismaCuriosity): Curiosity {
  return {
    id: c.id,
    name: c.name,
    category: c.category as Category,
    blurb: c.blurb,
    lat: c.lat,
    lng: c.lng,
    era: c.era,
    neighbourhood: c.neighbourhood,
  };
}

type WalkWithStops = Walk & {
  curiosities: (WalkCuriosity & { curiosity: PrismaCuriosity })[];
};

export function toWalk(w: WalkWithStops): WalkDto {
  return {
    id: w.id,
    status: w.status as WalkStatus,
    startLat: w.startLat,
    startLng: w.startLng,
    endLat: w.endLat,
    endLng: w.endLng,
    endLabel: w.endLabel,
    plannedMinutes: w.plannedMinutes,
    distanceKm: w.distanceKm,
    startedAt: w.startedAt?.toISOString() ?? null,
    completedAt: w.completedAt?.toISOString() ?? null,
    createdAt: w.createdAt.toISOString(),
    route: JSON.parse(w.routeGeoJson) as RouteGeometry,
    steps: JSON.parse(w.stepsJson) as RouteStep[],
    source: w.source as RouteSource,
    curiosities: w.curiosities
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((link) => ({
        ...toCuriosity(link.curiosity),
        order: link.order,
        found: link.found,
        detourMin: link.detourMin,
        distanceM: link.distanceM,
      })),
  };
}

/** A friendly relative-ish label for a past walk, e.g. "Tuesday evening". */
function walkLabel(date: Date): string {
  const day = date.toLocaleDateString('en-GB', { weekday: 'long' });
  const hour = date.getHours();
  const partOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  return `${day} ${partOfDay}`;
}

export function toWalkSummary(w: WalkWithStops): WalkSummary {
  const found = w.curiosities.filter((c) => c.found).length;
  const when = w.completedAt ?? w.startedAt ?? w.createdAt;
  const durationMin =
    w.startedAt && w.completedAt
      ? Math.max(1, Math.round((w.completedAt.getTime() - w.startedAt.getTime()) / 60_000))
      : w.plannedMinutes;
  return {
    id: w.id,
    status: w.status as WalkStatus,
    label: walkLabel(when),
    durationMin,
    distanceKm: w.distanceKm,
    found,
    total: w.curiosities.length,
    route: JSON.parse(w.routeGeoJson) as RouteGeometry,
    completedAt: w.completedAt?.toISOString() ?? null,
  };
}
