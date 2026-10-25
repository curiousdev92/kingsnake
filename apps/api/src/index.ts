import { authSecret, internalKey } from '@snake/auth';
import { buildApp } from './app';
import { createPgliteDb, createPostgresDb, migrate } from './db';

const port = Number(process.env.PORT ?? 3000);
const production = process.env.NODE_ENV === 'production';

// Real Postgres when DATABASE_URL is set; otherwise an embedded PGlite database on disk.
const db = process.env.DATABASE_URL
  ? await createPostgresDb(process.env.DATABASE_URL)
  : await createPgliteDb(process.env.PGLITE_DIR ?? '.data/pglite');
await migrate(db);

const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean);
if (production && !corsOrigins?.length) throw new Error('CORS_ORIGINS must be set in production');

const app = await buildApp({
  db,
  authSecret: authSecret(),
  internalKey: internalKey(),
  corsOrigin: corsOrigins?.length ? corsOrigins : true,
  logger: true,
});

const close = async () => {
  await app.close();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', close);
process.on('SIGTERM', close);

await app.listen({ port, host: '0.0.0.0' });
