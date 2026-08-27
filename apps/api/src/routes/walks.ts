import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  DEFAULT_SETTINGS,
  ErrorResponseSchema,
  PlanWalkRequestSchema,
  PACE_METRES_PER_MIN,
  WalkListResponseSchema,
  WalkSchema,
  type Category,
  type Pace,
} from '@amble/shared';
import { prisma } from '../db.js';
import { findCuriositiesNear } from '../services/curiosityStore.js';
import { generateWander, type Candidate } from '../services/route.js';
import { toWalk, toWalkSummary } from '../lib/serialize.js';

const IdParams = z.object({ id: z.string() });
const walkInclude = { curiosities: { include: { curiosity: true } } } as const;
const E = ErrorResponseSchema;

/** Search radius wide enough to hold the whole loop, clamped to sane bounds. */
function searchRadius(minutes: number, pace: Pace): number {
  return Math.min(4000, Math.max(800, (minutes * PACE_METRES_PER_MIN[pace]) / 2));
}

export const walkRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', fastify.requireDevice);

  // ── Plan a new wander ────────────────────────────────────────────────────
  fastify.post(
    '/walks/plan',
    { schema: { body: PlanWalkRequestSchema, response: { 200: WalkSchema } } },
    async (req) => {
      const { lat, lng, minutes, categories } = req.body;
      const settings =
        (await prisma.settings.findUnique({ where: { deviceId: req.deviceId } })) ??
        DEFAULT_SETTINGS;
      const pace = settings.pace as Pace;
      const start = { lat, lng };

      const rows = await findCuriositiesNear(start, searchRadius(minutes, pace), categories);
      const candidates: Candidate[] = rows.map((r) => ({
        id: r.id,
        lat: r.lat,
        lng: r.lng,
        category: r.category as Category,
      }));

      // Always returns a plan — real route through curiosities, a real loop, or
      // a stylized fallback — so a walk can be started anywhere.
      const plan = await generateWander({ start, minutes, pace, candidates, seed: Date.now() & 0xffff });

      const walk = await prisma.walk.create({
        data: {
          deviceId: req.deviceId,
          status: 'planned',
          startLat: lat,
          startLng: lng,
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

      const rows = await findCuriositiesNear(
        start,
        searchRadius(existing.plannedMinutes, pace),
        enabled,
      );
      const candidates: Candidate[] = rows.map((r) => ({
        id: r.id,
        lat: r.lat,
        lng: r.lng,
        category: r.category as Category,
      }));
      const plan = await generateWander({
        start,
        minutes: existing.plannedMinutes,
        pace,
        candidates,
        seed: (Math.random() * 0xffff) | 0,
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
