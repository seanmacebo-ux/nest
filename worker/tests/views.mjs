// Real room pages at phone width, backed by the Worker and disposable SQLite.
// Requires Playwright (PLAYWRIGHT_MODULE may point to its index.mjs).
// CHROMIUM_PATH optionally selects an already installed browser.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync, mkdirSync} from 'node:fs';
mkdirSync('/tmp/views',{recursive:true});
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
const base=process.env.NEST_BASE_URL || 'http://127.0.0.1:' + server.address().port;
const browser=await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {});
const errors=[];
const live=!!process.env.NEST_BASE_URL;
const passwords=live?JSON.parse(readFileSync(process.env.NEST_LOGIN_FILE,'utf8')).passwords:null;
const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:'dark'});
const auth=await context.request.post(base+'/login',{form:{username:'sean',password:live?passwords.sean:'test-password',next:'/decided.html'},maxRedirects:0});
assert.equal(auth.status(),303);
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const open=async()=>{
  await page.goto(base+'/decided.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>NEST._ready&&document.querySelector('#overview').dataset.viewsReady==='true');
};
try {
  await open();
  assert.deepEqual(await page.evaluate(async()=>await (await fetch('/api/me')).json()),{username:'sean'});
  assert.equal(await page.locator('#overview').getAttribute('data-active-view'),'considering');
  const legend=await page.locator('#status-legend').innerText();
  assert.equal(legend,'🔎 Need · 🤔 Considering · ✅ Decided · 🧾 Bought');
  for(const view of ['considering','need','decided','bought','all']) {
    await page.locator('[data-view='+view+']').click();
    const expected=await page.evaluate(view=>{
      const all=NEST_ITEMS.items.filter(x=>!x.ref), selected=all.filter(x=>view==='all'||NEST_ITEMS.status(x)===view);
      return {ids:selected.map(x=>x.id).sort(),total:selected.reduce((n,x)=>n+NEST_ITEMS.price(x),0),counts:Object.fromEntries(['considering','need','decided','bought','all'].map(k=>[k,all.filter(x=>k==='all'||NEST_ITEMS.status(x)===k).length]))};
    },view);
    assert.deepEqual(await page.locator('.summary-item').evaluateAll(es=>es.map(e=>e.dataset.item).sort()),expected.ids);
    assert.equal(Number(await page.locator('[data-view-total]').getAttribute('data-view-total')),expected.total);
    for(const [key,n] of Object.entries(expected.counts))assert.equal(Number(await page.locator('[data-view-count='+key+']').textContent()),n);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    for(const button of await page.locator('[data-view]').all())assert.ok(await button.evaluate(e=>e.offsetHeight>=48&&e.offsetWidth>=48));
    assert.equal(await page.locator('h1').textContent(),'Overview');
    assert.doesNotMatch(await page.locator('.bottom-bar').innerText(),/Picks/);
    const roomCounts=await page.locator('.view-room').evaluateAll(es=>es.map(e=>({room:e.dataset.viewRoom,n:e.querySelectorAll('.summary-item').length,text:e.querySelector('h2').textContent})));
    for(const room of roomCounts)assert.ok(room.text.endsWith('· '+room.n));
    await page.evaluate(()=>window.scrollTo(0,600));
    assert.ok(await page.locator('#views-switcher').evaluate(e=>Math.abs(e.getBoundingClientRect().top-document.querySelector('.app-topbar').getBoundingClientRect().bottom)<3));
    await page.evaluate(()=>window.scrollTo(0,0));
    if(['considering','need','bought'].includes(view)) {
      await page.screenshot({path:'/tmp/views/'+(live?'live-':'local-')+view+'.png'});
      await page.screenshot({path:'/tmp/views/'+(live?'live-':'local-')+view+'-full.png',fullPage:true});
    }
    console.log((live?'Live':'Local')+' '+view+': '+expected.ids.length+' items, total '+expected.total+', counts and layout verified');
  }
  // Every canonical item, including WiFi and shopping-only items, appears once in All.
  const raw=await page.evaluate(()=>[...NEED,...MAYBE].flatMap(g=>g.items.filter(x=>!x.ref).map(x=>g.g+'|'+x.name)));
  for(const id of raw)assert.equal(await page.locator('.summary-item').evaluateAll((es,id)=>es.filter(e=>e.dataset.item===id).length,id),1);
  assert.equal(await page.locator('[data-view-room="WiFi"]').count(),1);
  const bed=page.locator('.summary-item').filter({has:page.locator('.item-link b',{hasText:'Bed base or frame, Queen XL'})});
  assert.equal(await bed.count(),1);assert.match(await bed.innerText(),/Queen XL needed/);
  const bedStatus=await page.evaluate(()=>NEST_ITEMS.status(NEST_ITEMS.items.find(x=>x.name==='Bed base or frame, Queen XL')));
  assert.equal(await bed.getAttribute('data-status'),bedStatus);
  const tim=await bed.locator('.view-option').all();
  for(const option of tim)if((await option.innerText()).includes('Timeless'))assert.doesNotMatch(await option.innerText(),/Decided/);
  const links=await page.locator('.bottom-bar a,.navtile,.item-link').evaluateAll(es=>es.map(e=>e.getAttribute('href')));
  for(const href of new Set(links))assert.equal((await page.request.get(base+'/'+href)).status(),200,href);
  await page.locator('[data-view=need]').click();await open();
  assert.equal(await page.locator('#overview').getAttribute('data-active-view'),'need');
  assert.equal(await page.evaluate(()=>Object.keys(NEST._snapshot()).some(k=>k.includes('overview:view'))),false);
  if(!live) {
  // Switching logins in the same browser must not reuse Sean's view.
  await context.request.get(base+'/logout');
  assert.equal((await context.request.post(base+'/login',{form:{username:'mishka',password:live?passwords.mishka:'test-password'},maxRedirects:0})).status(),303);
  await open();assert.equal(await page.locator('#overview').getAttribute('data-active-view'),'considering');
  await context.request.get(base+'/logout');
  await context.request.post(base+'/login',{form:{username:'sean',password:live?passwords.sean:'test-password'},maxRedirects:0});
  await open();assert.equal(await page.locator('#overview').getAttribute('data-active-view'),'need');
  }
  if(!live) {
    // Real shared choice writes locally: two options become a side-by-side comparison.
    const fixture=await page.evaluate(()=>{
      const it=NEST_ITEMS.items.find(x=>x.name==='Bed base or frame, Queen XL');
      const opts=it.o.slice(0,2);const choices=NEST._get('nest_decide',{});
      for(const o of opts)choices[NEST_ITEMS.optionKey(it,o)]='consider';
      NEST._set('nest_decide',choices);window.dispatchEvent(new Event('nest:choices'));
      return {id:it.id,keys:opts.map(o=>NEST_ITEMS.optionKey(it,o))};
    });
    await page.locator('[data-view=considering]').click();
    const comparison=page.locator('.summary-item').filter({has:page.locator('.item-link b',{hasText:'Bed base or frame, Queen XL'})});
    assert.equal(await comparison.locator('.comparing .view-option').count(),2);
    const boxes=await comparison.locator('.view-option').evaluateAll(es=>es.map(e=>({x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y})));
    await comparison.screenshot({path:'/tmp/views/local-comparison.png'});
    assert.equal(boxes[0].y,boxes[1].y);assert.ok(boxes[1].x>boxes[0].x);
    assert.equal(await comparison.getAttribute('data-status'),'considering');
    await comparison.locator('[data-dv=reject]').first().click();
    assert.equal(await comparison.locator('.view-option').count(),1);
    await page.locator('[data-view=all]').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.locator('[data-view=need]').click();
    const target=page.locator('.summary-item').filter({has:page.locator('[data-dv=consider]')}).first();
    const id=await target.getAttribute('data-item');await target.locator('[data-dv=consider]').first().click();
    assert.equal(await page.locator('.summary-item').evaluateAll((es,id)=>es.some(e=>e.dataset.item===id),id),false);
    await page.locator('[data-view=considering]').click();
    assert.equal(await page.locator('.summary-item').evaluateAll((es,id)=>es.some(e=>e.dataset.item===id),id),true);
  }
  assert.deepEqual(errors,[]);
  console.log('Views checks passed at 390x844: inventory, status filters, totals, sticky segments, login-scoped persistence, navigation'+(live?'':', side-by-side comparison and Consider/Reject transitions'));
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));db.close();}
