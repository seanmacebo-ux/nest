// Menu checks against built assets locally, or NEST_BASE_URL with NEST_LOGIN_FILE for live auth.
// Requires Playwright (PLAYWRIGHT_MODULE may point to its index.mjs).
// CHROMIUM_PATH optionally selects an already installed browser.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {pbkdf2Sync} from 'node:crypto';
import worker from '../src/index.js';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const db = new DatabaseSync(':memory:');
db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
class Statement {
  constructor(sql, args = []) { this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.sql, args); }
  async first() { return db.prepare(this.sql).get(...this.args) || null; }
  async all() { return {results: db.prepare(this.sql).all(...this.args)}; }
  async run() { return {meta: db.prepare(this.sql).run(...this.args)}; }
}
const salt = Buffer.from('room-browser-test');
const hash = 'pbkdf2$100000$' + salt.toString('base64') + '$' + pbkdf2Sync('test-password', salt, 100000, 32, 'sha256').toString('base64');
const root = new URL('../public/', import.meta.url);
const mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.webp':'image/webp', '.png':'image/png'};
async function asset(req) {
  let path = new URL(req.url).pathname;
  if (path === '/skin') path = '/skin.html';
  try { return new Response(readFileSync(new URL('.' + path, root)), {headers:{'Content-Type':mime[path.slice(path.lastIndexOf('.'))] || 'application/octet-stream'}}); }
  catch { return new Response('Not found', {status:404}); }
}
const env = {
  USERS_JSON:JSON.stringify({sean:hash, mishka:hash}), SESSION_SECRET:'local-test-only',
  DB:{prepare:sql=>new Statement(sql), async batch(ss) { db.exec('BEGIN'); try { const result=[]; for (const s of ss) result.push(await s.run()); db.exec('COMMIT'); return result; } catch(e) { db.exec('ROLLBACK'); throw e; } }},
  ASSETS:{fetch:asset}
};
const server = createServer(async (req, res) => {
  const chunks=[]; for await (const c of req) chunks.push(c);
  const request=new Request('http://' + req.headers.host + req.url, {method:req.method,headers:req.headers,...(chunks.length ? {body:Buffer.concat(chunks)} : {})});
  const response=await worker.fetch(request,env);
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=process.env.NEST_BASE_URL || 'http://127.0.0.1:' + server.address().port;
const browser=await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {});
const errors=[];
const context = await browser.newContext({viewport:{width:390,height:844}});
const page = await context.newPage();
page.on('pageerror', e => errors.push(e.message));
const expected = [
  ['Us', ['Plan', 'Tracker', 'Decided', 'Findings']],
  ['The flat', ['Lounge', 'Bedroom', 'Kitchen', 'Bathroom', 'Office', 'Water', 'WiFi']],
  ['Life', ['Medical aid', 'Skin', 'Cars', 'Apartments', 'Post-pregnancy']]
];
async function openMenu() {
  await page.locator('.menubtn').click();
  assert.equal(await page.locator('.menubtn').getAttribute('aria-expanded'), 'true');
}
async function layout() {
  const metrics = await page.evaluate(() => {
    const panel = document.querySelector('.navpanel'), rect = panel.getBoundingClientRect();
    return {bottom:rect.bottom, height:rect.height, scroll:panel.scrollHeight, client:panel.clientHeight,
      overflow:document.documentElement.scrollWidth > innerWidth,
      targets:[...panel.querySelectorAll('a'), document.querySelector('.menubtn'), document.querySelector('.nav-in [aria-current]')].map(a => {
        const r=a.getBoundingClientRect(); return {name:a.textContent.trim(), width:r.width, height:r.height};
      })};
  });
  assert.equal(metrics.overflow, false);
  assert.ok(metrics.bottom <= page.viewportSize().height, JSON.stringify(metrics));
  for (const target of metrics.targets) assert.ok(target.height >= 44 && target.width >= 44, JSON.stringify(target));
  return metrics;
}
try {
  const password = process.env.NEST_BASE_URL
    ? JSON.parse(readFileSync(process.env.NEST_LOGIN_FILE, 'utf8')).passwords.sean
    : 'test-password';
  const auth = await context.request.post(base+'/login', {form:{username:'sean',password,next:'/skin'},maxRedirects:0});
  assert.equal(auth.status(), 303, 'Sean login');
  await page.goto(base+'/skin', {waitUntil:'networkidle'});
  await openMenu();
  for (const [i, [label, names]] of expected.entries()) {
    const group = page.locator('.navgroup').nth(i);
    assert.equal(await group.locator('h2').textContent(), label);
    assert.deepEqual(await group.locator('.navtile > span:last-child').allTextContents(), names);
  }
  assert.equal(await page.locator('.navtile').count(), 18);
  const original = await page.locator('.nav-in a.tab').evaluateAll(as => as.map(a=>a.getAttribute('href')).sort());
  const links = await page.locator('.navtile').evaluateAll(as => as.map(a=>({href:a.getAttribute('href'),name:a.lastElementChild.textContent})));
  assert.deepEqual(links.map(a=>a.href).sort(), original);
  for (const colorScheme of ['light','dark']) {
    await page.emulateMedia({colorScheme});
    const metrics = await layout();
    assert.ok(metrics.scroll <= metrics.client, 'Menu fits fully at 390x844');
    await page.screenshot({path:'/tmp/nest-menu-'+(process.env.NEST_BASE_URL ? 'live-' : '')+colorScheme+'.png'});
    console.log(colorScheme+' 390x844 panel: '+Math.round(metrics.height)+'px; all 18 links fit');
  }
  await page.setViewportSize({width:390,height:500});
  const short = await layout();
  assert.ok(short.scroll > short.client, 'Short viewport uses internal scroll');
  await page.locator('.navlogout').scrollIntoViewIfNeeded();
  assert.ok(await page.locator('.navlogout').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight;}));
  assert.ok(await page.locator('.navpanel').evaluate(e=>e.scrollTop > 0));
  await page.setViewportSize({width:390,height:844});
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.menubtn').getAttribute('aria-expanded'), 'false');
  assert.ok(await page.locator('.menubtn').evaluate(e=>e===document.activeElement));
  for (const link of links.filter(a=>a.href!=='/logout')) {
    await openMenu();
    const responsePromise = page.waitForNavigation({waitUntil:'networkidle'});
    await page.locator('.navtile').filter({has:page.locator('span:last-child', {hasText:new RegExp('^'+link.name+'$')})}).click();
    const response = await responsePromise;
    assert.equal(response.status(), 200, link.name);
    // Cloudflare Assets redirects .html URLs to their extensionless form.
    const canonical = path => path.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
    assert.equal(canonical(new URL(page.url()).pathname), canonical('/'+link.href), link.name+' destination');
    assert.equal(await page.locator('.nav-in a.tab[aria-current]').textContent(), link.name);
    await openMenu();
    assert.equal(await page.locator('.navtile[aria-current] > span:last-child').textContent(), link.name);
    await layout();
    await page.locator('.menubtn').click();
    console.log(link.name+': 200, active page highlighted');
  }
  await openMenu();
  await page.locator('.wrap').click({position:{x:10,y:700}});
  assert.equal(await page.locator('.menubtn').getAttribute('aria-expanded'), 'false');
  await openMenu();
  await page.setViewportSize({width:1000,height:844});
  assert.equal(await page.locator('.navpanel').isVisible(), false);
  assert.equal(await page.locator('.nav-in a.tab').count(), 18);
  await page.setViewportSize({width:390,height:844});
  await openMenu();
  await page.locator('.navlogout').click();
  await page.waitForURL('**/login');
  const denied = await context.request.get(base+'/skin', {maxRedirects:0});
  assert.equal(denied.status(), 302, 'Logout clears session');
  assert.deepEqual(errors, []);
  console.log('Menu checks passed: groups, unchanged hrefs, phone light/dark, short-screen scroll, 17 destinations, active pages, dismissal, desktop, logout.');
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); db.close(); }
