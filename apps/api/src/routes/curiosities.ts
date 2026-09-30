import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CuriosityDetailsSchema,
  CuriositySchema,
  ErrorResponseSchema,
  type CuriosityDetails,
} from '@amble/shared';
import { prisma } from '../db.js';
import { toCuriosity } from '../lib/serialize.js';
import { fetchCuriosityDetails } from '../services/curiosityDetails.js';

/** Stored details are refreshed after this long (Wikipedia pages change slowly). */
const DETAILS_MAX_AGE_MS = 30 * 24 * 60 * 60_000;

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

  // Photo, summary and facts — fetched the first time someone reaches it, then kept.
  fastify.get(
    '/curiosities/:id/details',
    {
      preHandler: fastify.requireDevice,
      schema: {
        params: z.object({ id: z.string() }),
        response: { 200: CuriosityDetailsSchema, 404: ErrorResponseSchema },
      },
    },
    async (req, reply) => {
      const c = await prisma.curiosity.findUnique({ where: { id: req.params.id } });
      if (!c) return reply.code(404).send({ error: 'Curiosity not found' });

      const fresh = c.detailsAt && Date.now() - c.detailsAt.getTime() < DETAILS_MAX_AGE_MS;
      if (c.detailsJson && fresh) return JSON.parse(c.detailsJson) as CuriosityDetails;

      let tags: Record<string, string> = {};
      try {
        tags = c.meta ? (JSON.parse(c.meta) as Record<string, string>) : {};
      } catch {
        // Unreadable tags: just no details.
      }
      const details = await fetchCuriosityDetails(tags);
      await prisma.curiosity.update({
        where: { id: c.id },
        data: { detailsJson: JSON.stringify(details), detailsAt: new Date() },
      });
      return details;
    },
  );
};
