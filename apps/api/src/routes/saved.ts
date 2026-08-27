import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ErrorResponseSchema, SaveCuriosityRequestSchema, SavedCuriositySchema } from '@amble/shared';
import { prisma } from '../db.js';
import { toCuriosity } from '../lib/serialize.js';

export const savedRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', fastify.requireDevice);

  fastify.get(
    '/saved',
    { schema: { response: { 200: z.array(SavedCuriositySchema) } } },
    async (req) => {
      const rows = await prisma.savedCuriosity.findMany({
        where: { deviceId: req.deviceId },
        include: { curiosity: true },
        orderBy: { savedAt: 'desc' },
      });
      return rows.map((r) => ({ ...toCuriosity(r.curiosity), savedAt: r.savedAt.toISOString() }));
    },
  );

  fastify.post(
    '/saved',
    {
      schema: {
        body: SaveCuriosityRequestSchema,
        response: { 200: SavedCuriositySchema, 404: ErrorResponseSchema },
      },
    },
    async (req, reply) => {
      const curiosity = await prisma.curiosity.findUnique({
        where: { id: req.body.curiosityId },
      });
      if (!curiosity) return reply.code(404).send({ error: 'Curiosity not found' });
      const saved = await prisma.savedCuriosity.upsert({
        where: {
          deviceId_curiosityId: { deviceId: req.deviceId, curiosityId: curiosity.id },
        },
        create: { deviceId: req.deviceId, curiosityId: curiosity.id },
        update: {},
      });
      return { ...toCuriosity(curiosity), savedAt: saved.savedAt.toISOString() };
    },
  );

  fastify.delete(
    '/saved/:curiosityId',
    { schema: { params: z.object({ curiosityId: z.string() }) } },
    async (req) => {
      await prisma.savedCuriosity.deleteMany({
        where: { deviceId: req.deviceId, curiosityId: req.params.curiosityId },
      });
      return { ok: true };
    },
  );
};
