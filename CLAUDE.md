# CLAUDE.md — Ajaia Docs (AI-Native Full Stack Assignment)

> ## ⚠️ As-built status (read this first; added 2026-11-11, see PROMPT_LOG.md #5)
>
> The original plan below was given to Claude Code **after** the app had already been built from the assignment
> brief (PROMPT_LOG.md #1). The human chose to **keep the existing, tested app** and adopt only the process
> rules from this file: the prompt log, checkpoints, build and test after each change, and the video script.
> The plan is kept unchanged below for the record. **When it conflicts with the code, the code and the table
> below are what's true.** Don't rebuild towards the plan without asking the human.
>
> | Topic | Plan below | As built |
> |---|---|---|
> | Language | JavaScript | TypeScript (Node runs `.ts` directly; client bundled by Vite) |
> | Backend / auth | Supabase Auth + RLS, no server | Express API, scrypt + cookie sessions; access checked in one server-side query (`getAccessibleDoc`) |
> | Database | Supabase Postgres, `content jsonb` | Postgres: embedded PGlite locally and in tests; Supabase Postgres (`ajaia-docs`, session pooler) in production via `DATABASE_URL`; `content` is sanitised HTML; RLS on with no policies (locks out Supabase's REST API) |
> | Deploy | Vercel | Render free plan (`render.yaml`), live at https://ajaia-docs-25s9.onrender.com; Docker also supported |
> | Roles | All collaborators can edit | Owner / editor / viewer |
> | Import | `.txt`, `.md`, 1 MB | `.txt`, `.md`, `.docx`, 2 MB |
> | Headings | H1–H2 | H1–H3 (H4–H6 → H3) |
> | Concurrency | Last-write-wins | Version check (409 + "load theirs / keep mine") and 8 s polling |
> | Demo users | alice/bob@demo.com, `Demo@1234` | alice/bob/carol@ajaia.test, `password123` |
> | Tests | `tests/*.test.js` (jsdom unit tests) | `server/test/api.test.ts` (API integration, 9 tests) + `scripts/e2e-smoke.mjs` |
>
> Commands: `npm run dev`, `npm run build`, `npm start`, `npm test`, `npm run typecheck`.
> Rules still in force: §0 working rules 4, 5, 8, 9, 10 · §0.1 prompt log (append-only, truthful) ·
> §0.2 checkpoints that still apply (manual two-user test before deploy; ask the human before writing docs) ·
> §11.1 video script.

---

You are helping build a **lightweight collaborative document editor inspired by Google Docs** for a time-boxed
(about 4 hours) hiring assessment. The human (Prasanna) makes the product decisions; you implement, explain, and verify.
Prioritise a **working, deployed, well-explained product slice** over feature count.

---

## 0. Working rules (read first)

1. **Build in the order of Section 9.** Finish and verify one step before starting the next.
2. **Stay in scope (Section 3).** If something is out of scope, do not build it — mention it as a "next step" instead.
3. **Do not change the database schema** (Section 5) without asking first. It lives in `supabase/migrations/0001_init.sql` and is applied in Step 0.
4. **After every change:** run `npm run build` (and `npm test` once tests exist) and fix all errors before saying you are done.
5. **Explain briefly** what you changed and why (2–5 bullet points). Flag any assumption you made.
6. **Keep code simple and readable.** Small components, clear names, no clever abstractions. JavaScript (not TypeScript).
7. **Pure logic goes in `src/lib/`** (file import, validation) so it can be unit-tested without the browser.
8. **Never hard-code secrets.** Read Supabase keys from env vars only. Never print or commit `.env`.
9. **Handle errors visibly:** every Supabase call checks `error` and shows a friendly message in the UI.
10. If a requirement is ambiguous, choose the simplest reasonable behaviour and state it.

---

## 0.1 Prompt log protocol (MANDATORY — this is graded)

Ajaia evaluates *how* AI was used: prompting quality, decomposition, iteration, and what the human changed or
rejected. Maintain `PROMPT_LOG.md` in the repo root as a **truthful, append-only** record of this build.

**After every task you complete (every user message that asks you to do something), append one entry:**

```markdown
### <N>. <short title> — <HH:MM local time>
- **Prompt (verbatim):** "<the human's exact message to you>"
- **Plan:** <1–3 bullets: how you decomposed the task>
- **What I (Claude Code) did:** <files created/changed, commands run>
- **Verification:** <build/test/manual check run and its result>
- **Issues found & fixed:** <errors from build/tests, wrong assumptions, bugs — and the fix; "None" if none>
- **Human decision:** <ONLY what the human actually said or did: approved plan / corrected X / rejected Y /
  chose option Z. If the human has not responded yet, write "Pending" and update it next entry.>
- **Commit:** <commit message, if a commit was made>
```

Rules for the log:
1. **Never invent events.** Do not fabricate prompts, rejections, corrections or test results. If something did
   not happen, do not write it. Accuracy matters more than looking impressive — reviewers may ask about any entry.
2. Record your own mistakes honestly (e.g. "first RLS query caused recursion; fixed with security-definer helper",
   "build failed on missing import; fixed"). Caught mistakes are good evidence of verification.
3. When the human corrects or rejects your output, record it precisely under **Human decision**, including why
   if they said why.
4. Keep entries short (5–8 lines). Do not paste large code blocks into the log.
5. Start the file with a header: project name, date, tools used (Claude Code + Claude chat for planning), and a
   one-line note: "Planning, scope and schema were drafted with Claude (chat) before coding; see entry 0."
6. Entry 0 (write it first): "Planning with Claude chat — scope, stack, schema + RLS design, build order.
   Human decisions: cut realtime collaboration, comments, version history, .docx and roles to fit the 4-hour
   timebox; chose Supabase + RLS so access control is enforced in the database."

## 0.2 Human review checkpoints (ask, then wait)

At these moments STOP and ask the human to decide; record the answer in the log:
- Before Step 1: show the plan and file structure — ask for approval.
- Editor (Step 3): ask whether shared users may rename titles (default proposal: owner only).
- Sharing (Step 4): confirm "all collaborators can edit" (no viewer role) is acceptable for this timebox.
- Upload (Step 5): confirm supported types (.txt and .md only, 1 MB) and that H3–H6 map to H2.
- Autosave: confirm debounce (~800 ms) and last-write-wins behaviour.
- Before deploy: ask the human to manually test the two-user sharing flow and report the result.
- Before writing docs: ask the human for anything they personally changed/rejected that is not yet in the log.

---

## 1. Product summary

A small web app where a user can:

- Log in (seeded demo users).
- See a dashboard split into **"My documents"** and **"Shared with me"**.
- Create, rename, open, edit and delete (owner only) documents.
- Format text: **Bold, Italic, Underline, Heading 1, Heading 2, Bulleted list, Numbered list**.
- Have edits **autosaved** so documents and formatting survive a refresh.
- **Share** a document with another user by email; the other user then sees it under "Shared with me" and can edit it.
- **Upload a `.txt` or `.md` file** to create a new editable document from its contents.

---

## 2. Tech stack (fixed)

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Vite + React (JavaScript) | `react-router-dom` for routing |
| Editor | TipTap | `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-underline` (if the installed TipTap version already includes Underline in StarterKit, do not register it twice) |
| Backend / DB / Auth | Supabase | `@supabase/supabase-js`; email + password auth; Postgres; Row Level Security (RLS) enforces access |
| File import | `marked` (Markdown → HTML), `dompurify` (sanitise HTML) | |
| Tests | Vitest | `npm test` runs `vitest run` |
| Styling | Plain CSS (`src/styles.css`) | Clean, minimal, Google-Docs-like layout |
| Deploy | Vercel | SPA rewrite via `vercel.json` |

Environment variables (`.env`, and `.env.example` committed with empty values):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
# server-side only, used by scripts/seed-users.mjs — NEVER prefix with VITE_, never commit, never use in src/
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_PROJECT_REF=
```

---

## 3. Scope

### In scope (must work end to end)
- Login / logout with seeded users; protected routes.
- Dashboard: two lists (owned vs shared), each showing title, last updated time, and for shared docs the owner's email.
- Create new document ("Untitled document"), open it immediately.
- Rename (owner only) with validation.
- Rich-text editing with toolbar (Section 6.3) and autosave.
- Share by email (owner only), list current collaborators, remove access.
- Upload `.txt` / `.md` → new document (owned by the uploader).
- Delete document (owner only, with confirm).
- Basic validation + error handling everywhere.
- At least one meaningful automated test (target: 2 test files).
- Deployed on Vercel.

### Out of scope (do NOT build; list as "next steps" in docs)
- Real-time co-editing / presence indicators
- Comments or suggestion mode
- Version history
- `.docx` / PDF import or export
- Viewer vs editor roles (all collaborators can edit)
- Email invites to people without an account
- Folders, search, sorting options

---

## 4. Demo users (created by `scripts/seed-users.mjs` in Step 0)

| Email | Password |
|---|---|
| alice@demo.com | Demo@1234 |
| bob@demo.com | Demo@1234 |

(Optionally carol@demo.com / Demo@1234 if the human adds a third.) Show these on the login page in a small
"Demo accounts" hint box so reviewers can test sharing quickly.

---

## 5. Database (defined in `supabase/migrations/0001_init.sql` — reference)

```sql
profiles(id uuid PK -> auth.users, email text unique)          -- auto-filled by trigger on signup
documents(id uuid PK, owner_id uuid -> auth.users, title text (1–200 chars),
          content jsonb default '{}', created_at timestamptz, updated_at timestamptz)
document_shares(document_id uuid -> documents, user_id uuid -> auth.users,
                created_at timestamptz, PK(document_id, user_id))
```

RLS rules (enforced in the database):
- `profiles`: any logged-in user can read (needed to look up a user by email when sharing).
- `documents`: read/update if you are the owner **or** the doc is shared with you; insert only with
  `owner_id = auth.uid()`; delete only if owner.
- `document_shares`: owner can insert/delete; you can read shares where you are the owner of the doc or the shared user.

Implications for the frontend:
- Always set `owner_id: user.id` when inserting a document.
- Always set `updated_at: new Date().toISOString()` when updating a document.
- Because of RLS, `select * from documents` already returns only owned + shared docs. Split them client-side:
  owned = `owner_id === user.id`, shared = the rest.
- `documents.owner_id` references `auth.users`, not `profiles`, so do **not** rely on a PostgREST join for the owner
  email. Fetch owner emails with a second query: `profiles.select('id,email').in('id', ownerIds)`.
- Duplicate share insert returns Postgres error code `23505` → show "Already shared with this user".

---

## 6. Feature specifications

### 6.1 Auth
- `/login`: email + password form → `supabase.auth.signInWithPassword`.
- Errors: empty fields → inline message; wrong credentials → "Invalid email or password".
- Disable the button while submitting.
- Session: use `supabase.auth.getSession()` on load and `onAuthStateChange` to keep state in an `AuthContext`.
- Protected routes redirect to `/login` when logged out; `/login` redirects to `/` when logged in.
- Header shows the user's email and a Logout button on every logged-in page.

### 6.2 Dashboard (`/`)
- Buttons: **New document**, **Upload .txt / .md**.
- Section **My documents**: title, "Updated <relative or local time>", Delete button (confirm dialog).
- Section **Shared with me**: title, "Owner: <email>", updated time, and a small "Shared" badge.
- Empty states: "No documents yet — create one or upload a file." / "Nothing shared with you yet."
- Loading state while fetching; error banner if a fetch fails.
- Sort each list by `updated_at` descending.
- Clicking a document opens `/doc/:id`.

### 6.3 Editor page (`/doc/:id`)
- Load the document by id. If not found or not accessible (RLS returns no row) → "Document not found or you
  don't have access" with a Back link.
- **Title**: editable inline input for the owner; read-only text for shared users. Save on blur or Enter.
  Validation via `validateTitle` (Section 6.6). Show the error inline; do not save invalid titles.
- **Toolbar** buttons (show active state using `editor.isActive(...)`):
  Bold, Italic, Underline, H1, H2, Bulleted list, Numbered list, plus Undo / Redo.
- **Content**: TipTap editor initialised from `document.content` (JSON). If content is empty `{}`, start with an
  empty paragraph.
- **Autosave**: on editor update, debounce ~800 ms, then `update({ content: editor.getJSON(), updated_at })`.
  Show a status indicator: "Saving…", "All changes saved", or "Save failed — retrying on next edit".
  Also save on page leave if there are unsaved changes (best effort).
- **Share panel** (owner only, button "Share"):
  - Email input + "Share" button.
  - Steps: validate email format → lower-case + trim → look up `profiles` by email →
    if not found: "No user with that email" → if it is the owner's own email: "You already own this document" →
    insert into `document_shares` → handle `23505` as "Already shared with this user".
  - List current collaborators (emails) with a "Remove" button (delete from `document_shares`).
- Shared users see "Shared with you by <owner email>" under the title and can edit content.
- "← Back to documents" link.

### 6.4 File upload (dashboard)
- Hidden `<input type="file" accept=".txt,.md,text/plain,text/markdown">` behind a button.
- UI text next to the button: "Supported: .txt and .md, up to 1 MB".
- Flow: validate file (`validateImportFile`) → read text (`file.text()`) → convert with `fileToHtml` →
  create a document with title = file name without extension (trimmed, max 200 chars) and content set by loading
  the HTML into TipTap and saving `getJSON()` — simplest approach: navigate to the new doc and pass the HTML via
  router state, then `editor.commands.setContent(html)` and save immediately. (Alternative acceptable: convert HTML
  to TipTap JSON with `generateJSON` from `@tiptap/html` using the same extensions.)
- Errors: wrong type → "Only .txt and .md files are supported"; too large → "File is larger than 1 MB";
  empty file → "File is empty"; read failure → "Could not read the file".

### 6.5 Import conversion rules (`src/lib/importFile.js`)
- `.txt`: escape HTML special characters (`& < > " '`), split on blank lines into paragraphs, single line
  breaks inside a paragraph become `<br>`; wrap each paragraph in `<p>`.
- `.md`: `marked.parse(text)` → sanitise with DOMPurify (allow only basic tags: p, h1–h6, strong, em, u, ul, ol,
  li, br, blockquote, code, pre, a). H3–H6 may be mapped to H2 since the editor supports H1–H2 only (state this).
- Export: `getExtension(name)`, `validateImportFile(file)` → `{ ok: true } | { ok: false, error }`,
  `fileToHtml(name, text)` → HTML string.
- DOMPurify needs a DOM; in tests use Vitest with `environment: 'jsdom'` (install `jsdom`).

### 6.6 Validation (`src/lib/validation.js`)
- `validateTitle(title)` → trimmed; required; 1–200 characters; returns `{ ok, value, error }`.
- `validateEmail(email)` → trimmed, lower-cased, basic regex; returns `{ ok, value, error }`.

---

## 7. Project structure

```
ajaia-docs/
  CLAUDE.md
  README.md
  ARCHITECTURE.md
  AI_WORKFLOW.md
  PROMPT_LOG.md
  SUBMISSION.md
  VIDEO_URL.txt
  screenshots/
  .env.example
  .gitignore
  vercel.json
  supabase/migrations/0001_init.sql
  scripts/seed-users.mjs
  index.html
  package.json
  vite.config.js
  src/
    main.jsx
    App.jsx                 # routes
    styles.css
    lib/
      supabase.js
      documents.js          # data access: list, get, create, rename, saveContent, remove
      sharing.js            # findUserByEmail, shareDocument, listShares, removeShare
      importFile.js         # pure: validate + convert .txt/.md -> HTML
      validation.js         # pure: validateTitle, validateEmail
      debounce.js
    context/
      AuthContext.jsx
    components/
      Header.jsx
      ProtectedRoute.jsx
      DocList.jsx
      Toolbar.jsx
      SharePanel.jsx
      UploadButton.jsx
      SaveStatus.jsx
    pages/
      LoginPage.jsx
      DashboardPage.jsx
      EditorPage.jsx
  tests/
    importFile.test.js
    validation.test.js
```

`vercel.json` (SPA routing so `/doc/:id` works on refresh):

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

---

## 8. Tests (Vitest, `environment: 'jsdom'`)

`tests/importFile.test.js` (the main "meaningful" test):
- rejects unsupported extension (e.g. `notes.pdf`) with the right error;
- rejects files over 1 MB and empty files;
- `.txt` → paragraphs + `<br>`, and HTML is escaped (`<script>` becomes text, not a tag);
- `.md` → `# Title` becomes `<h1>`, `**bold**` becomes `<strong>`, `- item` becomes a `<ul><li>`;
- `.md` with `<script>alert(1)</script>` → script removed by sanitiser.

`tests/validation.test.js`:
- empty / whitespace title rejected; 201-char title rejected; valid title trimmed;
- invalid email rejected; `"  Bob@Demo.com "` → `"bob@demo.com"`.

Scripts in `package.json`: `"dev"`, `"build"`, `"preview"`, `"test": "vitest run"`.

---

## 9. Build order (with checkpoints)

0. **Supabase setup** (the human has created an empty Supabase project and filled `.env` with
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_REF`):
   - Make sure `.gitignore` includes `.env` and `node_modules` before anything else.
   - Apply the schema: `npx supabase link --project-ref $SUPABASE_PROJECT_REF` then `npx supabase db push`
     (the CLI may ask the human to run `npx supabase login` and enter the database password — ask them to do it
     in the terminal if it is interactive). Fallback if the CLI fails: ask the human to paste
     `supabase/migrations/0001_init.sql` into the Supabase SQL Editor and run it.
   - Create `scripts/seed-users.mjs`: loads `.env` (use `dotenv`), creates a Supabase admin client with the
     service role key, and for each demo user in Section 4 calls
     `auth.admin.createUser({ email, password, email_confirm: true })`; if the user already exists, skip it and
     log "exists". Add `"seed": "node scripts/seed-users.mjs"` to package.json scripts and run it.
   - Verify: query `profiles` with the service role key and print the seeded emails.
   ✅ Checkpoint: both demo users exist in `profiles`; the three tables exist with RLS enabled.
1. **Scaffold** Vite + React, install deps, `supabase.js`, `.env.example`, routing, AuthContext, Login page,
   ProtectedRoute, Header, placeholder Dashboard. ✅ Checkpoint: log in/out as alice and bob.
2. **Documents data layer + Dashboard**: list owned/shared, create new doc, delete (owner).
   ✅ Checkpoint: create a doc, refresh, it is still there.
3. **Editor page**: load doc, TipTap with toolbar, title rename (owner), autosave with status.
   ✅ Checkpoint: format text, refresh, formatting is preserved.
4. **Sharing**: SharePanel (share by email, list, remove), "Shared with me" list, owner email display.
   ✅ Checkpoint: alice shares with bob → bob sees and edits it → alice sees bob's edit after refresh;
   carol (or a logged-out user) cannot open it via URL.
5. **Upload**: UploadButton + importFile conversion → new doc.
   ✅ Checkpoint: upload a `.md` with headings and lists → formatting appears.
6. **Validation & errors pass**: empty/long titles, bad emails, bad files, network errors, not-found doc.
7. **Tests**: write both test files, `npm test` green.
8. **Deploy**: `vercel.json`, push to GitHub, deploy on Vercel with env vars; verify login + `/doc/:id` refresh.
9. **Docs**: README, ARCHITECTURE, AI_WORKFLOW, SUBMISSION, VIDEO_URL.txt (Section 10).

Commit after each checkpoint with a clear message (e.g. `feat: editor with autosave`).

---

## 10. Documentation deliverables (write these at the end; keep each concise)

### README.md
- One-line description + live URL + demo accounts table.
- Features (working) and supported file types (.txt, .md up to 1 MB).
- Local setup: prerequisites (Node 18+), `npm install`, create a Supabase project, fill `.env` from `.env.example`,
  apply `supabase/migrations/0001_init.sql` (`npx supabase db push` or SQL Editor), `npm run seed`, `npm run dev`, `npm test`.
- Deployment notes (Vercel + env vars).
- **Status**: what is working / what is incomplete / what I would build next with 2–4 more hours.

### ARCHITECTURE.md (≈1 page)
- Diagram in text: React SPA → Supabase (Auth, Postgres + RLS) ; Vercel hosting.
- Why Supabase + RLS: access control enforced in the database, not just hidden in the UI; no custom server to
  deploy in a 4-hour window; free tier.
- Why TipTap + JSON storage: structured, formatting preserved exactly, easy to extend (comments/versions later).
- Data model and sharing logic (owner vs shares table).
- Autosave design (debounce, status indicator, last-write-wins — trade-off acknowledged).
- Import design (pure function, sanitised Markdown).
- Deliberate scope cuts and why; known limitations (no realtime → concurrent edits are last-write-wins).

### AI_WORKFLOW.md (≈1 page) — generated ONLY from PROMPT_LOG.md (no new claims)
Answer exactly the four questions Ajaia asks, citing log entry numbers (e.g. "see log #7"):
- **Which AI tools I used:** Claude (chat) for planning/scope/schema; Claude Code for implementation, tests, docs.
- **Where AI materially sped up the work:** concrete examples from the log (scaffolding, RLS policies, toolbar,
  import conversion, tests, docs) with rough time saved only if the human states it.
- **What AI-generated output I changed or rejected:** every "Human decision" correction/rejection and every
  "Issues found & fixed" item from the log. If there are few, list them honestly — do not pad.
- **How I verified correctness, UX quality and reliability:** build checks, unit tests (what they cover),
  the two-user sharing test, direct-URL access test for non-shared users, refresh-persistence test, UX pass.
Then ask the human to read it and edit anything that does not match what they did.

### PROMPT_LOG.md
- The full, truthful log from Section 0.1. Include it in the submission folder.

### SUBMISSION.md
- Exact list of everything in the Google Drive folder: source code (zip or folder), README.md, ARCHITECTURE.md,
  AI_WORKFLOW.md, PROMPT_LOG.md, SUBMISSION.md, VIDEO_URL.txt, screenshots/ (if any).
- Live product URL, demo accounts (email + password) for testing the sharing flow.
- Status: what is working / what is incomplete / what I would build next with 2–4 more hours.

### screenshots/
- Capture: login, dashboard (owned vs shared), editor with formatting, share panel, upload result.
  (The human takes these; Claude Code may create the folder and a README listing expected files.)

### VIDEO_URL.txt
- Single line with the Loom/YouTube unlisted link (human adds it).

---

## 11. UX guidelines
- Layout: top header (app name "Ajaia Docs", user email, Logout); dashboard as a centred column with cards/rows;
  editor as a white "page" (max-width ~800px) on a light grey background, toolbar sticky at the top.
- Buttons have clear labels and disabled/loading states.
- Use consistent spacing and a readable font (system font stack, 16px body).
- Every error message tells the user what happened and what to do.
- Keep it accessible: buttons have `aria-label`s for icon-only actions; focus styles visible.

---

## 11.1 Walkthrough video (3–5 min) — help the human prepare
At the end, write `VIDEO_SCRIPT.md` (not submitted) with a 3–5 minute talk track:
1. Problem + what I chose to build (20 s)
2. Live demo on the deployed URL: login as alice → create doc → format → refresh (persists) → upload .md →
   share with bob → log in as bob → "Shared with me" → edit → back as alice, edit visible (2 min)
3. What is intentionally out of scope and why (30 s)
4. Key decisions: Supabase + RLS, TipTap JSON, debounced autosave, pure tested import function (45 s)
5. How AI helped and what I corrected (from PROMPT_LOG.md) (45 s)

## 12. Definition of done
- All checkpoints in Section 9 pass on the **deployed** URL, not just locally.
- `npm run build` and `npm test` pass.
- No secrets in the repo; `.env.example` present.
- Docs from Section 10 exist and are accurate about what works and what does not.
- PROMPT_LOG.md is complete, truthful, and has an entry for every task.
