import { describe, expect, it } from 'vitest';
import type { Coord } from '@amble/shared';
import { haversineM } from '../lib/geo.js';
import { avoidPolygons, joinLegs, LEG_EXCLUDE_M, reusedFraction, routeLegs } from './legs.js';
import type { RouteOptions, Router, RoutedPath } from './routing.js';

const origin = { lat: 51.5129, lng: -0.1224 };
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LNG = M_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180);
/** [lng, lat] `x` metres east and `y` metres north of the origin. */
const at = (x: number, y: number): [number, number] => [
  origin.lng + x / M_PER_DEG_LNG,
  origin.lat + y / M_PER_DEG_LAT,
];
const coord = (x: number, y: number): Coord => {
  const [lng, lat] = at(x, y);
  return { lat, lng };
};

function leg(coords: [number, number][], distanceM: number): RoutedPath {
  return {
    geometry: { type: 'LineString', coordinates: coords },
    steps: [
      { instruction: 'Head off', distanceM, wayName: null, type: 11, startIndex: 0 },
      { instruction: 'Arrive', distanceM: 0, wayName: null, type: 10, startIndex: coords.length - 1 },
    ],
    distanceM,
  };
}

describe('joinLegs', () => {
  it('shares the vertex at each join, keeps one arrival, and offsets steps', () => {
    const joined = joinLegs([
      leg([at(0, 0), at(100, 0), at(200, 0)], 200),
      leg([at(200, 0), at(200, 100)], 100),
    ]);
    expect(joined.geometry.coordinates).toHaveLength(4);
    expect(joined.distanceM).toBe(300);
    expect(joined.waypointIndices).toEqual([0, 2, 3]);
    expect(joined.steps.map((s) => [s.type, s.startIndex])).toEqual([
      [11, 0],
      [11, 2],
      [10, 3],
    ]);
  });
});

describe('avoidPolygons', () => {
  it('covers a used street except near the points that must stay clear', () => {
    const polys = avoidPolygons([[at(0, 0), at(500, 0)]], [coord(0, 0)]);
    expect(polys.length).toBeGreaterThan(5);
    for (const [ring] of polys) {
      // closed rings, and none starting inside the cleared zone
      expect(ring![0]).toEqual(ring!.at(-1));
      const nearest = Math.min(...ring!.map(([lng, lat]) => haversineM({ lat, lng }, origin)));
      expect(nearest).toBeGreaterThan(LEG_EXCLUDE_M - 25);
    }
  });

  it('coarsens a long route instead of sending thousands of strips', () => {
    const long = Array.from({ length: 400 }, (_, i) => at(i * 25, (i % 2) * 5));
    expect(avoidPolygons([long], []).length).toBeLessThanOrEqual(150);
  });
});

describe('routeLegs', () => {
  const S = coord(0, 0);
  const P = coord(600, 0);

  /** Out along the street to P; back the same way unless told to avoid it, then round the block. */
  function blockRouter(options: (RouteOptions | undefined)[] = []): Router {
    return {
      async routeThrough(coords, opts) {
        options.push(opts);
        const [from, to] = coords as [Coord, Coord];
        if (haversineM(from, S) < 1) return leg([at(0, 0), at(300, 0), at(600, 0)], 600);
        if (opts?.avoid?.length) return leg([at(600, 0), at(600, 200), at(0, 200), at(0, 0)], 1000);
        void to;
        return leg([at(600, 0), at(300, 0), at(0, 0)], 600);
      },
      roundTrip: async () => {
        throw new Error('unused');
      },
    };
  }

  it('takes a different way back than the way out', async () => {
    const options: (RouteOptions | undefined)[] = [];
    const path = await routeLegs(blockRouter(options), [S, P, S]);
    expect(options[0]).toBeUndefined(); // nothing walked yet
    expect(options[1]?.avoid?.length).toBeGreaterThan(0);
    expect(reusedFraction(path.geometry.coordinates as [number, number][])).toBeLessThan(0.05);
  });

  it('goes back the same way when there is no other', async () => {
    let calls = 0;
    const router: Router = {
      async routeThrough(coords, opts) {
        calls++;
        if (opts?.avoid?.length) throw new Error('ORS 404: no route');
        return blockRouter().routeThrough(coords);
      },
      roundTrip: async () => {
        throw new Error('unused');
      },
    };
    const path = await routeLegs(router, [S, P, S]);
    expect(calls).toBe(3); // out, back (refused), back again without avoidance
    expect(reusedFraction(path.geometry.coordinates as [number, number][])).toBeGreaterThan(0.4);
  });
});

describe('reusedFraction', () => {
  it('is ~0 for a loop and ~0.5 for an out-and-back', () => {
    expect(reusedFraction([at(0, 0), at(300, 0), at(300, 300), at(0, 300), at(0, 0)])).toBeLessThan(0.01);
    const outAndBack = [at(0, 0), at(100, 0), at(200, 0), at(300, 0), at(200, 0), at(100, 0), at(0, 0)];
    expect(reusedFraction(outAndBack)).toBeGreaterThan(0.4);
  });
});
