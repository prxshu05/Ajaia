import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.ts';
import { migrate, openDb, seed } from './db.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = Number(process.env.PORT ?? 3001);

const db = await openDb({
  databaseUrl: process.env.DATABASE_URL || undefined,
  dataDir: process.env.DATA_DIR ?? path.join(root, 'data', 'pglite'),
});
await migrate(db);
await seed(db);

const app = createApp(db, { clientDist: path.join(root, 'client', 'dist') });

const server = app.listen(port, () => {
  const storage = process.env.DATABASE_URL ? 'Postgres (DATABASE_URL)' : 'embedded PGlite';
  console.log(`Ajaia Docs API listening on http://localhost:${port} using ${storage}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    db.close().finally(() => process.exit(0));
  });
}
