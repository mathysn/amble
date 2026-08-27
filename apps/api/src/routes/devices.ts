import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { RegisterDeviceResponseSchema, DEFAULT_SETTINGS } from '@amble/shared';
import { prisma } from '../db.js';
import { hashToken, newToken } from '../lib/token.js';

export const deviceRoutes: FastifyPluginAsyncZod = async (fastify) => {
  // The only unauthenticated route: mint an anonymous device + token.
  fastify.post(
    '/devices',
    { schema: { response: { 200: RegisterDeviceResponseSchema } } },
    async () => {
      const token = newToken();
      const device = await prisma.device.create({
        data: {
          tokenHash: hashToken(token),
          settings: { create: { ...DEFAULT_SETTINGS } },
        },
      });
      return { deviceId: device.id, token };
    },
  );
};
