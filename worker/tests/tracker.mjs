// Local-only phone UI checks. Uses an installed Playwright, no npm dependencies.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=new URL('../public/',import.meta.url);
const base='https://nest.test';
const browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
const rows=new Map(), legacy={have:55000,rows:{rent:{amt:11777,on:0},groceries:{amt:4444,on:1}}};
rows.set('local:nest_pacer',{k:'local:nest_pacer',v:JSON.stringify(legacy),rev:1});
const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:'dark',timezoneId:'Africa/Johannesburg'});
const page=await context.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin!==base) return route.abort();
  if(url.pathname==='/api/me') return route.fulfill({json:{username:'sean'}});
  if(url.pathname==='/api/kv') return route.fulfill({json:{rows:[...rows.values()]}});
  if(url.pathname.startsWith('/api/kv/')) {
    const k=decodeURIComponent(url.pathname.slice(8)),data=req.postDataJSON(),current=rows.get(k);
    if(data.rev!==(current?.rev||0)) return route.fulfill({status:409,json:{current:current||null}});
    const row={k,v:data.v,rev:(current?.rev||0)+1};rows.set(k,row);return route.fulfill({json:row});
  }
  try {const body=readFileSync(new URL('.'+url.pathname,root));return route.fulfill({body,contentType:url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.css')?'text/css':'text/html'});}
  catch {return route.fulfill({status:404,body:'Not found'});}
});
const state=()=>page.evaluate(()=>NEST._get('nest_money_v1'));
const expand=async id=>{const d=page.locator('[data-section="'+id+'"]');if(!await d.evaluate(e=>e.open))await d.locator('summary').first().click();};
try {
  await page.clock.setFixedTime(new Date('2026-11-26T10:00:00+02:00'));
  await page.goto(base+'/tracker.html');
  await page.waitForFunction(()=>NEST._ready&&NEST._get('nest_money_v1',null));
  assert.equal((await state()).months['2026-11'].income,55000);
  assert.equal((await state()).months['2026-11'].rows.rent.plan,11777);
  assert.equal((await state()).months['2026-11'].rows.rent.on,false);
  assert.deepEqual(await page.evaluate(()=>NEST._get('nest_pacer')),legacy);
  assert.match(await page.locator('.money-left strong').innerText(),/R44\s056/);
  await expand('trends');assert.match(await page.locator('[data-section=trends]').innerText(),/at least two months/);
  await page.locator('#expense-form [name=amount]').fill('123.45');
  await page.locator('#expense-form [name=category]').selectOption('groceries');
  await page.locator('#expense-form [name=note]').fill('<coffee> & bread');
  await page.locator('#expense-form button').click();
  assert.equal(Object.values((await state()).months['2026-11'].log)[0].amount,123.45);
  assert.match(await page.locator('.expense-log').innerText(),/<coffee> & bread/);
  assert.equal(await page.locator('#expense-form [name=amount]').inputValue(),'');
  await page.locator('[data-category=groceries] [data-field=actual]').fill('50');
  await page.locator('[data-category=groceries] [data-field=actual]').press('Tab');
  assert.match(await page.locator('[data-category=groceries]').innerText(),/173,45/);
  // A background sync must preserve an unsent quick-add draft.
  await page.locator('#expense-form [name=amount]').fill('222');
  await page.evaluate(()=>window.dispatchEvent(new Event('nest:sync')));
  await page.locator('#expense-form [name=note]').focus();
  assert.equal(await page.locator('#expense-form [name=amount]').inputValue(),'222');
  await page.locator('#expense-form [name=note]').fill('December shop');
  await page.locator('#expense-form [name=date]').fill('2026-12-05');
  await page.locator('#expense-form button').click();
  assert.equal(await page.locator('.month-switch h3').innerText(),'Dec 2026');
  assert.equal((await state()).months['2026-12'].rows.groceries.actual,null);
  assert.equal(Object.values((await state()).months['2026-12'].log)[0].amount,222);
  assert.equal(Object.values((await state()).months['2026-11'].log).length,1);
  await expand('trends');assert.equal(await page.locator('.money-chart').count(),2);
  await page.locator('#category-form [name=name]').fill('Transport');await page.locator('#category-form button').click();
  const category=Object.entries((await state()).categories).find(([,c])=>c.name==='Transport')[0];
  await page.locator('#expense-form [name=category]').selectOption(category);
  await page.locator('#expense-form [name=amount]').fill('100');await page.locator('#expense-form button').click();
  assert.equal(Object.values((await state()).months['2026-12'].log).length,2);
  page.on('dialog',d=>d.accept());await page.locator('[data-delete-log]').first().click();
  assert.equal(Object.values((await state()).months['2026-12'].log).length,1);
  await expand('pots');await page.locator('#pot-form [name=name]').fill('Emergency');await page.locator('#pot-form [name=target]').fill('10000');await page.locator('#pot-form [name=current]').fill('2500');await page.locator('#pot-form button').click();
  assert.equal(await page.locator('.pot svg').getAttribute('aria-label'),'25 percent saved');
  await expand('recurring');await page.locator('#sub-form [name=name]').fill('Fibre');await page.locator('#sub-form [name=amount]').fill('989');await page.locator('#sub-form button').click();
  assert.match(await page.locator('[data-section=recurring]').innerText(),/R989/);
  await expand('outlook');await page.locator('[data-car=goal]').fill('50000');await page.locator('[data-car=goal]').press('Tab');
  assert.match(await page.locator('[data-section=outlook]').innerText(),/Behind by R50\s000/);
  await expand('loan');await page.locator('#loan-start').selectOption('2026-11');assert.match(await page.locator('[data-section=loan]').innerText(),/Oct 2027/);
  // Preview navigation creates no fabricated history.
  const count=Object.keys((await state()).months).length;await page.locator('[data-month="1"]').click();
  assert.equal(Object.keys((await state()).months).length,count);assert.equal(await page.locator('#start-month').count(),1);
  await page.locator('#start-month').click();assert.equal(Object.keys((await state()).months).length,count+1);
  for(const id of ['budget','quick','trends','outlook','pots','recurring','loan','pace']) await expand(id);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.locator('#mile li').count(),6);assert.equal(await page.locator('ul.todos').count(),2);
  await page.evaluate(async()=>{await NEST._flush();});
  await page.reload();await page.waitForFunction(()=>NEST._ready);
  assert.equal((await state()).car.goal,50000);assert.equal(Object.keys((await state()).pots).length,1);
  assert.deepEqual(await page.evaluate(()=>NEST._get('nest_pacer')),legacy);
  for(const id of ['pace','trends','outlook','pots','recurring','loan'])await expand(id);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  mkdirSync('/tmp/nest-tracker',{recursive:true});
  await page.screenshot({path:'/tmp/nest-tracker/390-dark.png',fullPage:true});
  await page.emulateMedia({colorScheme:'light'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  console.log('Tracker phone checks passed: 390px layout, shared legacy migration, plan/actual edits, logs/date routing/deletion, draft preservation, charts, categories, pots, subscriptions, loan schedule, preview/save, reload persistence, and retained lists.');
} finally {await browser.close();}
