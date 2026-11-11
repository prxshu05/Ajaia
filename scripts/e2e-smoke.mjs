/**
 * Browser smoke test: drives two real users (Alice, Bob) plus Carol through the full product flow
 * in headless Chrome and saves screenshots. Not part of `npm test` because it needs a Chrome install.
 *
 *   npm i --no-save puppeteer-core
 *   npm run build && PORT=3311 DATA_DIR=/tmp/ajaia-smoke npm start   # fresh database
 *   node scripts/e2e-smoke.mjs                                         # in another terminal
 *
 * Env: BASE_URL (default http://localhost:3311), CHROME_PATH (default macOS Chrome location).
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_URL ?? 'http://localhost:3311';
const SHOTS = path.join(root, 'docs', 'screenshots');
const SAMPLE = path.join(root, 'docs', 'sample-import.md');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1280, height: 860 } });
const log = (...a) => console.log('✔', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = []; // HTTP >= 400 responses; the expected ones are the 404 (unknown share email), 409 (conflict) and Carol's 404
async function session(name) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${name} ${r.request().method()} ${r.url()} -> ${r.status()}`));
  return page;
}
async function login(page, who) {
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('.demo-user');
  const btns = await page.$$('.demo-user');
  await btns[{ alice: 0, bob: 1, carol: 2 }[who]].click();
  await page.waitForSelector('.list-head');
}
const text = (page, sel) => page.$eval(sel, (e) => e.textContent);
const waitSaved = (page) => page.waitForFunction(() => document.querySelector('.status')?.textContent === 'All changes saved', { timeout: 8000 });

try {
  const alice = await session('alice');
  await alice.goto(`${BASE}/login`); await alice.waitForSelector('.demo-user');
  await alice.screenshot({ path: `${SHOTS}/01-login.png` });
  await login(alice, 'alice');
  await alice.waitForSelector('.doc-row');
  await alice.screenshot({ path: `${SHOTS}/02-documents.png` });
  log('alice logged in:', await text(alice, '.tab.active'));

  // create + rename
  await alice.click('.list-actions .btn.primary');
  await alice.waitForSelector('.title-input');
  log('title focused on new doc:', await alice.evaluate(() => document.activeElement?.className));
  await alice.keyboard.type('Launch checklist');
  await alice.keyboard.press('Enter');
  await alice.select('.tb-select', 'h1');
  await sleep(150);
  await alice.keyboard.type('Launch checklist');
  await alice.keyboard.press('Enter');
  await alice.keyboard.type('This is ');
  await alice.click('button[aria-label="Bold"]'); await alice.keyboard.type('important'); await alice.click('button[aria-label="Bold"]');
  await alice.keyboard.type(' and ');
  await alice.click('button[aria-label="Italic"]'); await alice.keyboard.type('urgent'); await alice.click('button[aria-label="Italic"]');
  await alice.keyboard.type(' and ');
  await alice.click('button[aria-label="Underline"]'); await alice.keyboard.type('underlined'); await alice.click('button[aria-label="Underline"]');
  await alice.keyboard.press('Enter');
  await alice.click('button[aria-label="Bulleted list"]');
  await alice.keyboard.type('Write docs'); await alice.keyboard.press('Enter'); await alice.keyboard.type('Ship it');
  await alice.keyboard.press('Enter'); await alice.keyboard.press('Enter');
  await alice.click('button[aria-label="Numbered list"]');
  await alice.keyboard.type('First'); await alice.keyboard.press('Enter'); await alice.keyboard.type('Second');
  await waitSaved(alice);
  await alice.screenshot({ path: `${SHOTS}/03-editor.png` });
  const docUrl = alice.url();
  log('saved', docUrl);

  await alice.reload(); await alice.waitForSelector('.tiptap');
  const html = await alice.$eval('.tiptap', (e) => e.innerHTML);
  const title = await alice.$eval('.title-input', (e) => e.value);
  for (const frag of ['<h1>Launch checklist</h1>', '<strong>important</strong>', '<em>urgent</em>', '<u>underlined</u>', '<ul>', '<ol>']) {
    if (!html.includes(frag)) throw new Error(`missing after reload: ${frag}\n${html}`);
  }
  if (title !== 'Launch checklist') throw new Error('title not persisted: ' + title);
  log('content + title persisted across reload');

  await alice.click('.doc-bar .btn.primary');
  await alice.waitForSelector('.modal');
  await alice.type('.share-form input', 'bob@ajaia.test');
  await alice.select('.share-form select', 'viewer');
  await alice.click('.share-form .btn.primary');
  await alice.waitForFunction(() => document.querySelectorAll('.share-list li').length === 2);
  await alice.screenshot({ path: `${SHOTS}/04-share-dialog.png` });
  await alice.type('.share-form input', 'nobody@ajaia.test'); await alice.click('.share-form .btn.primary');
  await alice.waitForSelector('.modal .error');
  log('unknown user error:', await text(alice, '.modal .error'));
  await alice.keyboard.press('Escape');

  const bob = await session('bob');
  await login(bob, 'bob');
  await bob.click('.tab:nth-child(2)');
  await bob.waitForFunction(() => [...document.querySelectorAll('.doc-title')].some((e) => e.textContent === 'Launch checklist'));
  await bob.screenshot({ path: `${SHOTS}/05-shared-with-me.png` });
  await bob.goto(docUrl); await bob.waitForSelector('.tiptap');
  const bobEditable = await bob.$eval('.tiptap', (e) => e.getAttribute('contenteditable'));
  const hasToolbar = !!(await bob.$('.toolbar'));
  log('bob viewer: contenteditable=', bobEditable, 'toolbar=', hasToolbar, 'banner=', await text(bob, '.banner.info'));
  if (bobEditable !== 'false' || hasToolbar) throw new Error('viewer could edit');
  await bob.screenshot({ path: `${SHOTS}/06-view-only.png` });

  await alice.click('.doc-bar .btn.primary'); await alice.waitForSelector('.share-list select');
  await alice.select('.share-list select', 'editor');
  await sleep(500); await alice.keyboard.press('Escape');
  await bob.reload(); await bob.waitForSelector('.toolbar');
  log('bob has toolbar after upgrade to editor');

  await bob.click('.tiptap h1'); await bob.keyboard.press('End'); await bob.keyboard.type(' (reviewed by Bob)');
  await waitSaved(bob);
  await alice.waitForFunction(() => document.querySelector('.tiptap h1')?.textContent.includes('reviewed by Bob'), { timeout: 15000 });
  log("alice received bob's change live:", await text(alice, '.tiptap h1'), '| meta:', await text(alice, '.doc-meta'));
  await alice.screenshot({ path: `${SHOTS}/07-live-update.png` });

  await alice.click('.tiptap p'); await alice.keyboard.press('End');
  await bob.click('.tiptap p'); await bob.keyboard.press('End');
  await Promise.all([alice.keyboard.type(' alice-edit'), bob.keyboard.type(' bob-edit')]);
  await sleep(3000);
  const aConf = await alice.$('.banner-actions'), bConf = await bob.$('.banner-actions');
  log('conflict banner alice=', !!aConf, 'bob=', !!bConf);
  if (!aConf && !bConf) throw new Error('expected a conflict');
  const loser = aConf ? alice : bob;
  await loser.screenshot({ path: `${SHOTS}/08-conflict.png` });
  await loser.click('.banner-actions .btn.primary');
  await waitSaved(loser);
  log('conflict resolved by keeping mine:', await text(loser, '.tiptap p'));

  await alice.goto(BASE); await alice.waitForSelector('input[type=file]');
  const input = await alice.$('input[type=file]');
  await input.uploadFile(SAMPLE);
  await alice.waitForSelector('.tiptap h1', { timeout: 8000 });
  log('imported md ->', await alice.$eval('.title-input', (e) => e.value), '|', (await alice.$eval('.tiptap', (e) => e.innerHTML)).slice(0, 140));
  await alice.screenshot({ path: `${SHOTS}/09-imported.png` });

  const carol = await session('carol');
  await login(carol, 'carol');
  await carol.goto(docUrl); await carol.waitForSelector('.empty');
  log('carol:', await text(carol, '.empty p'));

  // opening a doc that ends in a list must not trigger a save
  let patches = 0;
  bob.on('request', (r) => r.method() === 'PATCH' && patches++);
  await bob.goto(`${BASE}/d/d_welcome`); await bob.waitForSelector('.tiptap'); await sleep(2000);
  await bob.goto(BASE); await bob.waitForSelector('.list-head'); await sleep(500);
  log('PATCHes from merely opening a doc:', patches);
  if (patches) throw new Error('opening a doc triggered a save');

  await alice.click('.header-user .btn'); await alice.waitForSelector('.login-card');
  log('sign out ok');
} catch (e) {
  console.log('FAILED:', e.message);
  process.exitCode = 1;
} finally {
  console.log(errors.length ? `PAGE ERRORS:\n${errors.join('\n')}` : 'no page errors');
  await browser.close();
}
