import { describe, expect, it } from 'vitest';
import { generateWander, stopCount, type Candidate } from './route.js';
import type { Router } from './routing.js';
import { haversineM } from '../lib/geo.js';

const start = { lat: 51.5129, lng: -0.1224 };

/** A ring of candidates ~400 m out in every direction. */
function ring(n: number, radiusM = 400): Candidate[] {
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * 2 * Math.PI;
    const dLat = (radiusM * Math.cos(angle)) / 111_320;
    const dLng = (radiusM * Math.sin(angle)) / (111_320 * Math.cos((start.lat * Math.PI) / 180));
    return {
      id: `c${i}`,
      lat: start.lat + dLat,
      lng: start.lng + dLng,
      category: 'niche' as const,
    };
  });
}

/** A fake router that echoes a straight line through the given coords + one step. */
const fakeRouter: Router = {
  async routeThrough(coords) {
    return {
      geometry: { type: 'LineString', coordinates: coords.map((c) => [c.lng, c.lat]) },
      steps: [
        { instruction: 'Head out', distanceM: 100, wayName: 'Test St', type: 11, startIndex: 0 },
      ],
      distanceM: 2000,
    };
  },
  async roundTrip(loopStart) {
    // a tiny square loop around the start
    const d = 0.003;
    return {
      geometry: {
        type: 'LineString',
        coordinates: [
          [loopStart.lng, loopStart.lat],
          [loopStart.lng + d, loopStart.lat],
          [loopStart.lng + d, loopStart.lat + d],
          [loopStart.lng, loopStart.lat + d],
          [loopStart.lng, loopStart.lat],
        ],
      },
      steps: [{ instruction: 'Loop', distanceM: 500, wayName: null, type: 11, startIndex: 0 }],
      distanceM: 2100,
    };
  },
};

const throwingRouter: Router = {
  routeThrough: async () => {
    throw new Error('no key');
  },
  roundTrip: async () => {
    throw new Error('no key');
  },
};

describe('stopCount', () => {
  it('scales with minutes and stays within 2..5', () => {
    expect(stopCount(15)).toBe(2);
    expect(stopCount(30)).toBe(3);
    expect(stopCount(60)).toBe(5);
    expect(stopCount(500)).toBe(5);
  });
});

describe('generateWander', () => {
  it('routes through curiosities when there are enough nearby', async () => {
    const plan = await generateWander({
      start,
      minutes: 30,
      pace: 'easy',
      candidates: ring(10),
      router: fakeRouter,
    });
    expect(plan.source).toBe('through');
    expect(plan.stops).toHaveLength(3);
    expect(plan.stops.map((s) => s.order)).toEqual([1, 2, 3]);
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.distanceKm).toBeGreaterThan(0);
  });

  it('falls back to a real loop when there are no candidates (never fails)', async () => {
    const plan = await generateWander({
      start,
      minutes: 30,
      pace: 'easy',
      candidates: [],
      router: fakeRouter,
    });
    expect(plan.source).toBe('loop');
    expect(plan.route.coordinates.length).toBeGreaterThan(1);
    expect(plan.distanceKm).toBeGreaterThan(0);
  });

  it('falls back to a stylized synthetic loop when the router is unavailable', async () => {
    const plan = await generateWander({
      start,
      minutes: 30,
      pace: 'easy',
      candidates: ring(10),
      router: throwingRouter,
    });
    expect(plan.source).toBe('synthetic');
    // synthetic loop returns home
    expect(plan.route.coordinates[0]).toEqual([start.lng, start.lat]);
    expect(plan.route.coordinates.at(-1)).toEqual([start.lng, start.lat]);
    expect(plan.stops.length).toBeGreaterThan(0);
  });

  it('produces a synthetic loop even with zero candidates and no router', async () => {
    const plan = await generateWander({
      start,
      minutes: 30,
      pace: 'easy',
      candidates: [],
      router: throwingRouter,
    });
    expect(plan.source).toBe('synthetic');
    expect(plan.stops).toHaveLength(0);
    expect(plan.route.coordinates.length).toBeGreaterThan(2);
  });

  it('never picks a candidate essentially on top of the start', async () => {
    const candidates = [
      { id: 'here', lat: start.lat, lng: start.lng, category: 'niche' as const },
      ...ring(6),
    ];
    const plan = await generateWander({
      start,
      minutes: 30,
      pace: 'easy',
      candidates,
      router: fakeRouter,
    });
    expect(plan.stops.every((s) => haversineM(start, s.candidate) > 40)).toBe(true);
  });

  describe('curiosities up side streets', () => {
    /** Routes straight between waypoints, except that each candidate in `spurM`
     *  is reached up a side street of that length (out and back). */
    function spurRouter(candidates: Candidate[], spurM: (id: string) => number) {
      const calls: { lat: number; lng: number }[][] = [];
      const router: Router = {
        ...fakeRouter,
        async routeThrough(coords) {
          calls.push(coords);
          const out: [number, number][] = [];
          const waypointIndices: number[] = [];
          // Legs come one at a time: a candidate is reached up its side street
          // at the end of a leg, and left down it at the start of the next.
          coords.forEach((c, i) => {
            const cand = candidates.find((x) => x.lat === c.lat && x.lng === c.lng);
            const len = cand ? spurM(cand.id) : 0;
            const junction: [number, number] = [c.lng, c.lat - len / 111_320];
            if (len && i > 0) out.push(junction);
            waypointIndices.push(out.length);
            out.push([c.lng, c.lat]);
            if (len && i < coords.length - 1) out.push(junction);
          });
          return {
            geometry: { type: 'LineString', coordinates: out },
            steps: [
              { instruction: 'Head out', distanceM: 100, wayName: null, type: 11, startIndex: 0 },
            ],
            distanceM: 2000,
            waypointIndices,
          };
        },
      };
      return { router, calls };
    }

    it('passes a nearby curiosity at its junction instead of going out and back', async () => {
      const candidates = ring(10);
      const { router, calls } = spurRouter(candidates, () => 30);
      const plan = await generateWander({ start, minutes: 30, pace: 'easy', candidates, router });
      expect(plan.source).toBe('through');
      expect(plan.stops).toHaveLength(3);
      // two passes of four legs; the second goes via the junctions, ~30 m short of each curiosity
      expect(calls).toHaveLength(8);
      const secondPass = calls
        .slice(4)
        .map((leg) => leg[0]!)
        .slice(1);
      secondPass.forEach((wp, i) => {
        expect(haversineM(wp, plan.stops[i]!.candidate)).toBeGreaterThan(20);
        expect(haversineM(wp, plan.stops[i]!.candidate)).toBeLessThan(45);
      });
    });

    it('leaves out curiosities too far up a side street to see from the loop', async () => {
      const candidates = ring(10);
      // The pick doesn't depend on the router: make the first one hard to see.
      const baseline = await generateWander({
        start,
        minutes: 30,
        pace: 'easy',
        candidates,
        router: fakeRouter,
      });
      const far = baseline.stops[0]!.candidate.id;
      const { router } = spurRouter(candidates, (id) => (id === far ? 150 : 30));
      const plan = await generateWander({ start, minutes: 30, pace: 'easy', candidates, router });
      expect(plan.source).toBe('through');
      expect(plan.stops.map((s) => s.candidate.id)).toEqual(
        baseline.stops.slice(1).map((s) => s.candidate.id),
      );
      expect(plan.stops.map((s) => s.order)).toEqual(plan.stops.map((_, i) => i + 1));
    });

    it('falls back to a plain loop when every curiosity is out of the way', async () => {
      const candidates = ring(10);
      const { router } = spurRouter(candidates, () => 150);
      const plan = await generateWander({ start, minutes: 30, pace: 'easy', candidates, router });
      expect(plan.source).toBe('loop');
    });
  });

  describe('to an end point', () => {
    // ~1.2 km north-east of the start
    const end = { lat: start.lat + 0.008, lng: start.lng + 0.008 };
    /** A grid of candidates every ~150 m around both ends. */
    const grid: Candidate[] = [];
    for (let i = -4; i <= 12; i++) {
      for (let j = -4; j <= 12; j++) {
        grid.push({
          id: `g${i},${j}`,
          lat: start.lat + i * 0.00135,
          lng: start.lng + j * 0.0022,
          category: 'hidden',
        });
      }
    }

    it('finishes at the end point, visiting stops in order along the way', async () => {
      const plan = await generateWander({
        start,
        end,
        minutes: 40,
        pace: 'easy',
        candidates: grid,
        router: fakeRouter,
      });
      expect(plan.source).toBe('through');
      expect(plan.route.coordinates.at(-1)).toEqual([end.lng, end.lat]);
      const fromStart = plan.stops.map((s) => haversineM(start, s.candidate));
      expect(fromStart).toEqual([...fromStart].sort((a, b) => a - b));
    });

    it('keeps a short walk close to the direct line, and lets a long one detour', async () => {
      const direct = haversineM(start, end);
      const extra = (plan: Awaited<ReturnType<typeof generateWander>>) =>
        Math.max(
          ...plan.stops.map(
            (s) => haversineM(start, s.candidate) + haversineM(s.candidate, end) - direct,
          ),
        );
      const stroll = await generateWander({
        start,
        end,
        minutes: 20,
        pace: 'easy',
        candidates: grid,
        router: fakeRouter,
      });
      const roam = await generateWander({
        start,
        end,
        minutes: 65,
        pace: 'easy',
        candidates: grid,
        router: fakeRouter,
      });
      expect(extra(stroll)).toBeLessThan(direct * 0.1);
      expect(extra(roam)).toBeGreaterThan(extra(stroll));
    });

    it('treats an end point next to the start as a loop', async () => {
      const near = { lat: start.lat + 0.0005, lng: start.lng };
      const plan = await generateWander({
        start,
        end: near,
        minutes: 30,
        pace: 'easy',
        candidates: ring(10),
        router: fakeRouter,
      });
      expect(plan.route.coordinates.at(-1)).toEqual([start.lng, start.lat]);
    });

    it('still ends there when routing is unavailable', async () => {
      const plan = await generateWander({
        start,
        end,
        minutes: 40,
        pace: 'easy',
        candidates: grid,
        router: throwingRouter,
      });
      expect(plan.source).toBe('synthetic');
      expect(plan.route.coordinates.at(-1)).toEqual([end.lng, end.lat]);
    });
  });

  it('varies the pick with a different seed', async () => {
    const a = await generateWander({
      start,
      minutes: 45,
      pace: 'easy',
      candidates: ring(20),
      seed: 1,
      router: fakeRouter,
    });
    const b = await generateWander({
      start,
      minutes: 45,
      pace: 'easy',
      candidates: ring(20),
      seed: 999,
      router: fakeRouter,
    });
    expect(a.stops.map((s) => s.candidate.id)).not.toEqual(b.stops.map((s) => s.candidate.id));
  });
});
