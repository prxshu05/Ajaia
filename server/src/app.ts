import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type Request } from 'express';
import multer from 'multer';
import { z } from 'zod';
import {
  SESSION_COOKIE, SESSION_TTL_MS, createSession, loadUser, requireUser, verifyPassword, type User,
} from './auth.ts';
import { MAX_UPLOAD_BYTES, SUPPORTED_EXTENSIONS, importFile, sanitizeContent } from './content.ts';
import type { Db } from './db.ts';
import { HttpError, errorHandler, notFound } from './errors.ts';

export type Role = 'owner' | 'editor' | 'viewer';

type DocRow = {
  id: string; title: string; content: string; version: number;
  owner_id: string; owner_name: string; owner_email: string;
  updated_by_name: string | null; created_at: Date; updated_at: Date; role: Role;
};

const DOC_SELECT = `
  SELECT d.id, d.title, d.content, d.version, d.owner_id, d.created_at, d.updated_at,
         o.name AS owner_name, o.email AS owner_email, ub.name AS updated_by_name,
         CASE WHEN d.owner_id = $2 THEN 'owner' ELSE s.role END AS role
  FROM documents d
  JOIN users o ON o.id = d.owner_id
  LEFT JOIN document_shares s ON s.document_id = d.id AND s.user_id = $2
  LEFT JOIN users ub ON ub.id = d.updated_by`;

function toSummary(r: DocRow) {
  return {
    id: r.id,
    title: r.title,
    role: r.role,
    owner: { id: r.owner_id, name: r.owner_name, email: r.owner_email },
    updatedAt: r.updated_at,
    updatedBy: r.updated_by_name,
    createdAt: r.created_at,
  };
}

function toDocument(r: DocRow) {
  return { ...toSummary(r), content: r.content, version: r.version };
}

const titleSchema = z.string().trim().min(1, 'Title cannot be empty').max(200, 'Title is too long (max 200 characters)');
const contentSchema = z.string().max(1_000_000, 'Document is too large');

const createSchema = z.object({ title: titleSchema.optional(), content: contentSchema.optional() });
const updateSchema = z
  .object({
    title: titleSchema.optional(),
    content: contentSchema.optional(),
    baseVersion: z.number().int().positive().optional(),
  })
  .refine((b) => b.title !== undefined || b.content !== undefined, 'Nothing to update')
  .refine((b) => b.content === undefined || b.baseVersion !== undefined, 'baseVersion is required when updating content');
const loginSchema = z.object({ email: z.string().trim().toLowerCase(), password: z.string() });
const shareSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  role: z.enum(['viewer', 'editor']),
});
const roleSchema = z.object({ role: z.enum(['viewer', 'editor']) });

export function createApp(db: Db, opts: { clientDist?: string } = {}) {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(loadUser(db));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if ((SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) cb(null, true);
      else cb(new HttpError(400, `Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`));
    },
  });

  /** Loads a document the current user can access, or 404s (we don't reveal existence). */
  async function getAccessibleDoc(docId: string, user: User): Promise<DocRow> {
    const { rows } = await db.query<DocRow>(
      `${DOC_SELECT} WHERE d.id = $1 AND (d.owner_id = $2 OR s.user_id IS NOT NULL)`,
      [docId, user.id],
    );
    if (!rows[0]) throw notFound();
    return rows[0];
  }

  function assertRole(doc: DocRow, allowed: Role[], action: string) {
    if (!allowed.includes(doc.role)) throw new HttpError(403, `You don't have permission to ${action}`);
  }

  const me = (req: Request) => req.user as User;

  // ---------- health & auth ----------
  app.get('/api/health', (_req, res) => { res.json({ ok: true }); });

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = loginSchema.parse(req.body ?? {});
    const { rows } = await db.query<User & { password_hash: string }>(
      'SELECT id, email, name, password_hash FROM users WHERE email = $1',
      [email],
    );
    const row = rows[0];
    if (!row || !verifyPassword(password, row.password_hash)) {
      throw new HttpError(401, 'Incorrect email or password');
    }
    const token = await createSession(db, row.id);
    res.cookie(SESSION_COOKIE, token, {
      // req.secure honours X-Forwarded-Proto (trust proxy), so this is true behind an HTTPS host.
      httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: SESSION_TTL_MS,
    });
    res.json({ user: { id: row.id, email: row.email, name: row.name } });
  });

  app.post('/api/auth/logout', async (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) await db.query('DELETE FROM sessions WHERE token = $1', [token]);
    res.clearCookie(SESSION_COOKIE);
    res.status(204).end();
  });

  // Returns { user: null } rather than 401 so the app can check for a session without logging errors.
  app.get('/api/auth/me', (req, res) => { res.json({ user: req.user ?? null }); });

  // Small internal directory used for share autocomplete. Fine for an internal tool;
  // a real deployment would scope this to the user's organisation.
  app.get('/api/users', requireUser, async (req, res) => {
    const { rows } = await db.query<User>('SELECT id, email, name FROM users WHERE id <> $1 ORDER BY name', [me(req).id]);
    res.json({ users: rows });
  });

  // ---------- documents ----------
  app.get('/api/documents', requireUser, async (req, res) => {
    const { rows } = await db.query<DocRow>(
      `${DOC_SELECT} WHERE d.owner_id = $1 OR s.user_id = $1 ORDER BY d.updated_at DESC`,
      [me(req).id, me(req).id],
    );
    const docs = rows.map(toSummary);
    res.json({
      owned: docs.filter((d) => d.role === 'owner'),
      shared: docs.filter((d) => d.role !== 'owner'),
    });
  });

  app.post('/api/documents', requireUser, async (req, res) => {
    const body = createSchema.parse(req.body ?? {});
    const id = randomUUID();
    await db.query(
      `INSERT INTO documents (id, owner_id, title, content, updated_by) VALUES ($1, $2, $3, $4, $2)`,
      [id, me(req).id, body.title ?? 'Untitled document', sanitizeContent(body.content ?? '')],
    );
    res.status(201).json({ document: toDocument(await getAccessibleDoc(id, me(req))) });
  });

  app.post('/api/documents/import', requireUser, upload.single('file'), async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Choose a file to upload');
    // multer decodes the filename as latin1; restore UTF-8 names (e.g. "Résumé.docx").
    const filename = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const { title, content } = await importFile(filename, req.file.buffer);
    const id = randomUUID();
    await db.query(
      `INSERT INTO documents (id, owner_id, title, content, updated_by) VALUES ($1, $2, $3, $4, $2)`,
      [id, me(req).id, title, content],
    );
    res.status(201).json({ document: toDocument(await getAccessibleDoc(id, me(req))) });
  });

  app.get('/api/documents/:id', requireUser, async (req, res) => {
    res.json({ document: toDocument(await getAccessibleDoc(String(req.params.id), me(req))) });
  });

  app.patch('/api/documents/:id', requireUser, async (req, res) => {
    const user = me(req);
    const doc = await getAccessibleDoc(String(req.params.id), user);
    assertRole(doc, ['owner', 'editor'], 'edit this document');
    const body = updateSchema.parse(req.body ?? {});

    if (body.content !== undefined) {
      // Optimistic concurrency: only apply if nobody saved since the client last loaded.
      const { rows } = await db.query(
        `UPDATE documents
         SET content = $1, title = COALESCE($2, title), version = version + 1,
             updated_by = $3, updated_at = now()
         WHERE id = $4 AND version = $5 RETURNING id`,
        [sanitizeContent(body.content), body.title ?? null, user.id, doc.id, body.baseVersion],
      );
      if (!rows[0]) {
        const latest = await getAccessibleDoc(doc.id, user);
        res.status(409).json({
          error: `This document was changed by ${latest.updated_by_name ?? 'someone else'} while you were editing.`,
          document: toDocument(latest),
        });
        return;
      }
    } else {
      // Title-only rename: last write wins, does not bump the content version.
      await db.query(
        `UPDATE documents SET title = $1, updated_by = $2, updated_at = now() WHERE id = $3`,
        [body.title, user.id, doc.id],
      );
    }
    res.json({ document: toDocument(await getAccessibleDoc(doc.id, user)) });
  });

  app.delete('/api/documents/:id', requireUser, async (req, res) => {
    const doc = await getAccessibleDoc(String(req.params.id), me(req));
    assertRole(doc, ['owner'], 'delete this document');
    await db.query('DELETE FROM documents WHERE id = $1', [doc.id]);
    res.status(204).end();
  });

  // ---------- sharing ----------
  async function listShares(docId: string) {
    const { rows } = await db.query<{ user_id: string; name: string; email: string; role: Role }>(
      `SELECT s.user_id, u.name, u.email, s.role FROM document_shares s
       JOIN users u ON u.id = s.user_id WHERE s.document_id = $1 ORDER BY s.created_at`,
      [docId],
    );
    return rows.map((r) => ({ userId: r.user_id, name: r.name, email: r.email, role: r.role }));
  }

  app.get('/api/documents/:id/shares', requireUser, async (req, res) => {
    const doc = await getAccessibleDoc(String(req.params.id), me(req));
    res.json({ shares: await listShares(doc.id) });
  });

  app.post('/api/documents/:id/shares', requireUser, async (req, res) => {
    const doc = await getAccessibleDoc(String(req.params.id), me(req));
    assertRole(doc, ['owner'], 'share this document');
    const { email, role } = shareSchema.parse(req.body ?? {});
    const { rows } = await db.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
    const target = rows[0];
    if (!target) throw new HttpError(404, `No user found with email ${email}`);
    if (target.id === doc.owner_id) throw new HttpError(400, 'You already own this document');
    await db.query(
      `INSERT INTO document_shares (document_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (document_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [doc.id, target.id, role],
    );
    res.status(201).json({ shares: await listShares(doc.id) });
  });

  app.patch('/api/documents/:id/shares/:userId', requireUser, async (req, res) => {
    const doc = await getAccessibleDoc(String(req.params.id), me(req));
    assertRole(doc, ['owner'], 'change sharing');
    const { role } = roleSchema.parse(req.body ?? {});
    const { rows } = await db.query(
      'UPDATE document_shares SET role = $1 WHERE document_id = $2 AND user_id = $3 RETURNING user_id',
      [role, doc.id, String(req.params.userId)],
    );
    if (!rows[0]) throw new HttpError(404, 'That person does not have access');
    res.json({ shares: await listShares(doc.id) });
  });

  app.delete('/api/documents/:id/shares/:userId', requireUser, async (req, res) => {
    const doc = await getAccessibleDoc(String(req.params.id), me(req));
    assertRole(doc, ['owner'], 'change sharing');
    await db.query('DELETE FROM document_shares WHERE document_id = $1 AND user_id = $2', [
      doc.id, String(req.params.userId),
    ]);
    res.json({ shares: await listShares(doc.id) });
  });

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

  // ---------- static client (production build) ----------
  if (opts.clientDist && fs.existsSync(opts.clientDist)) {
    const indexHtml = path.join(opts.clientDist, 'index.html');
    app.use(express.static(opts.clientDist, { index: false }));
    app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(indexHtml) : next()));
  }

  app.use(errorHandler);
  return app;
}
