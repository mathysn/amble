import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { prisma } from '../db.js';
import { hashToken } from '../lib/token.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** preHandler that requires a valid device bearer token. */
    requireDevice: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    deviceId: string;
  }
}

/**
 * Anonymous device auth. Clients send `Authorization: Bearer <token>`; we look
 * up the device by the token's hash and stash its id on the request.
 */
export const authPlugin = fp(async (fastify) => {
  fastify.decorateRequest('deviceId', '');

  fastify.decorate('requireDevice', async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      await reply.code(401).send({ error: 'Missing device token' });
      return;
    }
    const device = await prisma.device.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!device) {
      await reply.code(401).send({ error: 'Unknown device' });
      return;
    }
    req.deviceId = device.id;
  });
});
