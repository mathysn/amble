import { describe, expect, it } from 'vitest';
import type { Coord, RouteStep } from '@amble/shared';
import type { RouteOptions, Router, RoutedPath } from './routing.js';
import {
  planReroute,
  RoutingUnavailableError,
  orderedNearestIndices,
  type RerouteInput,
} from './reroute.js';

/** Straight-line fake: one step per leg plus a final arrive, capturing the waypoints. */
function fakeRouter(calls: Coord[][] = [], options: (RouteOptions | undefined)[] = []): Router {
  return {
    async routeThrough(coords, opts) {
      calls.push(coords);
      options.push(opts);
      const steps: RouteStep[] = coords.slice(0, -1).map((_, i) => ({
        instruction: `leg ${i}`,
        distanceM: 100,
        wayName: null,
        type: i === 0 ? 11 : 6,
        startIndex: i,
      }));
      steps.push({
        instruction: 'Arrive',
        distanceM: 0,
        wayName: null,
        type: 10,
        startIndex: coords.length - 1,
      });
      const path: RoutedPath = {
        geometry: { type: 'LineString', coordinates: coords.map((c) => [c.lng, c.lat]) },
        steps,
        distanceM: 1000,
      };
      return path;
    },
    async roundTrip() {
      throw new Error('unused');
    },
  };
}

const failingRouter: Router = {
  routeThrough: async () => {
    throw new Error('ORS 500');
  },
  roundTrip: async () => {
    throw new Error('ORS 500');
  },
};

// A square-ish loop: start (0) → A (2) → B (4) → C (6) → start (8), 0.001° ≈ 70–110 m.
const start = { lat: 51.5, lng: -0.12 };
const coords: [number, number][] = [
  [-0.12, 51.5],
  [-0.119, 51.5],
  [-0.118, 51.5],
  [-0.118, 51.501],
  [-0.118, 51.502],
  [-0.119, 51.502],
  [-0.12, 51.502],
  [-0.12, 51.501],
  [-0.12, 51.5],
];
const A = { lat: 51.5, lng: -0.118, order: 1, found: false };
const B = { lat: 51.502, lng: -0.118, order: 2, found: false };
const C = { lat: 51.502, lng: -0.12, order: 3, found: false };

/** The waypoints a leg-by-leg route went through: each leg's start, then the last leg's end. */
const visited = (calls: Coord[][]) => [calls[0]![0], ...calls.map((c) => c.at(-1))];

function input(over: Partial<RerouteInput> = {}): RerouteInput {
  return {
    route: { type: 'LineString', coordinates: coords },
    steps: [
      { instruction: 'Head east', distanceM: 140, wayName: null, type: 11, startIndex: 0 },
      { instruction: 'Turn left', distanceM: 220, wayName: null, type: 0, startIndex: 2 },
      { instruction: 'Arrive', distanceM: 0, wayName: null, type: 10, startIndex: 8 },
    ],
    source: 'through',
    start,
    here: { lat: 51.5012, lng: -0.1172 }, // just off the east side
    curiosities: [C, A, B], // deliberately unsorted
    distanceKm: 0.9,
    strategy: 'rejoin',
    fromIndex: 3,
    router: fakeRouter(),
    ...over,
  };
}

describe('orderedNearestIndices', () => {
  it('follows the route order, so a point at the start maps to the loop end when it comes last', () => {
    expect(orderedNearestIndices(coords, [A, B, start])).toEqual([2, 4, 8]);
  });
});

describe('planReroute — rejoin', () => {
  it('keeps the walked prefix and routes through what is still ahead, then home', async () => {
    const calls: Coord[][] = [];
    const plan = await planReroute(input({ router: fakeRouter(calls) }));

    // A (index 2) is behind fromIndex 3; B and C are ahead, in order, one leg each.
    expect(calls.every((c) => c.length === 2)).toBe(true);
    expect(visited(calls)).toEqual([
      { lat: 51.5012, lng: -0.1172 },
      { lat: B.lat, lng: B.lng },
      { lat: C.lat, lng: C.lng },
      start,
    ]);
    // prefix (4 vertices) + new path (4 vertices)
    expect(plan.route.coordinates).toHaveLength(8);
    expect(plan.route.coordinates.slice(0, 4)).toEqual(coords.slice(0, 4));
    // steps are shifted past the prefix
    expect(plan.steps[0]!.startIndex).toBe(4);
    expect(plan.steps.at(-1)!.type).toBe(10);
    expect(plan.steps.at(-1)!.startIndex).toBe(7);
    expect(plan.source).toBe('through');
    // prefix (~250 m) + join (~60 m) + 3 legs (1000 m each), to 0.1 km
    expect(plan.distanceKm).toBe(3.3);
  });

  it('skips curiosities already found', async () => {
    const calls: Coord[][] = [];
    await planReroute(
      input({ router: fakeRouter(calls), curiosities: [A, { ...B, found: true }, C] }),
    );
    expect(visited(calls)).toHaveLength(3); // here, C, start
  });

  it('goes straight home when nothing is left', async () => {
    const calls: Coord[][] = [];
    await planReroute(input({ router: fakeRouter(calls), fromIndex: 7 }));
    expect(visited(calls)).toEqual([{ lat: 51.5012, lng: -0.1172 }, start]);
  });

  it('without fromIndex, re-plans the whole walk from here', async () => {
    const calls: Coord[][] = [];
    const plan = await planReroute(input({ router: fakeRouter(calls), fromIndex: undefined }));
    // First pass: here, A, B, C, start (the fake's sharp V at A then earns a junction re-route).
    expect(visited(calls.slice(0, 4))).toEqual(
      [{ lat: 51.5012, lng: -0.1172 }, A, B, C, start].map(({ lat, lng }) => ({ lat, lng })),
    );
    expect(plan.steps[0]!.startIndex).toBe(0);
  });

  it('upgrades a synthetic walk to a real one (approach is treated as rejoin)', async () => {
    const calls: Coord[][] = [];
    const plan = await planReroute(
      input({ router: fakeRouter(calls), source: 'synthetic', steps: [], strategy: 'approach' }),
    );
    expect(plan.source).toBe('through');
    expect(visited(calls.slice(0, 4))).toHaveLength(5);
    expect(plan.route.coordinates).toHaveLength(5); // no prefix for synthetic
  });

  it('heads for the end point of an A→B walk', async () => {
    const calls: Coord[][] = [];
    const finish = { lat: 51.51, lng: -0.11 };
    await planReroute(input({ router: fakeRouter(calls), finish }));
    expect(visited(calls).at(-1)).toEqual(finish);
  });

  it('keeps off the streets already walked', async () => {
    const calls: Coord[][] = [];
    const options: (RouteOptions | undefined)[] = [];
    await planReroute(input({ router: fakeRouter(calls, options) }));
    expect(options.some((o) => (o?.avoid?.length ?? 0) > 0)).toBe(true);
  });

  it('reports routing failures as RoutingUnavailableError', async () => {
    await expect(planReroute(input({ router: failingRouter }))).rejects.toBeInstanceOf(
      RoutingUnavailableError,
    );
  });
});

describe('planReroute — approach', () => {
  it('prepends a path to the start and shifts the original steps after it', async () => {
    const far = { lat: 51.495, lng: -0.125 };
    const calls: Coord[][] = [];
    const plan = await planReroute(
      input({ router: fakeRouter(calls), strategy: 'approach', here: far, fromIndex: undefined }),
    );
    expect(calls[0]).toEqual([far, start]);
    // approach (2 vertices) + original minus its duplicated first vertex (8)
    expect(plan.route.coordinates).toHaveLength(10);
    // the approach's own arrive step is dropped; the walk's arrive is kept, shifted by 1
    expect(plan.steps.filter((s) => s.type === 10)).toHaveLength(1);
    expect(plan.steps.at(-1)!.startIndex).toBe(9);
    expect(plan.steps[1]!.instruction).toBe('Head east');
    expect(plan.steps[1]!.startIndex).toBe(1);
    expect(plan.distanceKm).toBe(1.9);
    expect(plan.source).toBe('through');
  });
});
