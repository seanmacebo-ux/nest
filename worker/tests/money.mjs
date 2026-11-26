// Offline calculation and storage-merge regressions for the shared money tracker.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const ctx={window:{},document:{getElementById:()=>null}};
vm.runInNewContext(readFileSync(new URL('../../tracker-money.js',import.meta.url),'utf8'),ctx);
const {migrate,preview,category,totals,insights,shift,loanDue}=ctx.window.NEST_MONEY;
const old={have:57000,rows:{rent:{amt:12345,on:0},groceries:{amt:4321,on:1},unknown:{amt:987,on:1}}};
const before=JSON.stringify(old), s=migrate(old), nov=s.months['2026-11'];
assert.equal(nov.income,57000);assert.equal(nov.rows.rent.plan,12345);assert.equal(nov.rows.rent.on,false);
assert.equal(nov.rows.unknown.plan,987);assert.equal(JSON.stringify(old),before);
assert.equal(Object.keys(s.months).length,1);assert.equal(insights(s,'2026-11',new Date(2026,10,26)).recorded,0);
assert.equal(totals(s,nov).used,4321+5000+1500+987);
nov.rows.groceries.actual=0;assert.equal(category(nov,'groceries').value,0);
nov.log.a={category:'groceries',amount:250,date:'2026-11-04'};
nov.log.b={category:'groceries',amount:50,date:'2026-11-05'};
assert.equal(category(nov,'groceries').actual,300);
nov.rows.groceries.actual=100;assert.equal(category(nov,'groceries').actual,400);
delete nov.log.a;assert.equal(category(nov,'groceries').actual,150);
delete nov.log.b;nov.rows.groceries.actual=null;assert.equal(category(nov,'groceries').value,4321);
nov.rows.groceries.recurring=false;
const dec=preview(s,'2026-12');assert.equal(dec.rows.groceries.plan,0);assert.equal(dec.rows.rent.on,false);
assert.equal(dec.rows.fnb_loan.plan,5000);assert.equal(dec.rows.fnb_loan.actual,null);assert.equal(Object.keys(dec.log).length,0);
assert.equal(preview(s,'2027-09').rows.fnb_loan.on,true);assert.equal(preview(s,'2027-10').rows.fnb_loan.on,false);
nov.rows.fnb_loan.on=false;nov.rows.fnb_loan.plan=0;
assert.equal(preview(s,'2026-12').rows.fnb_loan.on,false);assert.equal(preview(s,'2026-12').rows.fnb_loan.plan,0);
s.loan.start='2026-11';assert.equal(loanDue(s,'2027-10'),true);assert.equal(loanDue(s,'2027-11'),false);
assert.equal(shift('2026-12',1),'2027-01');assert.equal(shift('2027-01',-1),'2026-12');
const data=migrate();data.months['2026-11'].rows.car_pot.actual=2000;data.months['2026-11'].rows.fnb_loan.actual=5000;
data.months['2026-12']=preview(data,'2026-12');data.months['2026-12'].rows.car_pot.actual=4000;data.months['2026-12'].rows.fnb_loan.actual=5000;
data.car.opening=1000;data.loan.openingPayments=1;
let a=insights(data,'2026-12',new Date(2026,11,10));
assert.equal(a.recorded,2);assert.equal(a.avgSpend,25400);assert.equal(a.avgLeft,26600);assert.equal(a.avgCar,3000);
assert.equal(a.balance,7000);assert.equal(a.projection,25000);assert.equal(a.paid,3);assert.equal(a.remaining,21);
assert.equal(a.forecast,9000/10*31);
assert.equal(insights(data,'2026-11',new Date(2026,11,10)).recorded,1);
assert.equal(insights(data,'2026-12',new Date(2026,11,31)).allowance,null);
data.months['2026-12'].log.future={category:'groceries',amount:1000,date:'2026-12-30'};
a=insights(data,'2026-12',new Date(2026,11,10));assert.equal(a.forecast,9000/10*31);
// Verify the existing sync merger preserves keyed additions and independent deletions.
const sync={navigator:{},localStorage:{},document:{addEventListener:()=>{}},window:{}};
vm.runInNewContext(readFileSync(new URL('../../nest.js',import.meta.url),'utf8'),sync);
const base=JSON.stringify({months:{'2026-11':{log:{a:{amount:100},b:{amount:200}}}}});
const mine=JSON.stringify({months:{'2026-11':{log:{b:{amount:200},c:{amount:300}}}}});
const theirs=JSON.stringify({months:{'2026-11':{log:{a:{amount:100},b:{amount:200},d:{amount:400}}}}});
const merged=JSON.parse(sync.window.NEST._merge('local:nest_money_v1',base,mine,theirs));
assert.deepEqual(merged.months['2026-11'].log,{b:{amount:200},c:{amount:300},d:{amount:400}});
console.log('Money checks passed: legacy preservation, plan/actual/log totals, carry-over, loan boundaries, real-data averages, projections, pace, and concurrent expense merges.');
// Exercise the rendered controller without a browser or network. Browser layout
// remains covered by tracker.mjs when Chrome launch is available.
const listeners={}, events={}, store=new Map(), now=()=>new Date(2026,10,26,12);
const root={innerHTML:'',contains:()=>false,querySelectorAll:()=>[],addEventListener:(k,fn)=>events[k]=fn,insertAdjacentHTML:(_,s)=>{root.innerHTML=s+root.innerHTML;}};
const ui={window:{addEventListener:(k,fn)=>listeners[k]=fn},
  document:{activeElement:null,getElementById:id=>id==='money'?root:null},
  Date:class extends Date {constructor(...args){super(...(args.length?args:[now()]));}},
  NEST:{_ready:false,_get:(k,fallback)=>store.has(k)?structuredClone(store.get(k)):fallback,_set:(k,v)=>store.set(k,structuredClone(v)),wire:()=>{},_repaint:()=>{}},
  crypto:{randomUUID:()=>String(store.size)+'-'+Math.random()},confirm:()=>true,setTimeout:fn=>fn(),
  FormData:class {constructor(f){this.data=f.values;}get(k){return this.data[k]||'';}entries(){return Object.entries(this.data);}}
};
vm.runInNewContext(readFileSync(new URL('../../tracker-money.js',import.meta.url),'utf8'),ui);
assert.equal(store.size,0);assert.equal(root.inert,true);
store.set('nest_pacer',old);ui.NEST._ready=true;listeners['nest:sync']();
assert.equal(store.get('nest_money_v1').months['2026-11'].income,57000);
assert.equal(root.inert,false);assert.match(root.innerHTML,/Nov 2026/);
const click=(dataset={},id='')=>events.click({target:{closest:()=>({dataset,id})}});
click({month:'1'});assert.match(root.innerHTML,/Dec 2026/);assert.equal(Object.keys(store.get('nest_money_v1').months).length,1);
click({},'start-month');assert.equal(Object.keys(store.get('nest_money_v1').months).length,2);
assert.match(root.innerHTML,/money-chart/);
const submit=(id,values)=>events.submit({preventDefault:()=>{},target:{id,values,dataset:{}}});
submit('expense-form',{amount:'123.45',category:'groceries',date:'2026-11-20',note:'<bread> & milk'});
let uiState=store.get('nest_money_v1');
assert.equal(Object.values(uiState.months['2026-11'].log)[0].amount,123.45);
assert.equal(Object.keys(uiState.months['2026-12'].log).length,0);
assert.match(root.innerHTML,/&lt;bread&gt; &amp; milk/);assert.match(root.innerHTML,/Nov 2026/);
const expenseId=Object.keys(uiState.months['2026-11'].log)[0];click({deleteLog:expenseId});
assert.equal(Object.keys(store.get('nest_money_v1').months['2026-11'].log).length,0);
submit('category-form',{name:'Transport'});assert.match(root.innerHTML,/Transport/);
submit('pot-form',{name:'Emergency',target:'10000',current:'2500'});assert.match(root.innerHTML,/25 percent saved/);
submit('sub-form',{name:'Fibre',amount:'989'});assert.match(root.innerHTML,/R989/);
assert.deepEqual(store.get('nest_pacer'),old);
// Settings changes reach storage and the loan schedule updates existing plans.
const change=(id,value,dataset={})=>events.change({target:{id,value,dataset,closest:()=>null,blur:()=>{}}});
change('money-income','60000');assert.equal(store.get('nest_money_v1').months['2026-11'].income,60000);
change('','50000',{car:'goal'});assert.match(root.innerHTML,/Behind by/);
change('loan-start','2026-11');assert.match(root.innerHTML,/Oct 2027/);
console.log('Money controller checks passed: wait-for-sync migration, rendering/charts, month preview/save, date routing, safe note escaping, deletion, custom categories, pots, subscriptions, settings and original pacer retention.');
