import { describe, expect, it } from 'vitest';
import { haversineM } from '../lib/geo.js';
import { findSpurs, stopSpurs } from './spurs.js';

const origin = { lat: 51.5129, lng: -0.1224 };
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LNG = M_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180);
/** [lng, lat] `x` metres east and `y` metres north of the origin. */
const at = (x: number, y: number): [number, number] => [
  origin.lng + x / M_PER_DEG_LNG,
  origin.lat + y / M_PER_DEG_LAT,
];

describe('findSpurs', () => {
  it('finds an out-and-back up a side street and where it leaves the loop', () => {
    // Along a street east, up a 100 m side street to the waypoint, back down, on east.
    const coords = [at(0, 0), at(200, 0), at(200, 50), at(200, 100), at(200, 50), at(200, 0), at(400, 0)];
    const [spur] = findSpurs(coords, [0, 3, 6]);
    expect(spur).not.toBeNull();
    expect(spur!.spurM).toBeGreaterThanOrEqual(90);
    const [lng, lat] = at(200, 0);
    expect(haversineM(spur!.junction, { lat, lng })).toBeLessThan(10);
  });

  it('copes with the way back having different vertices', () => {
    const coords = [at(0, 0), at(200, 0), at(200, 100), at(200, 30), at(200, 0), at(400, 0)];
    const [spur] = findSpurs(coords, [0, 2, 5]);
    expect(spur?.spurM).toBeGreaterThanOrEqual(90);
  });

  it('reports nothing where the route passes straight through', () => {
    const coords = [at(0, 0), at(200, 0), at(200, 200), at(0, 200), at(0, 0)];
    expect(findSpurs(coords, [0, 2, 4])).toEqual([null]);
  });
});

describe('stopSpurs', () => {
  const coords = [at(0, 0), at(200, 0), at(200, 100), at(200, 0), at(400, 0)];
  const path = {
    geometry: { type: 'LineString' as const, coordinates: coords },
    steps: [],
    distanceM: 600,
    waypointIndices: [0, 2, 4],
  };

  it('marks a stop near the junction as reachable from the loop', () => {
    const [lng, lat] = at(210, 30);
    expect(stopSpurs(path, [{ lat, lng }])[0]?.reachable).toBe(true);
  });

  it('marks a stop far up the side street as unreachable', () => {
    const [lng, lat] = at(200, 100);
    expect(stopSpurs(path, [{ lat, lng }])[0]?.reachable).toBe(false);
  });

  it('does nothing without waypoint positions', () => {
    const [lng, lat] = at(200, 100);
    expect(stopSpurs({ ...path, waypointIndices: undefined }, [{ lat, lng }])).toEqual([null]);
  });
});
