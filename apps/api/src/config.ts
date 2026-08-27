import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  OSM_CONTACT: z.string().default('amble-dev'),
  // Optional: without it, real street routing is disabled and walks fall back
  // to the stylized synthetic loop (so the app still works, just less real).
  ORS_API_KEY: z.string().optional(),
});

export const config = EnvSchema.parse(process.env);

export const OSM = {
  overpassUrl: 'https://overpass-api.de/api/interpreter',
  nominatimUrl: 'https://nominatim.openstreetmap.org',
  userAgent: `Amble/0.1 (${config.OSM_CONTACT})`,
};

export const ORS = {
  directionsUrl: 'https://api.openrouteservice.org/v2/directions/foot-walking/geojson',
  apiKey: config.ORS_API_KEY,
  userAgent: `Amble/0.1 (${config.OSM_CONTACT})`,
};
