import { z } from 'zod';
import {
  CategorySchema,
  CoordSchema,
  RouteGeometrySchema,
  WalkStatusSchema,
} from './common';
import { WalkCuriositySchema } from './curiosity';

/** POST /walks/plan — ask Amble to build a wander. */
export const PlanWalkRequestSchema = z.object({
  lat: CoordSchema.shape.lat,
  lng: CoordSchema.shape.lng,
  minutes: z.number().int().positive(),
  categories: z.array(CategorySchema).min(1),
});
export type PlanWalkRequest = z.infer<typeof PlanWalkRequestSchema>;

/** A single turn-by-turn instruction along the route. */
export const RouteStepSchema = z.object({
  instruction: z.string(),
  distanceM: z.number(),
  wayName: z.string().nullable(),
  type: z.number().nullable(),
  /** index into the route's `coordinates` where this step begins. */
  startIndex: z.number().int(),
  /** Roundabout exit to take (ORS `exit_number`). Optional: older stored walks lack it. */
  exitNumber: z.number().int().optional(),
});
export type RouteStep = z.infer<typeof RouteStepSchema>;

/**
 * How to reroute a walk in progress:
 * - `rejoin`: the walker left the route — go from here through the curiosities
 *   still ahead, back to the start (keeping the part already walked).
 * - `approach`: the walker hasn't reached the start yet (e.g. an address chosen
 *   far away) — get them to the start, then follow the original route.
 */
export const RerouteStrategySchema = z.enum(['rejoin', 'approach']);
export type RerouteStrategy = z.infer<typeof RerouteStrategySchema>;

/** POST /walks/:id/reroute */
export const RerouteRequestSchema = z.object({
  lat: CoordSchema.shape.lat,
  lng: CoordSchema.shape.lng,
  strategy: RerouteStrategySchema,
  /** Last route vertex the walker was on; everything up to it is kept as walked. */
  fromIndex: z.number().int().min(0).optional(),
  /** Length of the route the client is navigating — a stale route gets a 409. */
  coordsCount: z.number().int().min(2),
});
export type RerouteRequest = z.infer<typeof RerouteRequestSchema>;

/** How the route was produced: real streets through stops, a real loop, or a stylized fallback. */
export const RouteSourceSchema = z.enum(['through', 'loop', 'synthetic']);
export type RouteSource = z.infer<typeof RouteSourceSchema>;

export const WalkSchema = z.object({
  id: z.string(),
  status: WalkStatusSchema,
  startLat: z.number(),
  startLng: z.number(),
  plannedMinutes: z.number().int(),
  distanceKm: z.number(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  route: RouteGeometrySchema,
  steps: z.array(RouteStepSchema),
  source: RouteSourceSchema,
  curiosities: z.array(WalkCuriositySchema),
});
export type Walk = z.infer<typeof WalkSchema>;

/** A row in the "past wanders" list — summary only. */
export const WalkSummarySchema = z.object({
  id: z.string(),
  status: WalkStatusSchema,
  label: z.string(),
  durationMin: z.number().int(),
  distanceKm: z.number(),
  found: z.number().int(),
  total: z.number().int(),
  route: RouteGeometrySchema,
  completedAt: z.string().nullable(),
});
export type WalkSummary = z.infer<typeof WalkSummarySchema>;

/** GET /walks — list plus lifetime totals for the Wanders header. */
export const WalkListResponseSchema = z.object({
  walks: z.array(WalkSummarySchema),
  totals: z.object({
    walks: z.number().int(),
    distanceKm: z.number(),
    curiosities: z.number().int(),
  }),
});
export type WalkListResponse = z.infer<typeof WalkListResponseSchema>;
