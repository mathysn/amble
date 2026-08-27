import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  ErrorResponseSchema,
  GeoReverseQuerySchema,
  GeoSearchQuerySchema,
  GeoSearchResponseSchema,
  PlaceSchema,
} from '@amble/shared';
import { geocode, NominatimBusyError, reverseGeocode } from '../services/osm.js';

export const geoRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', fastify.requireDevice);

  fastify.get(
    '/geo/search',
    {
      schema: {
        querystring: GeoSearchQuerySchema,
        response: { 200: GeoSearchResponseSchema, 503: ErrorResponseSchema },
      },
    },
    async (req, reply) => {
      try {
        return { results: await geocode(req.query.q) };
      } catch (err) {
        if (err instanceof NominatimBusyError) {
          return reply.code(503).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  fastify.get(
    '/geo/reverse',
    {
      schema: {
        querystring: GeoReverseQuerySchema,
        response: { 200: PlaceSchema, 503: ErrorResponseSchema },
      },
    },
    async (req, reply) => {
      try {
        return await reverseGeocode({ lat: req.query.lat, lng: req.query.lng });
      } catch (err) {
        if (err instanceof NominatimBusyError) {
          return reply.code(503).send({ error: err.message });
        }
        throw err;
      }
    },
  );
};
