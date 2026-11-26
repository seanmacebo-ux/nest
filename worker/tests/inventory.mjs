// Offline regressions against built assets: real projection and summary renderers.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const text=html=>html.replace(/<[^>]+>/g,'');
const choices={},ticks={},listeners={},nodes={};
const element=()=>({innerHTML:'',dataset:{},addEventListener(name,fn){this.handler=fn;},querySelector(selector){
  const tag=selector==='b'?'b':selector==='small'?'small':'span';
  const cls=selector.startsWith('.')?'[^>]*class="'+selector.slice(1)+'"[^>]*':'[^>]*';
  const match=this.innerHTML.match(new RegExp('<'+tag+cls+'>([\\s\\S]*?)</'+tag+'>'));
  return {textContent:text(match?.[1]||'')};
}});
const document={body:{dataset:{overview:'decided'}},activeElement:null,
  createElement:element,getElementById:id=>nodes[id]??=element(),querySelector:()=>null,querySelectorAll:()=>[]};
const NEST={_get:()=>choices,isTicked:id=>!!ticks[id]};
const ctx={document,NEST,location:{search:''},URLSearchParams,localStorage:{getItem:()=>null},fetch:async()=>({ok:false}),Event,
  window:{NEST,addEventListener:(name,fn)=>listeners[name]=fn}};
vm.createContext(ctx);
vm.runInContext(read('room-data.js')+read('item-status.js'),ctx);
ctx.NEST_ITEMS=ctx.window.NEST_ITEMS;
const M=ctx.NEST_ITEMS,canonical=M.items.filter(x=>!x.ref);
const item=name=>M.items.find(x=>x.name===name);
assert.deepEqual(JSON.parse(JSON.stringify(M.summary().counts)),{need:19,considering:13,decided:3,bought:9});
assert.deepEqual(Array.from(canonical.filter(x=>M.status(x)==='decided'),x=>x.name).sort(),['Coffee table','Fridge','Washer']);
assert.equal(M.totals(canonical.filter(x=>M.status(x)==='decided')).total,14607);
for(const name of ['TV','TV stand','Couch','Mattress','Pillows','Bedroom fan','Laptop','Ring light + tripod','Evotel fibre 120/120'])assert.equal(M.status(item(name)),'bought',name);
assert.equal(item('Confirm fibre network'),undefined);assert.equal(item('Mini UPS for router'),undefined);
assert.equal(M.price(item('TV stand')),1103.19);
const ref=M.items.find(x=>x.ref);
assert.equal(M.price(ref),M.price(ref.source));assert.equal(M.status(ref),M.status(ref.source));
assert.equal(Object.values(M.summary('Water').counts).reduce((a,b)=>a+b,0),2);
const mic=item('Streaming mic'), key=M.optionKey(mic,mic.o[0]);
choices[key]='consider';assert.equal(M.status(mic),'considering');
choices[key]='reject'; // remaining considered options keep this item Considering
assert.equal(M.optionStatus(mic,mic.o[0]),'reject');delete choices[key];
for(const task of M.forRoom('WiFi').filter(x=>x.tick)) {
 assert.equal(M.status(task),'need');ticks[task.tick]=1;assert.equal(M.status(task),'bought');delete ticks[task.tick];
}
assert.equal(new Set(canonical.map(x=>x.id)).size,canonical.length);
assert.equal(Object.values(M.summary().counts).reduce((a,b)=>a+b,0),canonical.length);
vm.runInContext(read('overview.js'),ctx);await new Promise(resolve=>setTimeout(resolve,0));
assert.match(nodes['views-switcher'].innerHTML,/How this works: Need → Considering → Decided → Bought/);
for(const view of ['need','considering','decided','bought','all']) {
 // Exercise the actual switch handler and renderer.
 nodes['views-switcher'].handler({target:{closest:()=>({dataset:{view}})}});
 const expected=canonical.filter(x=>view==='all'||M.status(x)===view);
 const ids=Array.from(nodes.overview.innerHTML.matchAll(/class="summary-item" data-item="([^"]+)"/g),m=>m[1]);
 assert.deepEqual(ids.sort(),Array.from(expected,x=>x.id.replace(/&/g,'&amp;')).sort());
 assert.match(nodes.overview.innerHTML,new RegExp('data-view-total="'+M.totals(expected).total+'"'));
 if(view==='decided')assert.match(nodes.overview.innerHTML,/R14,607/);
}
// Shopping uses the same canonical inventory, grouped by status.
document.body.dataset.overview='shopping';vm.runInContext(read('overview.js'),ctx);await new Promise(resolve=>setTimeout(resolve,0));
assert.equal((nodes.overview.innerHTML.match(/class="summary-item"/g)||[]).length,canonical.length);
for(const status of ['need','considering','decided','bought'])assert.match(nodes.overview.innerHTML,new RegExp(M.label(status)+' · '+M.summary().counts[status]));
vm.runInContext(read('item-surfaces.js'),ctx);
for(const [status,n] of Object.entries(M.summary().counts))assert.ok(nodes['home-inventory'].innerHTML.includes(n+' '+M.label(status)));
assert.equal((nodes['wifi-inventory'].innerHTML.match(/data-item=/g)||[]).length,4);
console.log('Inventory regressions passed: chosen/purchased/completed status, exact prices, references, shared choices, checklist transitions, Overview filters/totals, Shopping and Home summaries.');
for(const room of [null,...new Set(canonical.map(x=>x.room))])console.log(JSON.stringify({room:room||'All',...M.summary(room)}));

for(const [key] of M.statuses)console.log(JSON.stringify({status:key,...M.totals(canonical.filter(x=>M.status(x)===key))}));
