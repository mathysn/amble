import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { DEFAULT_SETTINGS, SettingsSchema, UpdateSettingsSchema } from '@amble/shared';
import { prisma } from '../db.js';
import { toSettings } from '../lib/serialize.js';

export const settingsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/settings',
    { preHandler: fastify.requireDevice, schema: { response: { 200: SettingsSchema } } },
    async (req) => {
      const s = await prisma.settings.findUnique({ where: { deviceId: req.deviceId } });
      return s ? toSettings(s) : { ...DEFAULT_SETTINGS };
    },
  );

  fastify.patch(
    '/settings',
    {
      preHandler: fastify.requireDevice,
      schema: { body: UpdateSettingsSchema, response: { 200: SettingsSchema } },
    },
    async (req) => {
      const s = await prisma.settings.update({
        where: { deviceId: req.deviceId },
        data: req.body,
      });
      return toSettings(s);
    },
  );
};
