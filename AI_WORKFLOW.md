# AI workflow note

This note is based on [`PROMPT_LOG.md`](PROMPT_LOG.md), the append-only record of every prompt in the build. "Log #N" refers to its entries.

## Tools used

- **Claude Code** (Claude Opus 5.5, in VS Code) was the main tool. It scaffolded the project, wrote the code and docs, ran the tests, and drove a headless browser to check the UI (log #1–#5).
- **Claude (chat)** was used to draft a planning spec (`CLAUDE.md`, log #0). It reached Claude Code only after the app was built, so its process rules (this log, checkpoints) were adopted from then on, but not its stack (log #5).
- **Headless Chrome via puppeteer-core** was used for the browser smoke test (`scripts/e2e-smoke.mjs`), which checked the AI-written UI the way a user would.

## Where AI materially sped things up

- **Boilerplate across many surfaces.** Express routes, zod schemas, React pages, CSS, Dockerfile and Render config. These are well-understood patterns that would otherwise take most of the timebox.
- **Library APIs I'd otherwise look up.** These were TipTap v3 (`useEditorState`, StarterKit options), PGlite, mammoth and multer. The assistant checked the installed type definitions instead of guessing.
- **Writing the tests and the multi-user browser script.** Simulating Alice, Bob and Carol in separate sessions, including a real two-person edit conflict, would be tedious to write by hand.
- **Docs.** The first drafts of this note, the README and the architecture note.

## What was changed or rejected

All of these are from log #1. Each was caught by a test, a type check, request logging or a screenshot. None was found by reading the code.

| AI output | Problem | Fix |
|---|---|---|
| `.docx` import via mammoth with default options | The docx test showed underline was silently dropped, and underline is a required format | Explicit `styleMap` for underline and strikethrough |
| Default TipTap StarterKit | Request logging in the browser run showed that just *opening* a doc ending in a list sent a save. The trailing-node extension edits the document on load, so the save was credited to the reader. For a viewer it would show a false "you lost access" banner | Turned `trailingNode` off. The editor now ignores updates from read-only users and changes identical to the last-synced HTML. The browser script now asserts that opening a doc sends zero saves |
| PGlite opened at `./data/pglite` | Starting from a fresh checkout crashed with `ENOENT`. Earlier runs had used directories whose parents already existed, which hid it, and it would have broken the first `npm run dev` and the deploy | Create the data directory recursively before opening the database |
| Session cookie `secure` tied to `NODE_ENV` | `npm start` over plain HTTP on a LAN IP would silently fail to log in | Use `req.secure`, which works behind HTTPS proxies via `trust proxy` |
| Seeding with `ON CONFLICT DO NOTHING` | A demo doc deleted by the user would come back after every restart | Seed only an empty database |
| `/api/auth/me` returning 401 when logged out | Every visit to the login page logged a console error | Returns `{ user: null }` |
| Single `tsconfig` for server and client | Client imports failed to typecheck under `nodenext` resolution | Separate configs for Node and the bundler |
| Editor CSS | The screenshot showed paragraphs crammed under headings, because a more specific `p { margin: 0 }` overrode the spacing rule | Fixed the selector specificity |
| Real-time co-editing with Yjs (considered) | Too big for the timebox, and it would have crowded out depth elsewhere | Optimistic concurrency with conflict prompts and polling, documented as the next upgrade |

## How correctness, UX and reliability were verified

1. **API integration tests.** Nine Vitest + Supertest tests run against a real (in-memory) Postgres. They cover every role transition, 404 vs 403 behaviour, conflict detection, XSS sanitisation, validation, and `.md`/`.txt`/real `.docx` imports.
2. **Browser smoke run in headless Chrome.** It covers:
   - create, format, reload and assert the HTML survived
   - share as viewer (contenteditable is false and there's no toolbar), upgrade to editor
   - live pickup of a collaborator's edit
   - a real simultaneous-edit conflict and its resolution
   - `.md` import, and Carol being denied access
   - sign-out

   The run logs every HTTP response with status 400 or above. Each one is either expected or investigated, and that's how the trailing-node bug was found.
3. **Screenshot review.** Every screenshot in `docs/screenshots` was looked at, not just generated. That's how the spacing bug was caught.
4. **Typecheck** (`npm run typecheck`) on server and client, and a production build.

## Human decisions

As recorded in the log:
- **Planning (log #0).** I drafted a scope and stack plan with Claude (chat).
- **Keep the app (log #5).** The plan arrived after Claude Code had already built the app from the brief, with its own choices of stack, scope and roles (log #1). I chose to keep the built app over rebuilding to my plan, because it was working, tested, and covered more of the brief. From then on I adopted the plan's process: this prompt log and its checkpoints.
- **GitHub (log #3–#4).** I chose the GitHub repo and set up credentials for pushing.

The log is honest that in log #1 most technical decisions were made by the AI and verified by running the product, not by me reviewing each one. If I reviewed or overrode anything, it gets its own log entry.

<!-- Prasanna: add anything you personally checked, changed or rejected that isn't in the log yet. Keep it accurate. -->
