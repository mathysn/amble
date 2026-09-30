import { z } from 'zod';
import { PaceSchema, UnitsSchema } from './common';

export const SettingsSchema = z.object({
  defaultLength: z.number().int().positive(),
  pace: PaceSchema,
  avoidBusyRoads: z.boolean(),
  includeNiche: z.boolean(),
  includeHidden: z.boolean(),
  includeScenic: z.boolean(),
  units: UnitsSchema,
});
export type Settings = z.infer<typeof SettingsSchema>;

/** PATCH /settings — every field optional. */
export const UpdateSettingsSchema = SettingsSchema.partial();
export type UpdateSettings = z.infer<typeof UpdateSettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  defaultLength: 40,
  pace: 'easy',
  avoidBusyRoads: true,
  includeNiche: true,
  includeHidden: true,
  includeScenic: false,
  units: 'km',
};
