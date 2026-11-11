# Ajaia Docs

A lightweight collaborative document editor: create and format documents in the browser, import existing files, and share them with teammates as viewers or editors.

**Live app:** https://ajaia-docs-25s9.onrender.com (free hosting: the first load after about 15 minutes idle can take up to a minute while the server wakes) · **Source:** https://github.com/prxshu05/Ajaia · **Walkthrough video:** https://drive.google.com/file/d/17QSpqviOdTeKF1Zr6YfD2n8QHZhHELIq/view?usp=sharing

## Demo accounts

All accounts use the password **`password123`**. The login page also has one-click buttons for each account.

| User | Email | What to try |
|---|---|---|
| Alice Chen | `alice@ajaia.test` | Owns *Q4 planning notes (shared demo)*, which is shared with Bob |
| Bob Okafor | `bob@ajaia.test` | Sees that document under **Shared with me**, with edit access |
| Carol Diaz | `carol@ajaia.test` | Has no access to anything at first. Share a doc with her to try it out |

**Suggested 2-minute review path**

1. Sign in as Alice and create a document. Name it, then use headings, bold, italic, underline and lists.
2. Reload the page. The content, formatting and title are still there.
3. Click **Share** and add `carol@ajaia.test` with **Can view**.
4. In a private window, sign in as Carol. The doc appears under **Shared with me**, is read-only, and shows no toolbar.
5. As Alice, change Carol to **Can edit**. Carol reloads and can now edit. Alice sees Carol's changes appear within about 8 seconds.
6. Click **Import file** and upload [`docs/sample-import.docx`](docs/sample-import.docx) or [`docs/sample-import.md`](docs/sample-import.md), or any `.docx`/`.md`/`.txt` file of your own.

## Features

| Area | What works |
|---|---|
| **Editing** | Rich text (TipTap/ProseMirror) with headings H1–H3, bold, italic, underline, strikethrough, bulleted and numbered lists, quotes, undo/redo and the usual keyboard shortcuts |
| **Documents** | Create, rename (inline title), delete (owner only). Autosaves 0.8 s after you stop typing, with a visible save status and a warning if you close the tab with unsaved changes |
| **File upload** | `.txt`, `.md`/`.markdown` and `.docx` files (max 2 MB) become a new editable document. Headings, lists, bold/italic/underline and links are kept. Images are dropped and tables are flattened to text. These limits are stated in the UI too |
| **Sharing** | Each document has one owner. The owner shares by email as **Can view** or **Can edit**, and can change or revoke access. The list is split into **My documents** and **Shared with me**, with role badges |
| **Access control** | Enforced on the server for every request. Users without access get a 404, so they can't tell whether the document exists. Viewers get a 403 if they try to edit. Only the owner can share or delete |
| **Concurrent edits** | Every save is version-checked. If someone else saved in the meantime, you choose to load their version or keep yours. You never silently overwrite their work. When you have no unsaved changes, collaborators' edits appear automatically |
| **Persistence** | Postgres. Locally it runs as embedded PGlite, so there's nothing to install. In production it's any Postgres via `DATABASE_URL` |

## Run locally

Requires **Node.js 22.18 or later** (24 recommended). The server runs TypeScript directly through Node's built-in type stripping.

```bash
npm install
npm run dev          # API on :3001 and Vite on http://localhost:5173 (open this one)
```

To run a production build locally:

```bash
npm run build
npm start            # serves app and API on http://localhost:3001
```

Data is stored in `./data/pglite`. Delete that folder to reset to the seed data.

### Tests and checks

```bash
npm test             # API integration tests (Vitest + Supertest against in-memory Postgres)
npm run typecheck    # server and client
```

The tests cover auth, the full owner → viewer → editor → revoked sharing flow, conflict detection, HTML sanitisation (XSS), title validation, and importing `.md`, `.txt` and real `.docx` files (built in the test).

There's also a browser smoke test, [`scripts/e2e-smoke.mjs`](scripts/e2e-smoke.mjs). It drives Alice, Bob and Carol in headless Chrome through every flow and regenerates [`docs/screenshots`](docs/screenshots). Instructions are at the top of the file.

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | HTTP port |
| `DATABASE_URL` | unset | Postgres connection string. If unset, embedded PGlite is used (local dev only; needs about 1 GB RAM on first boot) |
| `DATA_DIR` | `./data/pglite` | PGlite data directory, used when `DATABASE_URL` is unset |

## Deploy

**Render (free, no card) with Supabase Postgres:**
1. Push this repo to GitHub, then in Render choose **New → Blueprint** and select the repo. [`render.yaml`](render.yaml) configures the build, start command and health check.
2. Create a free Supabase project. In **Connect → Session pooler**, copy the URI, which uses port 5432 and IPv4. Replace `[YOUR-PASSWORD]` with the database password, which you can reset under *Project Settings → Database*.
3. Paste that URI into the Render service's `DATABASE_URL` setting. On first boot the app creates its tables and seeds the demo users. RLS is switched on, so Supabase's auto-generated REST API can't read them.

`DATABASE_URL` is **required on Render's free plan**. Creating a fresh embedded database peaks at about 1 GB of RAM (measured), which exceeds the 512 MB instance. Without it, the server exits with a clear message instead of crashing in a loop.

**Any container host:** use the [`Dockerfile`](Dockerfile), and mount a volume at `/data` or set `DATABASE_URL`.

## Project layout

```
server/src/
  app.ts       Express app: routes, validation (zod), access control
  auth.ts      scrypt password hashing, cookie sessions
  content.ts   HTML sanitiser allowlist and the .txt/.md/.docx importers
  db.ts        PGlite/pg adapter, schema, seed data
  index.ts     entry point
server/test/   API integration tests
client/src/
  pages/       Login, document list, editor
  components/  Toolbar, ShareDialog, AppHeader
  useDocumentSync.ts   autosave, conflict handling, remote-change polling
```

## Status

**Working end to end:** everything in the Features table, verified by the automated tests and the browser smoke run (screenshots in [`docs/screenshots`](docs/screenshots)).

**Not built (deliberately):**
- Real-time co-editing with live cursors
- Comments
- Version history
- Export
- Self-service sign-up and password reset
- Importing into an existing document (imports always create a new doc)

**Next 2–4 hours, in order:**
1. Version history: store a snapshot on each save and add a restore UI. The version counter is already there.
2. Export to Markdown/PDF.
3. Real-time co-editing with Yjs over WebSockets, to replace polling and the conflict prompt.
4. Rate limiting on login, and an org-scoped user directory.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the reasoning behind these choices and [AI_WORKFLOW.md](AI_WORKFLOW.md) for how AI tools were used.
