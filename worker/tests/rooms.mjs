// Real room pages at phone width, backed by the Worker and disposable SQLite.
// Requires Playwright (PLAYWRIGHT_MODULE may point to its index.mjs).
// CHROMIUM_PATH optionally selects an already installed browser.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync, mkdirSync} from 'node:fs';
mkdirSync('/tmp/layout',{recursive:true});
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
  const path = new URL(req.url).pathname;
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
  const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:'dark'});
  await context.route('https://fonts.googleapis.com/**',r=>r.abort());
  const auth=await context.request.post(base+'/login',{form:{username:name,password:'test-password',next:'/office.html'},maxRedirects:0});
  assert.equal(auth.status(),303);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/office.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>NEST._ready);
  return page;
}
async function eventually(check) {
  for (let i=0;i<100;i++) { if (await check()) return; await new Promise(r=>setTimeout(r,50)); }
  assert.fail('Timed out waiting for shared state');
}
try {
  const sean=await phone('sean'), mishka=await phone('mishka');
  // Reproduce the empty summary shell while the room script is delayed.
  await sean.route('**/rooms.js?*', r=>r.abort());
  await sean.goto(base+'/office.html',{waitUntil:'domcontentloaded'});
  assert.equal(await sean.locator('#hero').textContent(),'');
  await sean.evaluate(()=>document.documentElement.classList.remove('nest-app'));
  assert.ok(await sean.locator('#hero').isVisible());
  assert.equal(await sean.locator('#hero').evaluate(e=>e.offsetHeight),38);
  await sean.screenshot({path:'/tmp/nest-office-empty-before.png'});
  await sean.evaluate(()=>document.documentElement.classList.add('nest-app'));
  assert.equal(await sean.locator('#hero').isVisible(),false);
  await sean.screenshot({path:'/tmp/nest-office-delayed.png'});
  await sean.unroute('**/rooms.js?*');
  for (const room of ['office','lounge','bedroom','kitchen','bathroom','water']) {
    await sean.goto(base+'/'+room+'.html',{waitUntil:'domcontentloaded'});
    assert.equal(await sean.locator('#addsend').textContent(),'Send to The Nest →');
    assert.ok((await sean.locator('#hero').textContent()).includes('still to spend'));
    assert.equal(await sean.locator('.dectray').count(),0);
    assert.equal(await sean.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
  }
  for(const name of ['rooms','office','lounge','decided']) {
    await sean.goto(base+'/'+name+'.html',{waitUntil:'domcontentloaded'});
    await sean.waitForFunction(()=>NEST._ready);
    await sean.screenshot({path:'/tmp/layout/local-'+name+'.png'});
  }
  // Inventory and grouping: compare the rendered DOM to the original static arrays.
  const inventory=[], counts={};
  for (const room of ['office','lounge','bedroom','kitchen','bathroom','water']) {
    await sean.goto(base+'/'+room+'.html',{waitUntil:'domcontentloaded'});
    await sean.waitForFunction(()=>NEST._ready);
    const expected=await sean.evaluate(()=>{
      const room=document.body.dataset.room;
      const raw=[...NEED,...MAYBE].filter(g=>g.g===room).flatMap(g=>g.items);
      const options=raw.reduce((n,it)=>n+(it.ref?[...NEED,...MAYBE].flatMap(g=>g.items).find(x=>x.name===it.ref).o.length:(it.o||[]).length),0);
      return {room,n:raw.length+(BOUGHT[room]||[]).length,options,ids:NEST_ITEMS.forRoom(room).filter(x=>!x.ref).map(x=>x.id)};
    });
    inventory.push(...expected.ids);
    assert.equal(await sean.locator('.room-item').count(),expected.n);
    assert.equal(await sean.locator('[data-dk]').count(),expected.options,'No product options lost or duplicated');
    assert.equal(await sean.locator('.status-group').count(),4);
    assert.equal(await sean.locator('.status-group .room-item').count(),expected.n);
    assert.equal(await sean.evaluate(()=>new Set([...document.querySelectorAll('[data-item]')].map(x=>x.dataset.item)).size),expected.n);
    counts[expected.room]={};
    for(const status of ['need','considering','decided','bought']) {
      const group=sean.locator('.status-group[data-status='+status+']');
      counts[expected.room][status]=await group.locator('.room-item').count();
      await sean.locator('[data-filter='+status+']').click();
      assert.equal(await sean.locator('.status-group:visible').count(),1);
      assert.equal(await group.isVisible(),true);
    }
    await sean.locator('[data-filter=all]').click();
    assert.equal(await sean.locator('.rejected[open]').count(),0);
    if(await sean.locator('[data-cmp]').count()) {
      await sean.locator('[data-cmp]').first().click();
      assert.equal(await sean.locator('.cmp-ov').isVisible(),true);
      await sean.locator('[data-cmpclose]').click();
    }
  }
  for(const view of ['rooms','decided','list']) {
    await sean.goto(base+'/'+view+'.html',{waitUntil:'domcontentloaded'});
    await sean.waitForFunction(()=>NEST._ready);
    assert.equal(await sean.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    if(view==='rooms') {
      for(const [room,statuses] of Object.entries(counts)) for(const [status,n] of Object.entries(statuses)) {
        assert.match(await sean.locator('[data-room-summary="'+room+'"] [data-count='+status+']').textContent(),new RegExp('^'+n+' '));
      }
    } else {
      if(view==='decided') {
        await sean.waitForFunction(()=>document.querySelector('#overview').dataset.viewsReady==='true');
        await sean.locator('[data-view=all]').click();
      }
      const wifi=await sean.evaluate(()=>NEST_ITEMS.items.filter(x=>x.room==='WiFi').map(x=>x.id));
      const ids=await sean.locator('[data-item]').evaluateAll(els=>els.map(x=>x.dataset.item));
      assert.deepEqual(ids.sort(),[...inventory,...wifi].sort(),'Every canonical item appears exactly once');
      for(const a of await sean.locator('.item-link').all()) {
        const target=await a.getAttribute('href');
        const response=await sean.request.get(base+'/'+target); assert.equal(response.status(),200);
      }
    }
    const links=await sean.locator('.bottom-bar a,.navtile,.room-link').evaluateAll(els=>els.map(x=>x.getAttribute('href')));
    for(const href of new Set(links)) assert.equal((await sean.request.get(base+'/'+href)).status(),200,'Logged-in destination '+href);
    assert.equal(await sean.locator('.bottom-bar').innerText().then(t=>t.includes('Picks')),false);
  }
  await sean.goto(base+'/office.html',{waitUntil:'domcontentloaded'});
  await sean.locator('.addbox summary').click();
  await sean.locator('#addtxt').fill('Monitor under R3000\nhttps://example.com/monitor');
  await sean.locator('#addsend').click();
  await eventually(async()=>await sean.locator('#addtxt').inputValue()==='');
  assert.match(await sean.locator('.toast').innerText(),/^Sent to The Nest/);
  assert.ok(await sean.locator('.toast').evaluate(e=>e.getBoundingClientRect().bottom<=document.querySelector('.bottom-bar').getBoundingClientRect().top),'Toast clears bottom bar');
  const queued=db.prepare('SELECT * FROM requests').all();
  assert.equal(queued.length,1);assert.equal(queued[0].created_by,'sean');
  assert.equal(queued[0].text.replace(/\r\n/g,'\n'),'🛒 Add to Office + streaming:\nMonitor under R3000\nhttps://example.com/monitor');
  assert.equal(queued[0].status,'queued');
  await sean.route('**/api/requests',r=>r.fulfill({status:503,body:'unavailable'}));
  await sean.locator('#addtxt').fill('Keep this draft');await sean.locator('#addsend').click();
  await eventually(async()=>!(await sean.locator('#addsend').isDisabled()));
  assert.equal(await sean.locator('#addtxt').inputValue(),'Keep this draft');
  assert.match(await sean.locator('.toast').innerText(),/Could not send/);
  await sean.unroute('**/api/requests');
  const key=await sean.locator('[data-dk]').first().getAttribute('data-dk'), card=sean.locator('[data-dk="'+key+'"]');
  await card.locator('[data-dv=consider]').click();
  assert.equal(await card.locator('xpath=ancestor::section[contains(@class,"status-group")]').getAttribute('data-status'),'considering');
  await eventually(()=>db.prepare('SELECT v FROM kv WHERE k=?').get('local:nest_decide')?.v.includes('consider'));
  await mishka.evaluate(()=>NEST._pull());
  assert.equal(await mishka.locator('[data-dk="'+key+'"]').locator('[data-dv=consider]').getAttribute('aria-pressed'),'true');
  await mishka.locator('[data-dk="'+key+'"]').locator('[data-dv=reject]').click();
  await eventually(()=>JSON.parse(db.prepare('SELECT v FROM kv WHERE k=?').get('local:nest_decide').v)[key]==='reject');
  await sean.evaluate(()=>NEST._pull());
  assert.equal(await card.locator('[data-dv=reject]').getAttribute('aria-pressed'),'true');
  await card.locator('xpath=ancestor::details').evaluate(el=>el.open=true);
  await card.locator('[data-dv=reject]').click();
  await eventually(()=>JSON.parse(db.prepare('SELECT v FROM kv WHERE k=?').get('local:nest_decide').v)[key]==='');
  await mishka.evaluate(()=>NEST._pull());
  assert.equal(await mishka.locator('[data-dk="'+key+'"]').locator('[data-dv=reject]').getAttribute('aria-pressed'),'false');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM requests').get().n,1);
  assert.equal(await sean.locator('.dectray').count(),0);
  // The public origin must retain Telegram, even with NEST loaded.
  const publicPage=await browser.newPage({viewport:{width:390,height:844}});
  await publicPage.route('https://fonts.googleapis.com/**',r=>r.abort());
  await publicPage.route('https://nest-test.github.io/**',async r=>{
    const path=new URL(r.request().url()).pathname;
    if (path.startsWith('/api/')) return r.fulfill({status:404,body:'not an API'});
    const response=await asset(new Request(r.request().url()));
    await r.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
  });
  await publicPage.goto('https://nest-test.github.io/office.html',{waitUntil:'domcontentloaded'});
  assert.match(await publicPage.locator('#addsend').textContent(),/Telegram/);
  await publicPage.locator('[data-dk]').first().locator('[data-dv=consider]').click();
  assert.equal(await publicPage.locator('.dectray.on .send').textContent(),'Send to The Nest →');
  assert.ok(await publicPage.locator('.dectray').evaluate(e=>e.getBoundingClientRect().bottom<=document.querySelector('.bottom-bar').getBoundingClientRect().top),'Decision tray clears bottom bar');
  await publicPage.locator('.addbox summary').click();await publicPage.locator('#addtxt').fill('Public test');await publicPage.locator('#addsend').click();
  assert.match(await publicPage.locator('.toast').innerText(),/Opening Telegram/);
  assert.ok(await publicPage.evaluate(()=>JSON.parse(localStorage.getItem('nest_sent'))['add:Public test']));
  assert.deepEqual(errors,[]);
  console.log('Room browser checks passed: 390x844 inventory conservation, four groups/filters, hub counts, aggregate uniqueness, compare, logged-in navigation, six-room layout, request enqueue/confirmation, failed-send draft, Sean/Mishka consider/reject/undo via Worker KV, no app send tray, public Telegram flow.');
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); db.close(); }
