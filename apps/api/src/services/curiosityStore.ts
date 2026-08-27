import type { Curiosity as PrismaCuriosity } from '@prisma/client';
import type { Category, Coord } from '@amble/shared';
import { prisma } from '../db.js';
import { haversineM } from '../lib/geo.js';
import { findCuriosities } from './osm.js';

/**
 * Bridges live OSM data with our local cache. Fetches nearby curiosities from
 * Overpass and upserts them, then returns everything we know within the radius
 * (freshly fetched + previously cached + seeded) so a walk can always be planned
 * even if Overpass is momentarily unavailable.
 */
export async function findCuriositiesNear(
  center: Coord,
  radiusM: number,
  categories: Category[],
): Promise<PrismaCuriosity[]> {
  // 1. Best-effort live fetch → upsert. Never let an OSM hiccup fail the walk.
  try {
    const found = await findCuriosities(center, radiusM, categories);
    for (const c of found) {
      await prisma.curiosity.upsert({
        where: { osmId: c.osmId },
        create: {
          source: 'osm',
          osmId: c.osmId,
          name: c.name,
          category: c.category,
          blurb: c.blurb,
          lat: c.lat,
          lng: c.lng,
          era: c.era,
          neighbourhood: c.neighbourhood,
          meta: JSON.stringify(c.meta),
        },
        update: { blurb: c.blurb, era: c.era, neighbourhood: c.neighbourhood },
      });
    }
  } catch (err) {
    // swallow — fall back to whatever's cached below
    console.warn('[osm] fetch failed, using cache:', (err as Error).message);
  }

  // 2. Return all known curiosities within a bounding box, filtered precisely.
  const degLat = radiusM / 111_320;
  const degLng = radiusM / (111_320 * Math.cos((center.lat * Math.PI) / 180) || 1);
  const rows = await prisma.curiosity.findMany({
    where: {
      category: { in: categories },
      lat: { gte: center.lat - degLat, lte: center.lat + degLat },
      lng: { gte: center.lng - degLng, lte: center.lng + degLng },
    },
    take: 200,
  });
  return rows.filter((r) => haversineM(center, { lat: r.lat, lng: r.lng }) <= radiusM);
}
