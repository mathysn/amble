import { createHash, randomBytes } from 'node:crypto';

/** A fresh opaque bearer token (returned to the client once, never stored raw). */
export function newToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
