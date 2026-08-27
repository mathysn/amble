import { z } from 'zod';

/** The three flavours of surprise Amble reveals along a walk. */
export const CategorySchema = z.enum(['niche', 'hidden', 'scenic']);
export type Category = z.infer<typeof CategorySchema>;

export const PaceSchema = z.enum(['easy', 'steady', 'brisk']);
export type Pace = z.infer<typeof PaceSchema>;

/** Average metres per minute on foot, used to turn minutes into distance. */
export const PACE_METRES_PER_MIN: Record<Pace, number> = {
  easy: 70,
  steady: 83,
  brisk: 95,
};

export const UnitsSchema = z.enum(['km', 'mi']);
export type Units = z.infer<typeof UnitsSchema>;

export const WalkStatusSchema = z.enum(['planned', 'active', 'paused', 'completed']);
export type WalkStatus = z.infer<typeof WalkStatusSchema>;

/** Allowed walk lengths (minutes) shown as chips on the home screen. */
export const WALK_LENGTHS = [15, 30, 45, 60] as const;

export const LatSchema = z.number().min(-90).max(90);
export const LngSchema = z.number().min(-180).max(180);

export const CoordSchema = z.object({
  lat: LatSchema,
  lng: LngSchema,
});
export type Coord = z.infer<typeof CoordSchema>;

/** Standard error body for non-2xx responses. */
export const ErrorResponseSchema = z.object({ error: z.string() });
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/** GeoJSON LineString — the stylized route the map draws. */
export const RouteGeometrySchema = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
});
export type RouteGeometry = z.infer<typeof RouteGeometrySchema>;
