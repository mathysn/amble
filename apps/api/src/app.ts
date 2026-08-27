import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { authPlugin } from './plugins/auth.js';
import { deviceRoutes } from './routes/devices.js';
import { settingsRoutes } from './routes/settings.js';
import { walkRoutes } from './routes/walks.js';
import { savedRoutes } from './routes/saved.js';
import { curiosityRoutes } from './routes/curiosities.js';
import { geoRoutes } from './routes/geo.js';

export function buildApp() {
  const app = Fastify({
    logger: {
      transport:
        process.env.NODE_ENV === 'production'
          ? undefined
          : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(cors, { origin: true });
  app.register(authPlugin);

  app.get('/health', () => ({ ok: true }));

  app.register(deviceRoutes);
  app.register(settingsRoutes);
  app.register(walkRoutes);
  app.register(savedRoutes);
  app.register(curiosityRoutes);
  app.register(geoRoutes);

  return app;
}
