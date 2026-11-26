// Two phones with separate storage, a shared revision API and simulated outages.
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const rows = new Map(); let offline = false;
const source = readFileSync(new URL('../../nest.js',import.meta.url),'utf8');
function phone(initial = {}) {
  const saved = new Map(Object.entries(initial).map(([k,v])=>[k,JSON.stringify(v)]));
  const localStorage = { get length(){return saved.size;},key:i=>[...saved.keys()][i],getItem:k=>saved.get(k) ?? null,setItem:(k,v)=>saved.set(k,v) };
  const context = {localStorage,crypto,Event,setTimeout:()=>1,clearTimeout:()=>{},setInterval:()=>{},navigator:{},
    document:{querySelectorAll:()=>[],getElementById:()=>null,addEventListener:()=>{}},
    dispatchEvent:()=>{},location:{assign:()=>{throw new Error('Unexpected login redirect');}},
    fetch: async (path,options={}) => {
      if(offline) throw new Error('offline');
      if(path==='/api/kv') return Response.json({rows:[...rows.values()]});
      const k=decodeURIComponent(path.slice(8)), data=JSON.parse(options.body), current=rows.get(k);
      if(data.rev !== (current?.rev ?? 0)) return Response.json({current:current ?? null},{status:409});
      const row={k,v:data.v,rev:(current?.rev??0)+1}; rows.set(k,row); return Response.json(row);
    }
  };
  context.window=context;
  vm.runInNewContext(source,context);
  return context.NEST;
}
async function settle(nest){while(nest._busy) await new Promise(setImmediate);await nest._flush();while(nest._busy) await new Promise(setImmediate);}
async function pull(nest){await nest._pull();await settle(nest);}
const sean=phone({nest_ticks:{sean:1},nest_save_car:[{label:'A'}],nest_notes:{sean:'local note'},nest_pacer:{have:52000,rows:{rent:{amt:11900,on:1},food:{amt:4000,on:1}}}});
await pull(sean);
const mishka=phone({nest_ticks:{mishka:1},nest_save_car:[{label:'B'}],nest_notes:{mishka:'another note'}});
await pull(mishka); await pull(sean);
assert.deepEqual(JSON.parse(JSON.stringify(sean.ticks())),{sean:1,mishka:1});
assert.equal(sean.saves('car').length,2); assert.equal(sean.getNote('mishka'),'another note');
// Independent concurrent tick operations survive a revision conflict.
sean.toggleTick('sean'); mishka.toggleTick('third');
await settle(sean); await settle(mishka); await settle(mishka); await pull(sean);
assert.deepEqual(JSON.parse(JSON.stringify(sean.ticks())),{mishka:1,third:1});
// An untick must remain removed on refresh, even on the other phone.
await pull(mishka);assert.equal(mishka.isTicked('sean'),false);
// Different pacer fields merge after two phones edit the same revision.
sean._set('nest_pacer',{have:60000,rows:{rent:{amt:11900,on:1},food:{amt:4000,on:1}}});
const pacer=mishka._get('nest_pacer',{});pacer.rows.food.amt=4500;mishka._set('nest_pacer',pacer);
await settle(sean);await settle(mishka);await settle(mishka);await pull(sean);
assert.equal(sean._get('nest_pacer').have,60000);assert.equal(sean._get('nest_pacer').rows.food.amt,4500);
// Failures retain a durable outbox, and a new page instance can retry it.
offline=true;sean.setNote('offline','kept after reload');await settle(sean);
assert.ok(Object.keys(sean._out()).length);
const reloaded=phone({nest_sync_outbox:sean._out(),nest_sync_migrated:true,nest_notes:sean.notes()});
offline=false;await pull(reloaded);await settle(reloaded);await pull(mishka);
assert.equal(mishka.getNote('offline'),'kept after reload');assert.equal(Object.keys(reloaded._out()).length,0);
// Blank note tombstones propagate deletions and do not resurrect on reload.
mishka.setNote('offline','');await settle(mishka);await pull(reloaded);assert.equal(reloaded.getNote('offline'),'');
// Editable lists preserve independent edits and explicit deletes by stable ID.
sean._set('nest_todos_0',[{id:'a',title:'A'},{id:'b',title:'B'}]);await settle(sean);await pull(mishka);
sean._set('nest_todos_0',[{id:'a',title:'Changed A'},{id:'b',title:'B'}]);
mishka._set('nest_todos_0',[{id:'a',title:'A'}]);await settle(sean);await settle(mishka);await settle(mishka);await pull(sean);
assert.deepEqual(JSON.parse(JSON.stringify(sean._get('nest_todos_0'))),[{id:'a',title:'Changed A'}]);
console.log('Client checks passed: two-phone migration, concurrent ticks/pacer/list edits, durable offline retries, note deletion.');

// Legacy choice records sync unchanged; only their displayed status is normalized.
const legacyChoices={
 'Lounge|Coffee table|Top':'decided',
 'Kitchen|Fridge|Top':{status:'decided',paid:true,note:'Keep receipt'},
 'Kitchen|Washer|Top':{v:'decided',delivered:true,note:'Keep delivery note'}
};
sean._set('nest_decide',legacyChoices);await settle(sean);await pull(mishka);
assert.deepEqual(JSON.parse(JSON.stringify(mishka._get('nest_decide'))),legacyChoices);
for(const [key,expected] of [['Lounge|Coffee table|Top','consider'],['Kitchen|Fridge|Top','bought'],['Kitchen|Washer|Top','bought']]) {
 assert.equal(mishka.choiceState(mishka._get('nest_decide')[key]),expected);
}
assert.deepEqual(JSON.parse(JSON.stringify(mishka._get('nest_decide'))),legacyChoices);
console.log('Legacy choice sync checks passed: unpaid -> Considering, paid/delivered -> Bought, original values and notes preserved.');
