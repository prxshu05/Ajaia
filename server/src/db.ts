import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { hashPassword } from './auth.ts';

/**
 * Minimal query interface shared by PGlite (embedded Postgres, used locally and in tests)
 * and node-postgres (used in production when DATABASE_URL is set). Both speak the same
 * SQL dialect and `$1` placeholders, so the app code has exactly one code path.
 */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  close(): Promise<void>;
}

export async function openDb(opts: { databaseUrl?: string; dataDir?: string } = {}): Promise<Db> {
  if (opts.databaseUrl) {
    const isLocal = /localhost|127\.0\.0\.1/.test(opts.databaseUrl);
    const pool = new pg.Pool({
      connectionString: opts.databaseUrl,
      ssl: isLocal ? undefined : { rejectUnauthorized: false },
      max: 5,
    });
    return {
      query: async (sql, params) => pool.query(sql, params as unknown[]) as never,
      close: () => pool.end(),
    };
  }
  // dataDir undefined => in-memory (tests); otherwise persisted to disk.
  // PGlite does not create parent directories, so make sure the path exists on a fresh checkout.
  if (opts.dataDir) fs.mkdirSync(opts.dataDir, { recursive: true });
  const lite = new PGlite(opts.dataDir);
  await lite.waitReady;
  return {
    query: (sql, params) => lite.query(sql, params) as never,
    close: () => lite.close(),
  };
}

// Note: migrate() splits this on ';', so keep semicolons out of SQL comments.
// The ALTER TABLE ... ENABLE ROW LEVEL SECURITY lines lock out hosted-Postgres REST APIs (e.g. Supabase
// exposes the public schema automatically). With RLS on and no policies that API gets no rows, while
// the app itself connects as the table owner, which bypasses RLS.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  version    INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_owner_idx ON documents(owner_id);

CREATE TABLE IF NOT EXISTS document_shares (
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, user_id)
);
CREATE INDEX IF NOT EXISTS document_shares_user_idx ON document_shares(user_id);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_shares ENABLE ROW LEVEL SECURITY;
`;

export const SEED_PASSWORD = 'password123';
export const SEED_USERS = [
  { id: 'u_alice', email: 'alice@ajaia.test', name: 'Alice Chen' },
  { id: 'u_bob', email: 'bob@ajaia.test', name: 'Bob Okafor' },
  { id: 'u_carol', email: 'carol@ajaia.test', name: 'Carol Diaz' },
];

export async function migrate(db: Db): Promise<void> {
  // Run statements one at a time: node-postgres does not allow multiple
  // statements in a parameterised query, and this keeps both drivers happy.
  for (const stmt of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) {
    await db.query(stmt);
  }
}

export async function seed(db: Db): Promise<void> {
  const existing = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM users');
  if (existing.rows[0].n > 0) return; // only seed a fresh database

  const hash = hashPassword(SEED_PASSWORD);
  for (const u of SEED_USERS) {
    await db.query(
      `INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [u.id, u.email, u.name, hash],
    );
  }

  // One welcome document owned by Alice and shared with Bob, so the sharing
  // flow is demonstrable immediately on a fresh deployment.
  await db.query(
    `INSERT INTO documents (id, owner_id, title, content, updated_by)
     VALUES ($1, $2, $3, $4, $2)
     ON CONFLICT (id) DO NOTHING`,
    [
      'd_welcome',
      'u_alice',
      'Q4 planning notes (shared demo)',
      '<h1>Q4 planning notes</h1><p>This document is <strong>owned by Alice</strong> and shared with <em>Bob</em> as an <u>editor</u>.</p><h2>Priorities</h2><ol><li>Ship the editor MVP</li><li>Collect feedback from two pilot teams</li></ol><ul><li>Log in as Bob to see it under <em>Shared with me</em>.</li><li>Log in as Carol to confirm she cannot access it.</li></ul>',
    ],
  );
  await db.query(
    `INSERT INTO document_shares (document_id, user_id, role) VALUES ('d_welcome', 'u_bob', 'editor')
     ON CONFLICT DO NOTHING`,
  );
}
