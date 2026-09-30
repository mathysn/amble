import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  DEFAULT_SETTINGS,
  ErrorResponseSchema,
  PlanWalkRequestSchema,
  PACE_METRES_PER_MIN,
  RerouteRequestSchema,
  walkEnd,
  WalkListResponseSchema,
  WalkSchema,
  type Category,
  type Coord,
  type Pace,
  type RouteGeometry,
  type RouteSource,
  type RouteStep,
} from '@amble/shared';
import { prisma } from '../db.js';
import { findCuriositiesNear } from '../services/curiosityStore.js';
import { generateWander, MIN_END_M, type Candidate } from '../services/route.js';
import { orsRouter, type Router } from '../services/routing.js';
import { planReroute, RoutingUnavailableError } from '../services/reroute.js';
import { toWalk, toWalkSummary } from '../lib/serialize.js';
import { haversineM } from '../lib/geo.js';

const IdParams = z.object({ id: z.string() });
const walkInclude = { curiosities: { include: { curiosity: true } } } as const;
const E = ErrorResponseSchema;

/** Search radius wide enough to hold the whole loop, clamped to sane bounds. */
function searchRadius(minutes: number, pace: Pace): number {
  return Math.min(4000, Math.max(800, (minutes * PACE_METRES_PER_MIN[pace]) / 2));
}

/** Where to look for curiosities: round the start for a loop, or round the
 *  middle of the way for an A→B wander, wide enough to cover both ends. */
function searchArea(start: Coord, end: Coord | null, minutes: number, pace: Pace) {
  const radius = searchRadius(minutes, pace);
  if (!end) return { center: start, radius };
  const center = { lat: (start.lat + end.lat) / 2, lng: (start.lng + end.lng) / 2 };
  return { center, radius: Math.min(6000, Math.max(radius, haversineM(start, end) / 2 + 500)) };
}

/** Minimum gap between reroutes of one walk (the client throttles harder; this guards ORS). */
const REROUTE_MIN_INTERVAL_MS = 10_000;
const lastReroute = new Map<string, number>();

export type WalkRoutesOptions = {
  /** Injected in tests; defaults to OpenRouteService. */
  router?: Router;
};

export const walkRoutes: FastifyPluginAsyncZod<WalkRoutesOptions> = async (fastify, opts) => {
  const router = opts.router ?? orsRouter;
  fastify.addHook('preHandler', fastify.requireDevice);

  // ── Plan a new wander ────────────────────────────────────────────────────
  fastify.post(
    '/walks/plan',
    { schema: { body: PlanWalkRequestSchema, response: { 200: WalkSchema } } },
    async (req) => {
      const { lat, lng, minutes, categories, end: endReq } = req.body;
      const settings =
        (await prisma.settings.findUnique({ where: { deviceId: req.deviceId } })) ??
        DEFAULT_SETTINGS;
      const pace = settings.pace as Pace;
      const start = { lat, lng };
      // An end right next to the start is just a loop.
      const end = endReq && haversineM(start, endReq) > MIN_END_M ? endReq : null;

      const area = searchArea(start, end, minutes, pace);
      const rows = await findCuriositiesNear(area.center, area.radius, categories);
      const candidates: Candidate[] = rows.map((r) => ({
        id: r.id,
        lat: r.lat,
        lng: r.lng,
        category: r.category as Category,
      }));

      // Always returns a plan — real route through curiosities, a real loop, or
      // a stylized fallback — so a walk can be started anywhere.
      const plan = await generateWander({
        start,
        end,
        minutes,
        pace,
        candidates,
        seed: Date.now() & 0xffff,
        router,
      });

      const walk = await prisma.walk.create({
        data: {
          deviceId: req.deviceId,
          status: 'planned',
          startLat: lat,
          startLng: lng,
          endLat: end?.lat ?? null,
          endLng: end?.lng ?? null,
          endLabel: end ? (end.label ?? null) : null,
          plannedMinutes: minutes,
          distanceKm: plan.distanceKm,
          routeGeoJson: JSON.stringify(plan.route),
          stepsJson: JSON.stringify(plan.steps),
          source: plan.source,
          curiosities: {
            create: plan.stops.map((s) => ({
              curiosityId: s.candidate.id,
              order: s.order,
              detourMin: s.detourMin,
              distanceM: s.distanceM,
            })),
          },
        },
        include: walkInclude,
      });
      return toWalk(walk);
    },
  );

  // ── Reshuffle a planned wander ───────────────────────────────────────────
  fastify.post(
    '/walks/:id/reshuffle',
    { schema: { params: IdParams, response: { 200: WalkSchema, 404: E, 409: E } } },
    async (req, reply) => {
      const existing = await prisma.walk.findFirst({
        where: { id: req.params.id, deviceId: req.deviceId },
        include: walkInclude,
      });
      if (!existing) return reply.code(404).send({ error: 'Walk not found' });
      if (existing.status !== 'planned') {
        return reply.code(409).send({ error: 'Only a planned walk can be reshuffled' });
      }

      const settings =
        (await prisma.settings.findUnique({ where: { deviceId: req.deviceId } })) ??
        DEFAULT_SETTINGS;
      const pace = settings.pace as Pace;
      const categories = [
        ...new Set(existing.curiosities.map((c) => c.curiosity.category as Category)),
      ];
      const enabled: Category[] = categories.length
        ? categories
        : (['niche', 'hidden', 'scenic'] as Category[]);
      const start = { lat: existing.startLat, lng: existing.startLng };
      const end =
        existing.endLat !== null && existing.endLng !== null
          ? { lat: existing.endLat, lng: existing.endLng }
          : null;

      const area = searchArea(start, end, existing.plannedMinutes, pace);
      const rows = await findCuriositiesNear(area.center, area.radius, enabled);
      const candidates: Candidate[] = rows.map((r) => ({
        id: r.id,
        lat: r.lat,
        lng: r.lng,
        category: r.category as Category,
      }));
      const plan = await generateWander({
        start,
        end,
        minutes: existing.plannedMinutes,
        pace,
        candidates,
        seed: (Math.random() * 0xffff) | 0,
        router,
      });

      const walk = await prisma.$transaction(async (tx) => {
        await tx.walkCuriosity.deleteMany({ where: { walkId: existing.id } });
        return tx.walk.update({
          where: { id: existing.id },
          data: {
            distanceKm: plan.distanceKm,
            routeGeoJson: JSON.stringify(plan.route),
            stepsJson: JSON.stringify(plan.steps),
            source: plan.source,
            curiosities: {
              create: plan.stops.map((s) => ({
                curiosityId: s.candidate.id,
                order: s.order,
                detourMin: s.detourMin,
                distanceM: s.distanceM,
              })),
            },
          },
          include: walkInclude,
        });
      });
      return toWalk(walk);
    },
  );

  // ── Lifecycle transitions ────────────────────────────────────────────────
  const transition = (
    path: string,
    apply: () => { status: string; startedAt?: Date; completedAt?: Date },
  ) =>
    fastify.post(
      path,
      { schema: { params: IdParams, response: { 200: WalkSchema, 404: E } } },
      async (req, reply) => {
        const owned = await prisma.walk.findFirst({
          where: { id: req.params.id, deviceId: req.deviceId },
        });
        if (!owned) return reply.code(404).send({ error: 'Walk not found' });
        const walk = await prisma.walk.update({
          where: { id: owned.id },
          data: apply(),
          include: walkInclude,
        });
        return toWalk(walk);
      },
    );

  transition('/walks/:id/start', () => ({ status: 'active', startedAt: new Date() }));
  transition('/walks/:id/pause', () => ({ status: 'paused' }));
  transition('/walks/:id/resume', () => ({ status: 'active' }));
  transition('/walks/:id/complete', () => ({ status: 'completed', completedAt: new Date() }));

  // ── Reroute a walk in progress ──────────────────────────────────────────
  // Called when the walker leaves the route (`rejoin`) or hasn't reached the
  // start yet (`approach`). Replaces the stored route/steps; the walked prefix
  // is kept so the history and thumbnails stay whole.
  fastify.post(
    '/walks/:id/reroute',
    {
      schema: {
        params: IdParams,
        body: RerouteRequestSchema,
        response: { 200: WalkSchema, 404: E, 409: E, 429: E, 503: E },
      },
    },
    async (req, reply) => {
      const existing = await prisma.walk.findFirst({
        where: { id: req.params.id, deviceId: req.deviceId },
        include: walkInclude,
      });
      if (!existing) return reply.code(404).send({ error: 'Walk not found' });
      if (existing.status !== 'active') {
        return reply.code(409).send({ error: 'Only an active walk can be rerouted' });
      }

      const route = JSON.parse(existing.routeGeoJson) as RouteGeometry;
      const { lat, lng, strategy, fromIndex, coordsCount } = req.body;
      if (route.coordinates.length !== coordsCount || (fromIndex ?? 0) >= coordsCount) {
        return reply.code(409).send({ error: 'Route changed' });
      }

      const now = Date.now();
      const last = lastReroute.get(existing.id);
      if (last !== undefined && now - last < REROUTE_MIN_INTERVAL_MS) {
        return reply.code(429).send({ error: 'Rerouting too often' });
      }
      lastReroute.set(existing.id, now);

      let plan;
      try {
        plan = await planReroute({
          route,
          steps: JSON.parse(existing.stepsJson) as RouteStep[],
          source: existing.source as RouteSource,
          start: { lat: existing.startLat, lng: existing.startLng },
          finish: walkEnd(existing),
          here: { lat, lng },
          curiosities: existing.curiosities.map((c) => ({
            lat: c.curiosity.lat,
            lng: c.curiosity.lng,
            order: c.order,
            found: c.found,
          })),
          distanceKm: existing.distanceKm,
          strategy,
          fromIndex,
          router,
        });
      } catch (err) {
        if (err instanceof RoutingUnavailableError) {
          req.log.warn({ err: err.cause }, 'reroute: routing unavailable');
          return reply.code(503).send({ error: 'Routing unavailable' });
        }
        throw err;
      }

      const walk = await prisma.walk.update({
        where: { id: existing.id },
        data: {
          routeGeoJson: JSON.stringify(plan.route),
          stepsJson: JSON.stringify(plan.steps),
          distanceKm: plan.distanceKm,
          source: plan.source,
        },
        include: walkInclude,
      });
      return toWalk(walk);
    },
  );

  // ── Mark a curiosity found ───────────────────────────────────────────────
  fastify.post(
    '/walks/:id/curiosities/:cid/found',
    {
      schema: {
        params: z.object({ id: z.string(), cid: z.string() }),
        response: { 200: WalkSchema, 404: E },
      },
    },
    async (req, reply) => {
      const owned = await prisma.walk.findFirst({
        where: { id: req.params.id, deviceId: req.deviceId },
      });
      if (!owned) return reply.code(404).send({ error: 'Walk not found' });
      await prisma.walkCuriosity.updateMany({
        where: { walkId: owned.id, curiosityId: req.params.cid },
        data: { found: true },
      });
      const walk = await prisma.walk.findUniqueOrThrow({
        where: { id: owned.id },
        include: walkInclude,
      });
      return toWalk(walk);
    },
  );

  // ── Read ─────────────────────────────────────────────────────────────────
  fastify.get(
    '/walks',
    { schema: { response: { 200: WalkListResponseSchema } } },
    async (req) => {
      const walks = await prisma.walk.findMany({
        where: { deviceId: req.deviceId, status: { in: ['completed', 'active', 'paused'] } },
        include: walkInclude,
        orderBy: { createdAt: 'desc' },
      });
      const summaries = walks.map(toWalkSummary);
      return {
        walks: summaries,
        totals: {
          walks: summaries.length,
          distanceKm: Math.round(summaries.reduce((n, w) => n + w.distanceKm, 0) * 10) / 10,
          curiosities: summaries.reduce((n, w) => n + w.found, 0),
        },
      };
    },
  );

  fastify.get(
    '/walks/:id',
    { schema: { params: IdParams, response: { 200: WalkSchema, 404: E } } },
    async (req, reply) => {
      const walk = await prisma.walk.findFirst({
        where: { id: req.params.id, deviceId: req.deviceId },
        include: walkInclude,
      });
      if (!walk) return reply.code(404).send({ error: 'Walk not found' });
      return toWalk(walk);
    },
  );
};
