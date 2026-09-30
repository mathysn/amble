import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Coord, RouteStep, Walk } from '@amble/shared';
import { buildApp } from '../app.js';
import { prisma } from '../db.js';
import type { Router } from '../services/routing.js';

const start = { lat: 51.5, lng: -0.12 };
const coords: [number, number][] = [
  [-0.12, 51.5], [-0.119, 51.5], [-0.118, 51.5], [-0.118, 51.501], [-0.12, 51.5],
];
const steps: RouteStep[] = [
  { instruction: 'Head east', distanceM: 140, wayName: null, type: 11, startIndex: 0 },
  { instruction: 'Arrive', distanceM: 0, wayName: null, type: 10, startIndex: 4 },
];

const straightRouter: Router = {
  async routeThrough(points: Coord[]) {
    return {
      geometry: { type: 'LineString', coordinates: points.map((p) => [p.lng, p.lat]) },
      steps: [
        { instruction: 'Head home', distanceM: 300, wayName: null, type: 11, startIndex: 0 },
        { instruction: 'Arrive', distanceM: 0, wayName: null, type: 10, startIndex: points.length - 1 },
      ],
      distanceM: 300,
    };
  },
  roundTrip: async () => {
    throw new Error('unused');
  },
};
const downRouter: Router = {
  routeThrough: async () => {
    throw new Error('ORS 503');
  },
  roundTrip: async () => {
    throw new Error('ORS 503');
  },
};

const app = buildApp({ logger: false, router: straightRouter });
const appDown = buildApp({ logger: false, router: downRouter });
let token = '';
let deviceId = '';

beforeAll(async () => {
  await Promise.all([app.ready(), appDown.ready()]);
  ({ token, deviceId } = (await app.inject({ method: 'POST', url: '/devices' })).json());
});

afterAll(async () => {
  await Promise.all([app.close(), appDown.close()]);
  await prisma.$disconnect();
});

async function makeWalk(status = 'active', owner = deviceId, end?: Coord & { label: string }) {
  return prisma.walk.create({
    data: {
      deviceId: owner,
      status,
      endLat: end?.lat ?? null,
      endLng: end?.lng ?? null,
      endLabel: end?.label ?? null,
      startLat: start.lat,
      startLng: start.lng,
      plannedMinutes: 30,
      distanceKm: 0.5,
      routeGeoJson: JSON.stringify({ type: 'LineString', coordinates: coords }),
      stepsJson: JSON.stringify(steps),
      source: 'through',
      startedAt: new Date(),
    },
  });
}

const body = { lat: 51.5011, lng: -0.1172, strategy: 'rejoin', fromIndex: 2, coordsCount: coords.length };

function reroute(id: string, payload: object = body, server = app) {
  return server.inject({
    method: 'POST',
    url: `/walks/${id}/reroute`,
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
}

describe('POST /walks/:id/reroute', () => {
  it('replaces the route, keeps the walked prefix, and persists it', async () => {
    const walk = await makeWalk();
    const res = await reroute(walk.id);
    expect(res.statusCode).toBe(200);
    const updated = res.json() as Walk;
    // prefix coords[0..2] + here → start
    expect(updated.route.coordinates).toHaveLength(5);
    expect(updated.route.coordinates.slice(0, 3)).toEqual(coords.slice(0, 3));
    expect(updated.steps[0]!.startIndex).toBe(3);
    expect(updated.source).toBe('through');

    const stored = await prisma.walk.findUniqueOrThrow({ where: { id: walk.id } });
    expect(JSON.parse(stored.routeGeoJson).coordinates).toHaveLength(5);
  });

  it('heads for the end point of an A→B walk, and returns it', async () => {
    const end = { lat: 51.503, lng: -0.115, label: 'Seven Dials' };
    const walk = await makeWalk('active', deviceId, end);
    const res = await reroute(walk.id);
    expect(res.statusCode).toBe(200);
    const updated = res.json() as Walk;
    expect(updated.route.coordinates.at(-1)).toEqual([end.lng, end.lat]);
    expect([updated.endLat, updated.endLng, updated.endLabel]).toEqual([end.lat, end.lng, end.label]);
  });

  it.each(['planned', 'paused', 'completed'])('refuses a %s walk with 409', async (status) => {
    const walk = await makeWalk(status);
    expect((await reroute(walk.id)).statusCode).toBe(409);
  });

  it('refuses a stale route with 409', async () => {
    const walk = await makeWalk();
    const res = await reroute(walk.id, { ...body, coordsCount: 99 });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('Route changed');
  });

  it("hides other devices' walks (404)", async () => {
    const other = (await app.inject({ method: 'POST', url: '/devices' })).json();
    const walk = await makeWalk('active', other.deviceId);
    expect((await reroute(walk.id)).statusCode).toBe(404);
  });

  it('throttles repeated reroutes of one walk (429)', async () => {
    const walk = await makeWalk();
    expect((await reroute(walk.id)).statusCode).toBe(200);
    expect((await reroute(walk.id, { ...body, coordsCount: 5 })).statusCode).toBe(429);
  });

  it('answers 503 when routing is unavailable, leaving the walk untouched', async () => {
    const walk = await makeWalk();
    const res = await reroute(walk.id, body, appDown);
    expect(res.statusCode).toBe(503);
    const stored = await prisma.walk.findUniqueOrThrow({ where: { id: walk.id } });
    expect(JSON.parse(stored.routeGeoJson).coordinates).toHaveLength(coords.length);
  });

  it('validates the body (400)', async () => {
    const walk = await makeWalk();
    expect((await reroute(walk.id, { ...body, lat: 200 })).statusCode).toBe(400);
    expect((await reroute(walk.id, { ...body, strategy: 'teleport' })).statusCode).toBe(400);
  });
});
