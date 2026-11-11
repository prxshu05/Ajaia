import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { type Db, SEED_PASSWORD, migrate, openDb, seed } from '../src/db.ts';

let db: Db;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  db = await openDb(); // in-memory embedded Postgres, fresh per test file
  await migrate(db);
  await seed(db);
  app = createApp(db);
});
afterAll(() => db.close());

/** Returns a supertest agent that keeps the session cookie, logged in as `email`. */
async function loginAs(email: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: SEED_PASSWORD }).expect(200);
  return agent;
}

describe('auth', () => {
  it('rejects bad credentials and unauthenticated requests', async () => {
    await request(app).post('/api/auth/login').send({ email: 'alice@ajaia.test', password: 'nope' }).expect(401);
    await request(app).get('/api/documents').expect(401);
  });
});

describe('document sharing and access control', () => {
  it('enforces owner / editor / viewer / no-access end to end', async () => {
    const alice = await loginAs('alice@ajaia.test');
    const bob = await loginAs('bob@ajaia.test');
    const carol = await loginAs('carol@ajaia.test');

    // Alice creates a document; only she can see it.
    const created = await alice.post('/api/documents').send({ title: 'Launch plan' }).expect(201);
    const doc = created.body.document;
    expect(doc.role).toBe('owner');
    await bob.get(`/api/documents/${doc.id}`).expect(404); // existence is not revealed

    // Share with Bob as a viewer: he sees it under "shared", can read but not edit.
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: 'BOB@ajaia.test', role: 'viewer' }).expect(201);
    const bobList = await bob.get('/api/documents').expect(200);
    expect(bobList.body.shared.map((d: { id: string }) => d.id)).toContain(doc.id);
    expect(bobList.body.owned.map((d: { id: string }) => d.id)).not.toContain(doc.id);
    const asViewer = await bob.get(`/api/documents/${doc.id}`).expect(200);
    expect(asViewer.body.document.role).toBe('viewer');
    await bob
      .patch(`/api/documents/${doc.id}`)
      .send({ content: '<p>hijack</p>', baseVersion: doc.version })
      .expect(403);

    // Only the owner manages sharing.
    await bob.post(`/api/documents/${doc.id}/shares`).send({ email: 'carol@ajaia.test', role: 'editor' }).expect(403);

    // Upgrade Bob to editor: now his edit is saved and attributed to him.
    await alice.patch(`/api/documents/${doc.id}/shares/u_bob`).send({ role: 'editor' }).expect(200);
    const edited = await bob
      .patch(`/api/documents/${doc.id}`)
      .send({ content: '<p>Bob was here</p>', baseVersion: doc.version })
      .expect(200);
    expect(edited.body.document.content).toBe('<p>Bob was here</p>');
    expect(edited.body.document.updatedBy).toBe('Bob Okafor');

    // Carol was never granted access; editors cannot delete; revoking removes Bob's access.
    await carol.get(`/api/documents/${doc.id}`).expect(404);
    await bob.delete(`/api/documents/${doc.id}`).expect(403);
    await alice.delete(`/api/documents/${doc.id}/shares/u_bob`).expect(200);
    await bob.get(`/api/documents/${doc.id}`).expect(404);
  });

  it('rejects sharing with unknown users or the owner', async () => {
    const alice = await loginAs('alice@ajaia.test');
    const { body } = await alice.post('/api/documents').send({}).expect(201);
    await alice.post(`/api/documents/${body.document.id}/shares`).send({ email: 'nobody@ajaia.test', role: 'viewer' }).expect(404);
    await alice.post(`/api/documents/${body.document.id}/shares`).send({ email: 'alice@ajaia.test', role: 'viewer' }).expect(400);
    await alice.post(`/api/documents/${body.document.id}/shares`).send({ email: 'not-an-email', role: 'viewer' }).expect(400);
  });
});

describe('editing', () => {
  it('detects conflicting saves instead of silently overwriting', async () => {
    const alice = await loginAs('alice@ajaia.test');
    const bob = await loginAs('bob@ajaia.test');
    // Seeded doc: owned by Alice, shared with Bob as editor.
    const { body } = await alice.get('/api/documents/d_welcome').expect(200);
    const base = body.document.version;

    await alice.patch('/api/documents/d_welcome').send({ content: '<p>Alice v2</p>', baseVersion: base }).expect(200);
    const conflict = await bob
      .patch('/api/documents/d_welcome')
      .send({ content: '<p>Bob stale</p>', baseVersion: base })
      .expect(409);
    expect(conflict.body.error).toMatch(/Alice Chen/);
    expect(conflict.body.document.content).toBe('<p>Alice v2</p>');
  });

  it('sanitizes stored HTML and validates titles', async () => {
    const alice = await loginAs('alice@ajaia.test');
    const { body } = await alice.post('/api/documents').send({ title: 'XSS check' }).expect(201);
    const saved = await alice
      .patch(`/api/documents/${body.document.id}`)
      .send({
        content: '<h2 onclick="x()">Hi</h2><script>alert(1)</script><p><strong>ok</strong><a href="javascript:alert(1)">bad</a></p>',
        baseVersion: body.document.version,
      })
      .expect(200);
    expect(saved.body.document.content).toBe('<h2>Hi</h2><p><strong>ok</strong><a>bad</a></p>');

    await alice.patch(`/api/documents/${body.document.id}`).send({ title: '   ' }).expect(400);
    const renamed = await alice.patch(`/api/documents/${body.document.id}`).send({ title: '  Renamed  ' }).expect(200);
    expect(renamed.body.document.title).toBe('Renamed');
  });
});

describe('file import', () => {
  it('turns a markdown file into a formatted document', async () => {
    const alice = await loginAs('alice@ajaia.test');
    const md = '# Release notes\n\nSome **bold** and _italic_ text.\n\n- one\n- two\n';
    const res = await alice
      .post('/api/documents/import')
      .attach('file', Buffer.from(md), 'release_notes.md')
      .expect(201);
    expect(res.body.document.title).toBe('release notes');
    expect(res.body.document.content).toContain('<h1>Release notes</h1>');
    expect(res.body.document.content).toContain('<strong>bold</strong>');
    expect(res.body.document.content).toContain('<li>one</li>');
  });

  it('escapes plain text and keeps paragraphs', async () => {
    const alice = await loginAs('alice@ajaia.test');
    const res = await alice
      .post('/api/documents/import')
      .attach('file', Buffer.from('Hello <world>\nline two\n\nSecond para'), 'notes.txt')
      .expect(201);
    expect(res.body.document.content).toBe('<p>Hello &lt;world&gt;<br />line two</p><p>Second para</p>');
  });

  it('rejects unsupported and malformed files', async () => {
    const alice = await loginAs('alice@ajaia.test');
    const pdf = await alice.post('/api/documents/import').attach('file', Buffer.from('%PDF'), 'deck.pdf').expect(400);
    expect(pdf.body.error).toMatch(/Unsupported file type/);
    await alice.post('/api/documents/import').attach('file', Buffer.from('not a zip'), 'fake.docx').expect(400);
  });
});

describe('docx import', () => {
  /** Builds the smallest valid .docx (WordprocessingML in a zip) with a heading, formatting and a list item. */
  async function makeDocx(): Promise<Buffer> {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
    zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Quarterly review</w:t></w:r></w:p>
    <w:p>
      <w:r><w:t xml:space="preserve">Revenue is </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>up</w:t></w:r>
      <w:r><w:t xml:space="preserve"> and churn is </w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>down</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`);
    return zip.generateAsync({ type: 'nodebuffer' });
  }

  it('converts Word headings and formatting into editor HTML', async () => {
    const alice = await loginAs('alice@ajaia.test');
    const res = await alice
      .post('/api/documents/import')
      .attach('file', await makeDocx(), 'Q3 review.docx')
      .expect(201);
    expect(res.body.document.title).toBe('Q3 review');
    expect(res.body.document.content).toBe('<h1>Quarterly review</h1><p>Revenue is <strong>up</strong> and churn is <u>down</u></p>');
    // and it shows up in Alice's own list
    const list = await alice.get('/api/documents').expect(200);
    expect(list.body.owned.some((d: { id: string }) => d.id === res.body.document.id)).toBe(true);
  });
});
