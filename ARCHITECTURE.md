# Architecture note

## Shape

```
Browser (React + TipTap)  ──JSON/cookie──▶  Express API  ──SQL──▶  Postgres
  list / editor / share                     auth, access control      PGlite (embedded) locally
  useDocumentSync: autosave,                sanitiser, importers      pg + DATABASE_URL in prod
  conflicts, polling
```

The app is a single Node service. Express serves both the API and the built React app, so there is one thing to deploy and one URL to test.

## Data model

```
users(id, email unique, name, password_hash)
sessions(token, user_id, expires_at)
documents(id, owner_id, title, content HTML, version, updated_by, created_at, updated_at)
document_shares(document_id, user_id, role 'viewer'|'editor')   PK (document_id, user_id)
```

Ownership is a column, not a share row, so a document can never end up without an owner. A user's role is computed in one query (`owner`, otherwise the role on their share row, otherwise no access). Every document endpoint goes through that one helper (`getAccessibleDoc`), so access rules live in one place.

## Key decisions

**1. Store documents as sanitised HTML.**
- *Choice:* TipTap's native format is ProseMirror JSON, but HTML is what the importers produce (mammoth for `.docx`, marked for `.md`) and is readable in the database.
- *Safety:* Every write passes a strict tag allowlist (`server/src/content.ts`) that matches what the editor can represent, so stored content can't carry scripts, styles or event handlers. A test asserts this.
- *Cost:* An extra parse on load, which is negligible at this size.

**2. One SQL dialect everywhere.**
- *Choice:* PGlite (Postgres compiled to WASM) runs in-process for local dev and tests. Production uses real Postgres through the same small `query()` interface.
- *Benefit:* Reviewers need no database install, and tests run against real Postgres semantics (`ON CONFLICT`, `timestamptz`, CHECK constraints), not a mock.
- *Rejected:* SQLite locally with Postgres in prod, because that means two dialects.

**3. Optimistic concurrency instead of real-time sync.**
- *Mechanism:* Each content save sends the `baseVersion` it was editing. The UPDATE only applies `WHERE version = baseVersion`.
- *On conflict:* A conflicting save gets a 409 with the latest document, and the user picks "load theirs" or "keep mine".
- *Idle editors:* They poll every 8 s and pick up collaborators' changes when they have no unsaved work.
- *Why:* This makes sharing behave correctly with two people in a doc for about a tenth of the cost of a CRDT (Yjs) and WebSocket stack. It's the main thing I'd replace next.
- *Titles:* Renames are last-write-wins and don't bump the content version, so a rename never causes a content conflict.

**4. Lightweight but real auth.**
- *Setup:* Seeded users, scrypt-hashed passwords, random session tokens in an `httpOnly`, `SameSite=Lax` cookie. `Secure` is set automatically behind HTTPS.
- *Why:* Mocked "pick a user" auth would make access control look untested. This keeps it real while costing very little.
- *Not built:* Sign-up and password reset.

**5. Access-denied responses.**
- *No access:* The server returns 404, not 403, so you can't probe which document IDs exist.
- *Some access but not enough:* 403 with a clear message, for example a viewer trying to edit or an editor trying to share.

## What I prioritised, and why

The brief stresses depth over breadth, so I went deep on the paths a reviewer will actually use:

1. **An editing experience that doesn't lose work.** That means autosave with a single save in flight at a time, a save-status indicator, automatic retry when offline, a warning before closing with unsaved changes, and conflict detection. Losing text is the fastest way to lose trust in a docs tool.
2. **Sharing that is enforced, not just displayed.** Roles are checked server-side on every route and covered by an end-to-end API test. Viewer mode is genuinely read-only in the UI as well.
3. **An import that is actually useful.** `.docx` is what people have, so it's supported alongside `.md`/`.txt`, with the formatting kept and the limits stated.

## Deliberate cuts

| Cut | Why it's acceptable for now |
|---|---|
| Real-time co-editing and presence | Conflict detection plus polling covers correctness. Live co-editing needs a CRDT and WebSockets, which is a separate project |
| Comments, suggestions, version history, export | Optional stretch items. History is the cheapest next step because of the existing version counter |
| Images and tables | They need custom editor nodes and file storage. Imports degrade them gracefully |
| Sign-up, password reset, organisations | Seeded accounts are enough to demonstrate the sharing model |
| Sharing by link, transferring ownership | Not needed to show the core access model |

## Known risks and limitations

- **Polling scope.** It runs every 8 s per open document, which is fine for a small team but not for many concurrent users. The real fix is WebSockets or SSE.
- **Shared user directory.** `/api/users` lists every user for share autocomplete. In a multi-tenant product it would be scoped to an organisation.
- **Free hosting without `DATABASE_URL`.** On Render's free tier, PGlite lives on an ephemeral disk, so data resets to the seed on restart. Set `DATABASE_URL` for durability.
- **Testing gap on the `pg` path.** The tests run on PGlite. The `pg` code path uses the same SQL, but only the deployed instance exercises it.
