// Compact inventory summaries use exactly the same projection as rooms and Overview.
(() => {
  const M=NEST_ITEMS;
  const rooms=[...ROOMS,{g:'WiFi',href:'wifi.html'}];
  const counts=s=>M.statuses.map(([key,label])=>`${s.counts[key]} ${label}`).join(' · ');
  function render() {
    const home=document.getElementById('home-inventory');
    if(home)home.innerHTML='<b>The flat · '+M.items.filter(x=>!x.ref).length+' items</b><p>'+M.statuses.map(([key,label])=>`<a href="decided.html?view=${key}">${M.summary().counts[key]} ${label}</a>`).join(' · ')+'</p><p>'+M.money(M.summary().toGo)+' to go · '+M.money(M.summary().spent)+' bought (known prices)</p>';
    for(const el of document.querySelectorAll('[data-inventory-room]')) {
      const room=rooms.find(r=>r.href===el.dataset.inventoryRoom+'.html');
      const s=M.summary(room.g);
      el.textContent=counts(s)+' · '+M.money(s.toGo)+' to go'+(s.unpriced?' · '+s.unpriced+' unpriced':'')+(room.g==='WiFi'?' · Evotel 120/120 live · R897/month':'');
    }
    const toBuy=document.getElementById('home-to-buy');
    if(toBuy)toBuy.innerHTML='<b>Still to get:</b> '+M.items.filter(x=>!x.ref&&M.status(x)!=='bought').length+' items · <a href="list.html">Shopping</a> · <a href="decided.html?view=decided">'+M.summary().counts.decided+' chosen, not yet bought</a>.';
    for(const [mount,name] of [['home-laptop','Laptop'],['home-couch','Couch']]) {
      const el=document.getElementById(mount),it=M.items.find(x=>x.name===name);
      if(el)el.innerHTML=M.label(M.status(it))+' · <b>'+name+':</b> '+it.detail+' · '+M.money(M.price(it));
    }
    const fibre=M.forRoom('WiFi').find(x=>x.monthly);
    const homeFibre=document.getElementById('home-fibre');
    if(homeFibre)homeFibre.textContent=M.label(M.status(fibre))+' · Fibre: '+fibre.note+' '+M.money(fibre.monthly)+'/month.';
    const tracker=document.getElementById('tracker-fibre');
    if(tracker)tracker.innerHTML='<span class="box">✓</span><span class="txt">'+M.label(M.status(fibre))+' · Fibre: done <small>'+fibre.note+' <a href="wifi.html">WiFi →</a></small></span>';
    const furniture=document.getElementById('tracker-furniture');
    if(furniture)furniture.innerHTML='<span class="box"></span><span class="txt">Furniture board <small>'+['Lounge','Bedroom','Kitchen + dining'].map(room=>room+': '+counts(M.summary(room))).join('<br>')+'<br><a href="decided.html?view=decided">Chosen, not yet bought →</a> · <a href="list.html">Shopping →</a></small></span>';
    const wifi=document.getElementById('wifi-inventory');
    if(wifi)wifi.innerHTML='<b>WiFi · '+counts(M.summary('WiFi'))+'</b>'+M.forRoom('WiFi').map(it=>`<p data-item="${it.id}" data-status="${M.status(it)}">${M.label(M.status(it))} · ${it.name}${it.monthly?' · '+M.money(it.monthly)+'/month':''}</p>`).join('');
  }
  render();
  window.addEventListener('nest:sync',render);
  window.addEventListener('nest:choices',render);
})();
