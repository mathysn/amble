import { z } from 'zod';
import { CategorySchema, LatSchema, LngSchema } from './common';

/** A single point of interest revealed along a walk. */
export const CuriositySchema = z.object({
  id: z.string(),
  name: z.string(),
  category: CategorySchema,
  blurb: z.string(),
  lat: LatSchema,
  lng: LngSchema,
  /** e.g. "1890" — an era/built year pulled from OSM tags, when available. */
  era: z.string().nullable().optional(),
  neighbourhood: z.string().nullable().optional(),
});
export type Curiosity = z.infer<typeof CuriositySchema>;

/** A curiosity as it appears in a walk: with its order and found state. */
export const WalkCuriositySchema = CuriositySchema.extend({
  order: z.number().int(),
  found: z.boolean(),
  detourMin: z.number().int(),
  distanceM: z.number().int(),
});
export type WalkCuriosity = z.infer<typeof WalkCuriositySchema>;

/** GET /curiosities/:id/details — the fuller story, fetched when it's revealed. */
export const CuriosityDetailsSchema = z.object({
  imageUrl: z.string().nullable(),
  /** Who to credit for the photo, e.g. "Wikimedia Commons". */
  imageCredit: z.string().nullable(),
  /** A short encyclopedia summary, when the place has one. */
  summary: z.string().nullable(),
  /** Where the summary comes from (to read more). */
  sourceUrl: z.string().nullable(),
  /** Small labelled facts from its map data: built, artist, opening hours… */
  facts: z.array(z.object({ label: z.string(), value: z.string() })),
});
export type CuriosityDetails = z.infer<typeof CuriosityDetailsSchema>;

export const SavedCuriositySchema = CuriositySchema.extend({
  savedAt: z.string(),
});
export type SavedCuriosity = z.infer<typeof SavedCuriositySchema>;

export const SaveCuriosityRequestSchema = z.object({
  curiosityId: z.string(),
});
export type SaveCuriosityRequest = z.infer<typeof SaveCuriosityRequestSchema>;
