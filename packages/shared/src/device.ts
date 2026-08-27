import { z } from 'zod';

/** POST /devices — register an anonymous device, receive a bearer token. */
export const RegisterDeviceResponseSchema = z.object({
  deviceId: z.string(),
  token: z.string(),
});
export type RegisterDeviceResponse = z.infer<typeof RegisterDeviceResponseSchema>;
