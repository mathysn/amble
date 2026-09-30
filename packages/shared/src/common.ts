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

/**
 * The walk lengths offered, by name rather than by the clock. `minutes` is what
 * the planner works from (distance = minutes × pace); the app never shows it.
 */
export const WALK_LENGTHS = [
  { id: 'stroll', label: 'Stroll', hint: 'a quick one', minutes: 20 },
  { id: 'wander', label: 'Wander', hint: 'the usual', minutes: 40 },
  { id: 'roam', label: 'Roam', hint: 'take your time', minutes: 65 },
] as const;
export type WalkLength = (typeof WALK_LENGTHS)[number];

/** The named length closest to `minutes` (also maps older 15/30/45/60 values). */
export function lengthFor(minutes: number): WalkLength {
  let best: WalkLength = WALK_LENGTHS[0];
  for (const l of WALK_LENGTHS) {
    if (Math.abs(l.minutes - minutes) < Math.abs(best.minutes - minutes)) best = l;
  }
  return best;
}

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
