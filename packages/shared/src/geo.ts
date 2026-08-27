import { z } from 'zod';
import { LatSchema, LngSchema } from './common';

export const GeoSearchQuerySchema = z.object({
  q: z.string().min(1),
});
export type GeoSearchQuery = z.infer<typeof GeoSearchQuerySchema>;

export const GeoReverseQuerySchema = z.object({
  lat: z.coerce.number().pipe(LatSchema),
  lng: z.coerce.number().pipe(LngSchema),
});
export type GeoReverseQuery = z.infer<typeof GeoReverseQuerySchema>;

/** A geocoding result — an address the user can start a walk from. */
export const PlaceSchema = z.object({
  label: z.string(),
  detail: z.string(),
  lat: LatSchema,
  lng: LngSchema,
});
export type Place = z.infer<typeof PlaceSchema>;

export const GeoSearchResponseSchema = z.object({
  results: z.array(PlaceSchema),
});
export type GeoSearchResponse = z.infer<typeof GeoSearchResponseSchema>;
