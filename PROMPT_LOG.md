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
