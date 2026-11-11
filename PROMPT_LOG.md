# Prompt log: Ajaia Docs

- **Date:** 2026-11-11 (local time, IST)
- **Tools:** Claude Code (Claude Opus 5.5, VS Code extension) for implementation, tests, verification and docs. Claude (chat) for planning; see entry 0.
- **Note:** the planning document (`CLAUDE.md`) was drafted with Claude (chat), but it reached Claude Code only at entry 5, after the app was built from the assignment brief in entry 1. Entries 1–4 therefore did not follow it.

This log is append-only and truthful. Times come from file timestamps and git and are approximate (±2 min). The human should correct anything that doesn't match what they did.

---

### 0. Planning with Claude (chat), outside this session
- **Source:** `CLAUDE.md`, supplied by the human in entry 5. Claude Code did not see the planning chat.
- **Stated plan:** scope, stack (Supabase + RLS, JavaScript, Vercel), schema and RLS design, build order with human checkpoints.
- **Human decisions recorded in that plan:** cut real-time collaboration, comments, version history, `.docx` and roles to fit the 4-hour timebox. Chose Supabase + RLS so access control is enforced in the database.
- **Relationship to the build:** the app was already built before this plan arrived, and it differs: it includes `.docx` and roles, and uses Express + Postgres. The human chose to keep it (entry 5).

### 1. Build the app from the assignment brief (about 18:29 to 18:46)
- **Prompt (verbatim):** the full Ajaia "AI-Native Full Stack Developer Assignment" brief, pasted with no other instructions.
- **Plan:**
  - Claude Code chose the stack itself: React + Vite + TipTap, Express, Postgres (embedded PGlite locally, `DATABASE_URL` in prod), seeded users with cookie sessions.
  - Scope: depth on editing, sharing (owner/editor/viewer) and import (`.txt`/`.md`/`.docx`). Version-conflict detection instead of real-time sync.
- **What I (Claude Code) did:**
  - Scaffolded the project.
  - Server: `server/src/{db,auth,errors,content,app,index}.ts`. Client: `client/src/` (pages, Toolbar, ShareDialog, `useDocumentSync`).
  - Tests: `server/test/api.test.ts`. Smoke script: `scripts/e2e-smoke.mjs`.
  - Deploy config: `render.yaml`, `Dockerfile`.
  - Docs: README, ARCHITECTURE, AI_WORKFLOW, SUBMISSION, VIDEO_URL.
- **Verification:**
  - `npm test`: 9/9 passing. `npm run typecheck`: clean. `npm run build`: OK.
  - Headless-Chrome run as Alice, Bob and Carol covered: create, format, reload, share as viewer, upgrade to editor, live pickup, a real two-user conflict, `.md` import, Carol denied, sign-out.
  - Reviewed all 9 screenshots.
  - Fresh-checkout `npm run dev` check.
- **Issues found & fixed:**
  1. Single tsconfig failed client typecheck → split server and client configs.
  2. mammoth dropped underline in `.docx` (caught by test) → `styleMap`.
  3. Opening a doc that ends in a list triggered a save credited to the reader, because of TipTap's `trailingNode` (caught by logging requests in the E2E run) → disabled it, ignored no-op updates, and added a zero-PATCH assertion.
  4. `/api/auth/me` returned 401 noise → returns `{user:null}`.
  5. The `Secure` cookie flag was tied to `NODE_ENV` → uses `req.secure`.
  6. The seed re-created deleted demo docs → seeds only an empty DB.
  7. Paragraph spacing collapsed under headings (CSS specificity, seen in a screenshot) → fixed.
  8. Fresh checkout crashed with `ENOENT data/pglite` → create the directory recursively.
  9. An E2E typing race (keys sent within one frame of a focus change) → added a 150 ms pause in the script only.
  10. Claude Code's `rm -rf` of a scratch DB directory was blocked by the safety check → used a new directory instead.
- **Human decision:** none during this task. The human didn't review or redirect the work while it was in progress.
- **Commit:** none yet (committed in entry 4).

### 2. Run the app (about 18:47)
- **Prompt (verbatim):** "can uh run this and show me"
- **Plan:** production build, start the server, open the browser.
- **What I (Claude Code) did:** `npm run build && npm start` in the background on port 3001, then `open http://localhost:3001`. Showed the login and view-only screenshots and gave a 7-step tour.
- **Verification:** `GET /api/health` → `{"ok":true}`.
- **Issues found & fixed:** none.
- **Human decision:** none recorded.
- **Commit:** none.

### 3. Push to GitHub, and suggestions (about 18:49)
- **Prompt (verbatim):** "push it to my github or do uh have any suggestions?"
- **Plan:** check git identity and GitHub credentials, prepare the repo, recommend a path.
- **What I (Claude Code) did:** checked git config, SSH and `gh`, and found no credentials, no `gh` and no git identity. Ran `git init -b main` and `git add -A`, then reviewed the 46 staged files (no `node_modules`, data, build output or secrets). Recommended installing `gh` and using a private repo.
- **Verification:** `git status` showed the staged list. SSH to GitHub was denied (no key).
- **Issues found & fixed:** none.
- **Human decision:** gave the remote URL and push commands (entry 4).
- **Commit:** none.

### 4. Commit and push (18:52)
- **Prompt (verbatim):** "git remote add origin https://github.com/prxshu05/Ajaia.git / git branch -M main / git push -u origin main"
- **Plan:** commit with a repo-local identity, add the remote, push.
- **What I (Claude Code) did:** set the repo-local author to `prxshu05 <prxshu05@users.noreply.github.com>`, which avoids publishing a personal email. Committed, added `origin`, and attempted the push.
- **Verification:** the push failed with "Invalid username or token. Password authentication is not supported."
- **Issues found & fixed:** no GitHub credentials on this machine. Asked the human to run `brew install gh`, `gh auth login` and `gh auth setup-git`.
- **Human decision:** ran `brew install gh` (installed). As of entry 5, `gh auth login` hasn't completed.
- **Commit:** `b9daa1c` "Ajaia Docs: lightweight collaborative document editor"

### 5. Planning spec supplied: CLAUDE.md (about 19:03)
- **Prompt (verbatim):** the full `CLAUDE.md` planning spec (Supabase + RLS, JavaScript, Vercel, no roles, `.txt`/`.md` only), pasted with no other instructions.
- **Plan:** the spec conflicted with the already-built and tested app, so Claude Code asked the human whether to keep the app, rebuild to the spec on a new branch, or keep the app and add Supabase storage.
- **What I (Claude Code) did:**
  - Saved `CLAUDE.md` unchanged, with an "As-built status" section on top comparing plan and build.
  - Created this `PROMPT_LOG.md` and `VIDEO_SCRIPT.md` (`.gitignore`d, not submitted).
  - Added `PROMPT_LOG.md` and `CLAUDE.md` to `SUBMISSION.md`.
  - Corrected `AI_WORKFLOW.md` to cite this log. Its last paragraph had said the judgment calls were the human's, which the log doesn't support.
- **Verification:** `npm run build` OK; `npm test` 9/9 passed.
- **Issues found & fixed:** `AI_WORKFLOW.md` overstated the human's role in the build decisions. Rewritten to match the log.
- **Human decision:** chose **"Keep app, adopt process"**: keep the existing app; save CLAUDE.md with a deviations note; add an accurate prompt log and video script; then push and deploy.
- **Commit:** "docs: add prompt log, planning spec with as-built notes, AI workflow corrections"

### 6. Push to GitHub (about 19:15)
- **Prompt (verbatim):** "can uh push it to my github"
- **Plan:** `gh` was installed but not logged in, so start the browser device login, then connect git to it and push.
- **What I (Claude Code) did:** ran `gh auth login --web`, which printed a one-time code and opened github.com/login/device for the human to approve. Then ran `gh auth setup-git` and `git push -u origin main`.
- **Verification:** `gh auth status` showed "Logged in as prxshu05". The push created `main` on origin. `git status` showed `main...origin/main` in sync. The repo is PUBLIC.
- **Issues found & fixed:** none.
- **Human decision:** approved the GitHub device login in the browser. The entry-5 asks are still pending: the manual two-user test, and any personal review or changes not yet in the log.
- **Commit:** "docs: log GitHub push (prompt log #6)"

### 7. Render deploy ran out of memory (about 19:20)
- **Prompt (verbatim):** the Render deploy log, pasted with no other instructions. It ended with "Out of memory (used over 512Mi)" after `npm start`.
- **Plan:** measure, don't guess. Find what uses memory at boot, test fixes, and switch production to hosted Postgres if the embedded DB can't fit.
- **What I (Claude Code) did:**
  - Measured startup memory: about 1.1 GB on a fresh DB.
  - Probed PGlite: first boot about 1.0 GB, reopening an existing DB 335 MB. Smaller Postgres buffers gave 650 MB, V8 wasm flags made no difference, and booting from a snapshot peaked at 496 MB. Conclusion: PGlite can't run on 512 MB, because Render wipes the disk on every deploy, so every boot is a first boot.
  - With the human's approval, created the Supabase project `ajaia-docs` (ap-south-1, $0).
  - Code changes: RLS enabled on all 4 tables, since Supabase auto-exposes `public` over REST; `render.yaml` starts `node` directly (saves the npm wrapper) and documents `DATABASE_URL` as required; a fail-fast check in `index.ts` when `RENDER` is set without `DATABASE_URL`.
  - Updated README, ARCHITECTURE and AI_WORKFLOW.
- **Verification:** `npm test` 9/9, typecheck clean, build OK. `RENDER=true node server/src/index.ts` printed the clear error and exited 1.
- **Issues found & fixed:**
  1. The OOM itself: the AI-chosen production fallback was never tested under a 512 MB limit.
  2. My first RLS edit put a `;` inside a SQL comment, which broke `migrate()` because it splits on `;`. The test run caught it, and the comment moved to TypeScript.
  3. Temporary probe scripts were deleted from the repo.
- **Human decision:** chose "New Supabase project" over restoring the paused project or setting it up themselves. Pending: paste the Supabase session-pooler URI into Render's `DATABASE_URL` (it needs the DB password, which only the human can get).
- **Commit:** "fix(deploy): use Supabase Postgres on Render; lock tables with RLS; fail fast without DATABASE_URL"

### 8. Connect Supabase and verify the live deployment (about 19:30 to 19:50)
- **Prompts (verbatim, in order):**
  - "Add it to Render. Open your service → Environment → add DATABASE_URL with that URI → Save, rebuild, and deploy. how to do this"
  - a screenshot of Render's Environment page
  - the commit message of `8d65255`, pasted with no other instructions
  - the Render log (`DATABASE_URL is not set`, then `(ENOTFOUND) tenant/user postgres.ojbyjzxnfyjazsyvwyks not found`)
  - "https://ajaia-docs-25s9.onrender.com/login"
- **Plan:** guide the human through Render's UI, diagnose each failure from logs, then verify the live site on the API, the database and the browser.
- **What I (Claude Code) did:**
  - Opened the service's Environment page and gave click-by-click steps.
  - Read the Supabase logs (no connection attempts, so the variable wasn't saved).
  - Diagnosed the "tenant not found" error by connecting to both pooler hosts with a deliberately wrong password. `aws-0` said "not found" and `aws-1` said "password authentication failed", which proved `aws-1` is the right host.
  - Filled the live URL into README, SUBMISSION and CLAUDE.md.
- **Verification on the live URL:**
  - API: health; SPA refresh on `/d/:id`; login for all 3 users, bad password → 401; create; save with `<script>` stripped; stale save → 409; Bob 404 before sharing, then as viewer GET 200 and PATCH 403; Carol 404; `.md` import. Test docs deleted afterwards.
  - Supabase: 4 tables with RLS on; 3 users, 1 doc, 1 share. The public REST API with the publishable key returned `[]` for every table. The security advisor showed only the expected "RLS enabled, no policy" info notice.
  - Headless Chrome: Bob sees the shared doc with edit access, and the session survives a reload over HTTPS.
- **Issues found & fixed:**
  1. My example connection string in chat used the `aws-0` pooler host, but this project is on `aws-1`. The human pasted my example, and Render failed with "tenant not found". The fix was to change `aws-0` to `aws-1`. Lesson: tell the human to copy the string from the dashboard instead of giving a hand-written example.
  2. The safety check blocked a heredoc-based command (no deletion was in it). Rewrote the script with the file tool instead.
- **Human decision:** set `DATABASE_URL` in Render (the password was handled only by the human, never shared in chat), corrected the host to `aws-1`, and confirmed the live URL. The two asks from entry 5 are still pending: the manual two-user test, and any personal review or changes not yet in the log.
- **Commit:** "docs: add live URL; log Supabase connection and live verification (prompt log #8)"

### 9. Submission folder, video script and form text (about 19:55)
- **Prompt (verbatim):** "what all i need to submit kept that in folder and give me the script for the video and", followed by the assignment page text from the submission portal (video link field, "Submission (Markdown, max 1000 lines)" field).
- **Plan:** build an upload-ready folder from exactly what's committed; write a spoken video script; write the Markdown for the portal's submission box.
- **What I (Claude Code) did:**
  - Generated `docs/sample-import.docx` (headings, bold, italic, underline, bullet and numbered lists) for the demo and reviewers.
  - Added the GitHub repo link and the `.docx` sample to README and SUBMISSION.
  - Rewrote `VIDEO_SCRIPT.md` as a timed, spoken script. Wrote `SUBMISSION_FORM.md` for the portal box. Both are gitignored, not part of the Drive folder.
  - Exported `git archive HEAD` to `~/Downloads/Ajaia-Submission/`.
- **Verification:** the `.docx` converts through the importer's mammoth settings to the expected `<h1>/<h2>/<strong>/<em>/<u>/<ul>/<ol>`. In a scratch copy of the exported folder (49 files, 896 KB): `npm ci` OK, `npm test` 9/9 passed, `npm run build` OK.
- **Issues found & fixed:** none.
- **Human decision:** pending. Still needed: the video link, the Drive folder link, the manual two-user test, and any personal review or changes not yet logged.
- **Commit:** "docs: sample .docx, repo link, submission prep (prompt log #9)"

### 10. Add the walkthrough video link (about 20:30)
- **Prompt (verbatim):** "this is my vifro linkhttps://drive.google.com/file/d/17QSpqviOdTeKF1Zr6YfD2n8QHZhHELIq/view?usp=sharing"
- **Plan:** check the link opens without signing in, then add it to `VIDEO_URL.txt`, README, SUBMISSION and the portal text, and re-sync the submission folder.
- **What I (Claude Code) did:** filled the link into `VIDEO_URL.txt`, `README.md`, `SUBMISSION.md` and `SUBMISSION_FORM.md` (the last is gitignored). Re-exported the changed files to `~/Downloads/Ajaia-Submission/`.
- **Verification:** a logged-out request to the link returned 200 with the title "videoo.mov - Google Drive", so it's viewable without a Google login. Claude Code did not watch the video.
- **Issues found & fixed:** none.
- **Human decision:** recorded and uploaded the walkthrough video to Google Drive and shared it by link. The two asks from entry 5 are still pending: the manual two-user test, and any personal review or changes not yet logged.
- **Commit:** "docs: add walkthrough video link (prompt log #10)"
