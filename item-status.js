// A single projection of existing room data and shared option choices. No KV migration.
(() => {
  const statuses=[['need','🔎 Need'],['considering','🤔 Considering'],['decided','✅ Decided'],['bought','🧾 Bought']];
  const id=(room,name)=>room+'|'+name;
  const slug=t=>t.split(/[,(]/)[0].trim().toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const number=p=>Number((String(p).replace(/,/g,'').match(/\d+(?:\.\d+)?/)||['0'])[0]);
  const money=n=>'R'+n.toLocaleString('en-ZA',{maximumFractionDigits:2}).replace(/\s/g,',');
  const items=[...NEED,...MAYBE].flatMap(g=>g.items.map(it=>({...it,room:g.g,id:id(g.g,it.name)})));
  for(const it of items.filter(it=>it.ref)) {
    const source=items.find(x=>x.name===it.ref);it.o=source.o;it.source=source;
  }
  for(const [room,rows] of Object.entries(BOUGHT)) for(const html of rows) {
    const el=document.createElement('div');el.innerHTML=html;
    const name=el.querySelector('b').textContent.replace(/:$/,'');
    const dateNote=name==='Laptop'?'Paid 2 Nov. Arrived 5 Nov.':name==='Ring light + tripod'?'Already owned; date and price not recorded.':'';
    if(dateNote) { el.querySelector('small').textContent+=' '+dateNote; }
    items.push({room,name,id:id(room,name),boughtHTML:el.innerHTML,price:el.querySelector('.pr').textContent,detail:el.querySelector('.tx').textContent});
  }
  // Historical notes are kept on their current item, not duplicated as extra purchases.
  const noteNames=['Bed base or frame, Queen XL','Mattress','TV','Fridge','Washer','Coffee table','TV stand','Couch','Laptop'];
  DECISION_NOTES.forEach((note,i)=>{const it=items.find(x=>x.name===noteNames[i]);if(it)it.history=note;});
  // WiFi has a service and checklist rather than product alternatives. Historical
  // ISP comparisons stay on its page; they are not additional purchases.
  items.push(...WIFI_ITEMS.map(it=>({...it,room:'WiFi',href:'wifi.html',id:id('WiFi',it.name)})));
  const choices=()=>window.NEST?NEST._get('nest_decide',{}):JSON.parse(localStorage.getItem('nest_decide')||'{}');
  const optionKey=(it,o)=>{const source=it.source||it;return source.room+'|'+source.name+'|'+o.n;};
  const optionState=(key,fallback)=>choices()[key]??fallback??'';
  function status(it) {
    if(it.source)return status(it.source);
    if(it.boughtHTML)return 'bought';
    if(it.fixedStatus)return it.fixedStatus;
    if(it.tick)return window.NEST?.isTicked(it.tick)?'bought':'need';
    if((it.o||[]).some(o=>optionState(optionKey(it,o),o.st)==='consider'))return 'considering';
    return 'need';
  }
  function optionStatus(it,o) {
    const state=optionState(optionKey(it,o),o.st);
    if(status(it)==='decided' && o.pick)return 'decided';
    return state==='reject'?'reject':state==='consider'?'considering':'need';
  }
  const price=it=>it.source?price(it.source):number(it.price || ((it.o||[]).find(o=>o.pick)||(it.o||[]).length===1&&it.o[0]||{}).p);
  function totals(list) {
    return {total:list.reduce((n,x)=>n+price(x),0),monthly:list.reduce((n,x)=>n+(x.monthly||0),0),unpriced:list.filter(x=>!price(x)&&!x.monthly&&!x.tick).length};
  }
  function totalText(list) {
    const t=totals(list);
    return (t.total?money(t.total):t.unpriced?'Prices not recorded':'No one-off cost recorded')+(t.monthly?' + '+money(t.monthly)+'/month':'')+(t.unpriced?' · '+t.unpriced+' unpriced':'');
  }
  function summary(room) {
    const mine=items.filter(x=>!x.ref&&(!room||x.room===room)), counts=Object.fromEntries(statuses.map(([key])=>[key,mine.filter(x=>status(x)===key).length]));
    return {counts,toGo:mine.filter(x=>status(x)!=='bought').reduce((n,x)=>n+price(x),0),spent:mine.filter(x=>status(x)==='bought').reduce((n,x)=>n+price(x),0),unpriced:mine.filter(x=>!x.ref&&status(x)!=='bought'&&!price(x)&&!x.tick).length};
  }
  window.NEST_ITEMS={items,statuses,id,slug,number,money,status,price,summary,totals,totalText,optionState,optionKey,optionStatus,label:key=>statuses.find(x=>x[0]===key)?.[1],forRoom:room=>items.filter(x=>x.room===room)};
})();
