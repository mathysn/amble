import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CuriositySchema, ErrorResponseSchema } from '@amble/shared';
import { prisma } from '../db.js';
import { toCuriosity } from '../lib/serialize.js';

export const curiosityRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/curiosities/:id',
    {
      preHandler: fastify.requireDevice,
      schema: {
        params: z.object({ id: z.string() }),
        response: { 200: CuriositySchema, 404: ErrorResponseSchema },
      },
    },
    async (req, reply) => {
      const c = await prisma.curiosity.findUnique({ where: { id: req.params.id } });
      if (!c) return reply.code(404).send({ error: 'Curiosity not found' });
      return toCuriosity(c);
    },
  );
};
