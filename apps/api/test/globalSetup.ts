import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Give every test run its own brand-new SQLite file in the OS temp dir, created
 * from the Prisma schema with a plain (non-destructive) `db push`, and delete it
 * afterwards. Tests never touch — or reset — the dev database.
 */
export default function setup() {
  const file = join(tmpdir(), `amble-api-test-${process.pid}-${Date.now()}.db`);
  const url = `file:${file.replace(/\\/g, '/')}`;
  // Workers are spawned after global setup, so they inherit this.
  process.env.DATABASE_URL = url;
  execSync('prisma db push --skip-generate', {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  return () => {
    for (const f of [file, `${file}-journal`]) rmSync(f, { force: true });
  };
}
