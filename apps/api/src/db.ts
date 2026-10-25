import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { MIGRATIONS } from './migrations';

/**
 * Minimal Postgres access shared by both backends: real Postgres (`pg`, when
 * DATABASE_URL is set) and PGlite (Postgres compiled to WASM, embedded) for local
 * dev and tests. Same SQL either way.
 */
export interface Db {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Runs `fn` in a transaction; it rolls back if `fn` throws. */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** PGlite database in `dataDir`, or in memory when omitted. */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  // PGlite creates the data dir itself but not its parents (fresh checkout: no `.data/`).
  if (dataDir) mkdirSync(dirname(dataDir), { recursive: true });
  const pglite = dataDir ? await PGlite.create(dataDir) : await PGlite.create();
  // Inside a transaction, nested transaction() calls join the outer one.
  const scoped = (q: Pick<PGlite, 'query'>): Db => ({
    query: async <T>(sql: string, params: unknown[] = []) => (await q.query<T>(sql, params)).rows as T[],
    transaction: (fn) => fn(scoped(q)),
    close: async () => {},
  });
  return {
    query: scoped(pglite).query,
    transaction: (fn) => pglite.transaction((tx) => fn(scoped(tx))),
    close: () => pglite.close(),
  };
}

export async function createPostgresDb(connectionString: string): Promise<Db> {
  const pool = new pg.Pool({ connectionString });
  // Inside a transaction, nested transaction() calls join the outer one.
  const onClient = (c: pg.PoolClient): Db => ({
    query: async <T>(sql: string, params: unknown[] = []) => (await c.query(sql, params)).rows as T[],
    transaction: (inner) => inner(onClient(c)),
    close: async () => {},
  });
  return {
    query: async <T>(sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows as T[],
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(onClient(client));
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

/** Applies pending migrations in order, each in its own transaction. */
export async function migrate(db: Db): Promise<void> {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (version int PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await db.query<{ version: number }>('SELECT version FROM schema_migrations')).map((r) => r.version));
  for (const [i, sql] of MIGRATIONS.entries()) {
    const version = i + 1;
    if (done.has(version)) continue;
    await db.transaction(async (tx) => {
      for (const statement of sql.split(';').map((s) => s.trim()).filter(Boolean)) await tx.query(statement);
      await tx.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
    });
  }
}
