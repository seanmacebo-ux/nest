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

const more = () => page.locator('.bottom-bar button');
const sheet = () => page.locator('#more-sheet');
const canonical = path => path.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
async function openMore() {
  await more().click();
  assert.equal(await more().getAttribute('aria-expanded'), 'true');
  assert.ok(await sheet().isVisible());
}
async function closeMore() {
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.querySelector('#more-sheet').open);
  assert.equal(await more().getAttribute('aria-expanded'), 'false');
  assert.ok(await more().evaluate(e=>e===document.activeElement));
}
async function layout() {
  const metrics = await page.evaluate(() => {
    const bar=document.querySelector('.bottom-bar'), wrap=document.querySelector('.wrap');
    return {overflow:document.documentElement.scrollWidth>innerWidth,
      padding:parseFloat(getComputedStyle(wrap).paddingBottom),barHeight:bar.offsetHeight,
      tabs:[...bar.children].map(a=>({height:a.offsetHeight,width:a.offsetWidth}))};
  });
  assert.equal(metrics.overflow,false, 'No horizontal overflow: '+page.url());
  assert.ok(metrics.padding>=metrics.barHeight+24, 'Content has bottom clearance');
  for(const t of metrics.tabs) assert.ok(t.height>=48 && t.width>=48);
  await page.evaluate(()=>window.scrollTo({top:document.body.scrollHeight,behavior:'instant'}));
  assert.ok(await page.evaluate(()=>{
    const w=document.querySelector('.wrap'), b=document.querySelector('.bottom-bar');
    return w.lastElementChild.getBoundingClientRect().bottom<=b.getBoundingClientRect().top;
  }), 'Final content is reachable above bar: '+page.url());
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
}
try {
  const password = process.env.NEST_BASE_URL
    ? JSON.parse(readFileSync(process.env.NEST_LOGIN_FILE, 'utf8')).passwords.sean
    : 'test-password';
  const auth = await context.request.post(base+'/login', {form:{username:'sean',password,next:'/'},maxRedirects:0});
  assert.equal(auth.status(),303,'Sean login');
  await page.emulateMedia({colorScheme:'dark'});
  await page.goto(base+'/index.html',{waitUntil:'networkidle'});
  assert.deepEqual(await page.locator('.bottom-tab > span:last-child').allTextContents(),['Home','Rooms','Overview','Ask','More']);
  await openMore();
  assert.deepEqual(await page.locator('.navgroup h3').allTextContents(),['Us','Life']);
  assert.deepEqual(await page.locator('.navgroup').nth(0).locator('a').allTextContents(),['Plan','Tracker','Findings','Shopping']);
  assert.deepEqual(await page.locator('.navgroup').nth(1).locator('a').allTextContents(),['Medical aid','Skin','Cars','Apartments','Post-pregnancy']);
  assert.equal(await page.locator('.navlogout').getAttribute('href'),'/logout');
  await closeMore();
  const destinations=[['index','Home'],['rooms','Rooms'],['decided','Overview'],['ask','Ask'],
    ...['lounge','bedroom','kitchen','bathroom','office','water','wifi'].map(p=>[p,'Rooms']),
    ...['list','tracker','findings','medical','skin','cars','apartments','recovery','plans'].map(p=>[p,'More'])];
  const visited=new Set();
  for(const [path,active] of destinations) {
    const response=await page.goto(base+'/'+path+'.html',{waitUntil:'networkidle'});
    assert.equal(response.status(),200,path);
    assert.equal(canonical(new URL(page.url()).pathname),canonical('/'+path+'.html'));
    assert.equal(await page.locator('.bottom-tab.active > span:last-child').textContent(),active,path);
    assert.equal(await page.locator('.nav-in a').count(),0,'Title-only top bar');
    assert.match(await page.locator('meta[name=viewport]').getAttribute('content'),/viewport-fit=cover/);
    await layout();
    const controls=await page.locator('.acts button, .acts a, .iacts button, .dec button, .clink, .sendbtn, #ask-form button, .skin-actions button, #shareBtn').evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>({label:e.textContent.trim(),height:e.getBoundingClientRect().height})));
    for(const control of controls) assert.ok(control.height>=48,JSON.stringify(control));
    if(path==='rooms') assert.deepEqual(await page.locator('.room-link').evaluateAll(as=>as.map(a=>a.getAttribute('href'))),['lounge.html','bedroom.html','bathroom.html','water.html','kitchen.html','office.html','wifi.html']);
    if(['index','office','skin','lounge'].includes(path)) await page.screenshot({path:(process.env.NEST_SCREENSHOT_DIR || '/tmp/design1')+'/'+(process.env.NEST_BASE_URL?'after-':'local-')+(path==='index'?'home':path)+'.png'});
    await openMore();
    if(['tracker','findings','medical','skin','cars','apartments','recovery'].includes(path)) assert.equal(await page.locator('.navtile[aria-current]').getAttribute('href'),path+'.html');
    for(const href of await page.locator('.navtile, .bottom-bar a').evaluateAll(as=>as.map(a=>a.getAttribute('href')))) visited.add(href);
    await closeMore();
    console.log(path+': 200; '+active+' highlighted; no overflow; content clears bar');
  }
  // Exercise actual primary, room-hub and More links, including Cloudflare's clean URLs.
  for(const href of visited) {
    if(href==='rooms.html') {
      await page.locator('.bottom-bar a[href="rooms.html"]').click();await page.waitForLoadState('networkidle');
      for(const room of ['lounge','bedroom','kitchen','bathroom','office','water','wifi']) {
        await page.locator('.room-link[href="'+room+'.html"]').click();await page.waitForLoadState('networkidle');
        assert.equal(canonical(new URL(page.url()).pathname),'/'+room);
        await page.locator('.bottom-bar a[href="rooms.html"]').click();await page.waitForLoadState('networkidle');
      }
    } else {
      const primary=page.locator('.bottom-bar a[href="'+href+'"]');
      if(await primary.count()) await primary.click();
      else {await openMore();await page.locator('.navtile[href="'+href+'"]').click();}
      await page.waitForLoadState('networkidle');
      assert.equal(canonical(new URL(page.url()).pathname),canonical('/'+href));
    }
  }
  await page.goto(base+'/office.html',{waitUntil:'networkidle'});
  await openMore();
  await page.screenshot({path:(process.env.NEST_SCREENSHOT_DIR || '/tmp/design1')+'/'+(process.env.NEST_BASE_URL?'after-':'local-')+'more-sheet.png'});
  // Modal focus remains in the sheet, and background scrolling is locked.
  for(let i=0;i<15;i++){await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.querySelector('#more-sheet').contains(document.activeElement)));}
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).overflow),'hidden');
  await page.setViewportSize({width:390,height:360});
  const scroll=page.locator('.sheet-scroll');
  assert.ok(await scroll.evaluate(e=>e.scrollHeight>e.clientHeight),'Short viewport scrolls internally');
  await scroll.hover();await page.mouse.wheel(0,600);
  await page.waitForFunction(()=>document.querySelector('.sheet-scroll').scrollTop>0);
  await page.locator('.navlogout').scrollIntoViewIfNeeded();
  assert.ok(await page.locator('.navlogout').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));
  await closeMore();
  await page.setViewportSize({width:390,height:844});
  await openMore();
  await page.mouse.click(10,10);
  await page.waitForFunction(()=>!document.querySelector('#more-sheet').open);
  await openMore();
  await page.goBack();
  await page.waitForFunction(()=>!document.querySelector('#more-sheet').open);
  await openMore();
  const handle=await page.locator('.sheet-handle').boundingBox();
  await page.mouse.move(handle.x+handle.width/2,handle.y+20);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2,handle.y+100,{steps:10});await page.mouse.up();
  await page.waitForFunction(()=>!document.querySelector('#more-sheet').open);
  for(const colorScheme of ['light','dark']) {
    await page.emulateMedia({colorScheme});await layout();
    const theme=await page.evaluate(()=>{const m=[...document.querySelectorAll('meta[name="theme-color"]')].find(m=>matchMedia(m.media).matches);return {meta:m.content,bg:getComputedStyle(document.body).backgroundColor};});
    assert.equal(theme.meta,colorScheme==='dark'?'#100E22':'#F6F4FF');
    assert.equal(theme.bg,colorScheme==='dark'?'rgb(16, 14, 34)':'rgb(246, 244, 255)');
  }
  await page.setViewportSize({width:1000,height:844});await layout();
  await page.setViewportSize({width:390,height:844});
  if(!process.env.NEST_BASE_URL) {
    const publicPage=await browser.newPage({viewport:{width:390,height:844}});
    await publicPage.route('https://nest-test.github.io/**',async r=>{
      const response=await asset(new Request(r.request().url()));
      await r.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
    });
    await publicPage.goto('https://nest-test.github.io/index.html',{waitUntil:'networkidle'});
    assert.equal(await publicPage.locator('.bottom-tab').count(),4,'Public origin omits Ask');
    await publicPage.locator('.bottom-bar button').click();
    assert.equal(await publicPage.locator('.bottom-bar, #more-sheet').locator('a[href="skin.html"],a[href="ask.html"],a[href="/logout"]').count(),0,'App-only navigation stays private');
    await publicPage.close();
  }
  await openMore();await page.locator('.navlogout').click();await page.waitForURL('**/login');
  assert.equal((await context.request.get(base+'/skin',{maxRedirects:0})).status(),302,'Logout clears session');
  assert.deepEqual(errors,[]);
  console.log('App shell passed: all destinations, clicks, 390x844 dark/light, desktop, content clearance, short-sheet scroll, focus trap, Escape, outside tap, Back, swipe, logout.');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));db.close();}
