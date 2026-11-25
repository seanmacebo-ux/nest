// Real room pages at phone width, backed by the Worker and disposable SQLite.
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
const root = new URL('../../', import.meta.url);
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
const base='http://127.0.0.1:' + server.address().port;
const browser=await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {});
const errors=[];
async function phone(name) {
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.route('https://fonts.googleapis.com/**',r=>r.abort());
  const auth=await context.request.post(base+'/login',{form:{username:name,password:'test-password',next:'/skin'},maxRedirects:0});
  assert.equal(auth.status(),303);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/skin',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>NEST._ready);
  return page;
}
async function eventually(check) {
  for (let i=0;i<100;i++) { if (await check()) return; await new Promise(r=>setTimeout(r,50)); }
  assert.fail('Timed out waiting for shared state');
}
try {
  const anonymous=await fetch(base+'/skin',{redirect:'manual'});
  assert.equal(anonymous.status,302);
  assert.match(anonymous.headers.get('location'),/^\/login/);
  const first=await phone('sean'), second=await phone('mishka');
  assert.equal(await first.title(),'Skin · The Nest');
  assert.equal(await first.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
  await first.locator('.menubtn').click();
  assert.equal(await first.locator('.navtile[aria-current=page]').innerText(),'🧴\nSkin');
  await first.locator('.menubtn').click();
  const tick='[data-tick="skin-bought-anua"]';
  await first.locator(tick).click();
  await eventually(()=>JSON.parse(db.prepare('SELECT v FROM kv WHERE k=?').get('ticks')?.v || '{}')['skin-bought-anua']);
  await first.reload();await first.waitForFunction(()=>NEST._ready);
  assert.equal(await first.locator(tick).getAttribute('aria-checked'),'true');
  await second.evaluate(()=>NEST._pull());
  assert.equal(await second.locator(tick).getAttribute('aria-checked'),'true');
  await first.locator('#skin-start').fill('2027-01-04');
  await first.locator('#skin-note-4').fill('Bumps 2 / marks 3 / texture 2');
  await first.locator('[data-tick="skin-photo-4"]').press('Space');
  await eventually(()=>db.prepare('SELECT v FROM kv WHERE k=?').get('note:skin-check-4')?.v==='Bumps 2 / marks 3 / texture 2');
  await eventually(()=>db.prepare('SELECT v FROM kv WHERE k=?').get('note:skin-start')?.v==='2027-01-04');
  await second.evaluate(()=>NEST._pull());
  assert.equal(await second.locator('#skin-note-4').inputValue(),'Bumps 2 / marks 3 / texture 2');
  assert.equal(await second.locator('#skin-start').inputValue(),'2027-01-04');
  assert.match(await second.locator('[data-skin-week="4"]').textContent(),/1 Feb 2027/);
  assert.equal(await second.locator('[data-tick="skin-photo-4"]').getAttribute('aria-checked'),'true');
  await second.locator(tick).click();
  await eventually(()=>!JSON.parse(db.prepare('SELECT v FROM kv WHERE k=?').get('ticks').v)['skin-bought-anua']);
  await first.reload();await first.waitForFunction(()=>NEST._ready);
  assert.equal(await first.locator(tick).getAttribute('aria-checked'),'false');
  assert.equal(await first.locator('#skin-note-4').inputValue(),'Bumps 2 / marks 3 / texture 2');
  await first.screenshot({path:'/tmp/nest-skin-mobile.png',fullPage:true});
  await first.emulateMedia({colorScheme:'dark'});
  assert.equal(await first.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
  await first.screenshot({path:'/tmp/nest-skin-dark.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('Skin browser checks passed: private auth, 390px light/dark layout, active mobile nav, bought/photo checks, keyboard access, shared dates/notes, reload persistence and untick propagation.');
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); db.close(); }
