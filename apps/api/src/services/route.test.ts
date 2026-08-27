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
      steps: [{ instruction: 'Head out', distanceM: 100, wayName: 'Test St', type: 11, startIndex: 0 }],
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
    const candidates = [{ id: 'here', lat: start.lat, lng: start.lng, category: 'niche' as const }, ...ring(6)];
    const plan = await generateWander({
      start,
      minutes: 30,
      pace: 'easy',
      candidates,
      router: fakeRouter,
    });
    expect(plan.stops.every((s) => haversineM(start, s.candidate) > 40)).toBe(true);
  });

  it('varies the pick with a different seed', async () => {
    const a = await generateWander({ start, minutes: 45, pace: 'easy', candidates: ring(20), seed: 1, router: fakeRouter });
    const b = await generateWander({ start, minutes: 45, pace: 'easy', candidates: ring(20), seed: 999, router: fakeRouter });
    expect(a.stops.map((s) => s.candidate.id)).not.toEqual(b.stops.map((s) => s.candidate.id));
  });
});
