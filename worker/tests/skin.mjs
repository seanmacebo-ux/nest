// Private Skin page at phone width, backed by the Worker and disposable SQLite.
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
  const first=await phone('sean'), second=await phone('sean');
  assert.equal(await first.title(),'Skin · The Nest');
  for (const page of [first, second]) {
    assert.doesNotMatch(await page.locator('body').innerText(), /photo/i);
    assert.doesNotMatch(await page.content(), /photo/i);
  }
  for (const file of ['skin.html', 'skin.js']) assert.doesNotMatch(readFileSync(new URL(file, root), 'utf8'), /photo/i);
  assert.equal(await first.locator('#skin-shopping [data-tick]').count(), 14);
  assert.equal(await first.locator('main > details.skin-card').count(), 6);
  for (const page of [first, second]) await page.locator('#shopping > summary').click();
  assert.equal(await first.locator('.skin-retailer').count(), 71);
  assert.equal(await first.locator('.skin-retailer[target="_blank"][rel="noopener noreferrer"]').count(), 71);
  assert.ok(await first.locator('a[href="tel:0114520851"]').count() > 0);
  assert.ok(await first.locator('a[href="tel:0116639900"]').count() > 0);
  const options = await first.locator('.skin-options li').allTextContents();
  for (const option of options) {
    assert.match(option, /Checked 25 Nov 2026/);
    assert.match(option, /R[\d,]+\.\d{2}|Price unverified/);
    assert.match(option, /In stock online|Out of stock online|Stock unverified/);
  }
  assert.match(await first.locator('#buy-retinoid').innerText(), /Schedule 3/);
  assert.match(await first.locator('#buy-skinoren').innerText(), /Schedule 1/);
  assert.match(await first.locator('#shopping').innerText(), /grey-market \/ counterfeit risk/);
  assert.match(await first.locator('#research').textContent(), /6–14 months/);
  assert.match(await first.locator('#later').textContent(), /6–8 weeks irritation-free/);
  assert.doesNotMatch(await first.locator('main').textContent(), /Mishka/i);
  assert.equal(await first.locator('#research').getAttribute('open'), null);
  await first.locator('#research > summary').press('Enter');
  assert.notEqual(await first.locator('#research').getAttribute('open'), null);
  await first.locator('#research > summary').click();
  assert.equal(await first.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
  await first.locator('.bottom-bar button').click();
  assert.equal(await first.locator('.navtile[aria-current=page]').innerText(),'Skin');
  await first.locator('.sheet-close').click();
  await first.waitForFunction(()=>!document.querySelector('#more-sheet').open);
  const tick='[data-tick="skin-bought-anua"]';
  await first.locator(tick).press('Space');
  await eventually(()=>JSON.parse(db.prepare('SELECT v FROM kv WHERE k=?').get('ticks')?.v || '{}')['skin-bought-anua']);
  await first.reload();await first.waitForFunction(()=>NEST._ready);
  await first.locator('#shopping > summary').click();
  assert.equal(await first.locator(tick).getAttribute('aria-checked'),'true');
  await second.evaluate(()=>NEST._pull());
  assert.equal(await second.locator(tick).getAttribute('aria-checked'),'true');
  const logKey='local:nest_skin_log_sean';
  const storedEntries=()=>Object.values(JSON.parse(db.prepare('SELECT v FROM kv WHERE k=?').get(logKey)?.v || '{}'));
  const settled=page=>page.waitForFunction(()=>NEST._ready&&!NEST._busy&&Object.keys(NEST._out()).length===0);
  await first.locator('#skin-start').fill('2027-01-04');
  await first.locator('#skin-log-note').fill('Less irritation today. <b>Plain text</b>');
  await first.getByRole('button',{name:'Better',exact:true}).press('Space');
  await eventually(()=>storedEntries().length===1);
  await settled(first);
  assert.equal(await first.locator('#skin-log-note').inputValue(),'');
  assert.match(await first.locator('#skin-log-status').innerText(),/Entry saved/);
  await first.reload();await first.waitForFunction(()=>NEST._ready);
  await first.locator('#shopping > summary').click();
  assert.equal(await first.locator('#skin-log > li').count(),1);
  assert.equal(await first.locator('#skin-log > li b').innerText(),'Better');
  assert.equal(await first.locator('.skin-entry-note').innerText(),'Less irritation today. <b>Plain text</b>');
  assert.equal(await first.locator('.skin-entry-note b').count(),0);
  assert.ok(Number.isFinite(Date.parse(await first.locator('#skin-log time').getAttribute('datetime'))));
  await second.evaluate(()=>NEST._pull());
  assert.equal(await second.locator('#skin-start').inputValue(),'2027-01-04');
  assert.equal(await second.locator('#skin-log > li').count(),1);
  // A draft survives background sync; it becomes an entry only on a button tap.
  await second.locator('#skin-log-note').fill('No change today.');
  await second.evaluate(()=>NEST._pull());
  assert.equal(await second.locator('#skin-log-note').inputValue(),'No change today.');
  await second.getByRole('button',{name:'Same',exact:true}).click();
  await eventually(()=>storedEntries().length===2);
  await settled(second);
  // First has an older revision. Saving here must preserve the other device's entry.
  await first.locator('#skin-log-note').fill('Feels dry this evening.');
  await first.getByRole('button',{name:'Worse',exact:true}).click();
  await settled(first);
  assert.equal(storedEntries().length,3);
  await second.evaluate(()=>NEST._pull());
  assert.deepEqual(await second.locator('#skin-log > li > b').allTextContents(),['Worse','Same','Better']);
  assert.deepEqual(await second.locator('.skin-entry-note').allTextContents(),['Feels dry this evening.','No change today.','Less irritation today. <b>Plain text</b>']);
  await second.locator(tick).click();
  await eventually(()=>!JSON.parse(db.prepare('SELECT v FROM kv WHERE k=?').get('ticks').v)['skin-bought-anua']);
  await first.reload();await first.waitForFunction(()=>NEST._ready);
  await first.locator('#shopping > summary').click();
  assert.equal(await first.locator(tick).getAttribute('aria-checked'),'false');
  assert.deepEqual(await first.locator('#skin-log > li > b').allTextContents(),['Worse','Same','Better']);
  for (const width of [320, 390]) {
    await first.setViewportSize({width,height:844});
    assert.equal(await first.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
  }
  await first.screenshot({path:'/tmp/nest-skin-mobile.png',fullPage:false});
  await first.emulateMedia({colorScheme:'dark'});
  assert.equal(await first.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
  await first.screenshot({path:'/tmp/nest-skin-dark.png',fullPage:false});
  assert.deepEqual(errors,[]);
  console.log('Skin browser checks passed: private auth, 14 products / 71 retailer options, dated stock/price notes, tel links, collapsible research and staged plan, 390px light/dark layout, active mobile nav, no image reminders, shopping ticks, keyboard access, dated log entries, plain-text notes, newest-first order, cross-device conflict merge, reload persistence and untick propagation.');
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); db.close(); }
