(() => {
  const M=NEST_ITEMS, inventory=M.items.filter(x=>!x.ref), view=document.body.dataset.overview, root=document.getElementById('overview');
  const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  document.getElementById('status-legend').innerHTML='<p class="status-legend">'+M.statuses.map(([k,l])=>`<span class="status-${k}">${l}</span>`).join(' · ')+'</p>';
  const href=it=>it.href || ROOMS.find(r=>r.g===it.room).href+'#'+M.slug(it.name);
  let active=new URLSearchParams(location.search).get('view')||'considering', preferenceKey=null;
  const views=[['considering','🤔 Considering'],['need','🔎 To do (Need)'],['decided','✅ Decided'],['bought','🧾 Bought'],['all','All']];
  const photo=(it,o)=>`<span class="view-photo">${o?.img?`<img src="${esc(o.img)}" alt="${esc(o.n)}" loading="lazy" width="96" height="96">`:`<span role="img" aria-label="No photo available">${esc(it.ic||'📦')}</span>`}</span>`;
  function option(it,o) {
    return `<div class="view-option" data-dk="${esc(M.optionKey(it,o))}" data-dl="${esc(it.name+': '+o.n)}" data-chosen="${!!it.fixedStatus&&o.pick===1}" data-st="${esc(o.st||'')}">${photo(it,o)}${o.pick?'<small>⭐ Recommended</small>':''}<b>${esc(o.n)}</b><strong>${esc(o.p||'Not priced')}</strong><small>${esc(o.s||'')}</small>${it.name==='Bed base or frame, Queen XL'&&/Timeless/.test(o.n)?'<p>Queen XL needed. This Queen frame does not fit.</p>':''}<div class="dec"></div></div>`;
  }
  function card(it) {
    const status=M.status(it), pk=(it.o||[]).find(o=>o.pick), price=M.price(it);
    const considered=(it.o||[]).filter(o=>M.optionStatus(it,o)==='considering');
    const options=active==='considering'&&considered.length?considered:pk?[pk]:(it.o||[]).slice(0,1);
    // A recommendation can differ from the considered options, so name it explicitly.
    const recommendation=pk?.n||it.recommended;
    const history=it.history && (it.name==='Bed base or frame, Queen XL'?'<p>Previous Queen recommendation: Timeless Bed Frame, MFA Online, R3,199. Queen XL needed; the old Queen choice does not fit. The current status is shown above.</p>':`<p>${it.history.html}</p><p>Price recorded then: ${esc(it.history.price)}.</p>`);
    return `<article class="summary-item" data-item="${esc(it.id)}" data-status="${status}"><span class="status-label status-${status}">${M.label(status)}</span><a class="item-link" href="${esc(href(it))}"><b>${esc(it.name)}</b><small>${esc(it.room)} →</small></a>${it.name==='Bed base or frame, Queen XL'?'<p><b>Queen XL needed</b></p>':''}<p>${esc(it.sub||'')}${it.sub?' · ':''}${recommendation?'⭐ Recommended: '+esc(recommendation):it.boughtHTML?'Purchased item':'No recommendation yet'}</p>${it.boughtHTML?`${photo(it)}<ul class="bl">${it.boughtHTML}</ul>`:`${it.note?`<details class="history"><summary>Item notes</summary><div>${it.note}</div></details>`:''}<b>${it.monthly?M.money(it.monthly)+'/month':price?M.money(price):'Not priced'}</b>`}${options.length?`<div class="view-options${options.length>1?' comparing':''}" aria-label="${options.length>1?'Options being compared':'Product option'}">${options.map(o=>option(it,o)).join('')}</div>`:it.boughtHTML?'':photo(it)}${it.name==='Weddell Duo filter refills'?'<a class="item-link" href="water.html#shower-filter">Also shown in Water →</a>':''}${history?`<details class="history"><summary>Decision notes · ${esc(it.history.shop)}</summary>${history}</details>`:''}</article>`;
  }
  const group=(key,title,items)=>`<section class="status-group" data-status="${key}"><h2 class="status-label status-${key}">${title} · ${items.length}</h2>${['decided','bought'].includes(key)?`<p class="group-total">${M.totalText(items)} ${key==='bought'?'bought (known prices)':'running total'}</p>`:''}${items.length?items.map(card).join(''):'<p class="status-empty">Nothing here yet.</p>'}</section>`;
  function render() {
    if(view==='rooms') {
      root.innerHTML='<div class="room-hub status-hub">'+[...ROOMS,{g:'WiFi',href:'wifi.html',ic:'🛜'}].map(r=>{const s=M.summary(r.g);return `<a class="room-link" href="${r.href}" data-room-summary="${esc(r.g)}"><b>${r.ic} ${esc(r.g)}</b><div class="room-counts">${M.statuses.map(([k,l])=>`<span class="status-${k}" data-count="${k}">${s.counts[k]} ${l}</span>`).join(' · ')}</div><strong>~${M.money(s.toGo)} to go</strong><small>${s.unpriced} unpriced · conditional items included</small></a>`;}).join('')+'</div><p><a href="list.html">Shopping · all rooms together →</a></p>';
    } else if(view==='decided') {
      const selected=inventory.filter(x=>active==='all'||M.status(x)===active);
      const focus=document.activeElement?.dataset.view;
      document.getElementById('views-switcher').innerHTML='<div class="view-segments" role="group" aria-label="Views">'+views.map(([key,label])=>`<button type="button" data-view="${key}" aria-pressed="${active===key}">${label} <span data-view-count="${key}">${inventory.filter(x=>key==='all'||M.status(x)===key).length}</span></button>`).join('')+'</div><p class="status-legend">How this works: Need → Considering → Decided → Bought. Need: still needed. Considering: weighing options. Decided: chosen, not yet bought. Bought: paid, owned or completed.</p>';
      const {total}=M.totals(selected);
      root.dataset.activeView=active;
      root.innerHTML=`<div class="view-total" role="status"><h2>${views.find(x=>x[0]===active)[1]} · ${selected.length} items</h2><strong data-view-total="${total}">${M.totalText(selected)}</strong><p>Known one-off prices; recommended estimates for unbought items. Services shown per month. Conditional items included; comparison alternatives count once per item.</p></div>`+[...new Set(selected.map(x=>x.room))].map(room=>`<section class="view-room" data-view-room="${esc(room)}"><h2>${esc(room)} · ${selected.filter(x=>x.room===room).length}</h2>${selected.filter(x=>x.room===room).map(card).join('')}</section>`).join('')+(selected.length?'':'<p class="status-empty">Nothing here yet.</p>')+'<details class="history"><summary>Budget and buying notes</summary><p>Budget to start: ~R27k, set 18 Oct. The old locked-in estimate was ~R48,919, or ~R27,808 without the fridge and washer. Those were historical estimates; the current view total uses today’s item statuses.</p><p>On every buy: pay by card, inspect before signing, and keep the box and receipt for the warranty. Appliance and furniture after-sales can be weak. LASA had no public reviews recorded; they offered 30-day returns.</p></details>';
      if(focus)document.querySelector(`[data-view="${focus}"]`)?.focus({preventScroll:true});
    } else root.innerHTML=M.statuses.map(([key,label])=>group(key,label,inventory.filter(x=>M.status(x)===key))).join('');
    window.DECIDE?.wire(root);
  }
  document.getElementById('views-switcher')?.addEventListener('click',e=>{
    const button=e.target.closest('[data-view]');if(!button)return;
    active=button.dataset.view;
    if(preferenceKey)try{localStorage.setItem(preferenceKey,active);}catch{}
    render();
  });
  // Preferences stay on this device and are scoped to the authenticated login.
  // The prefix deliberately excludes them from NEST's shared nest_* sync keys.
  async function init() {
    if(view==='decided')try {
      const response=await fetch('/api/me');
      if(response.ok) {
        const {username}=await response.json();preferenceKey='overview:view:'+username;
        const saved=localStorage.getItem(preferenceKey);if(!new URLSearchParams(location.search).has('view')&&views.some(([key])=>key===saved))active=saved;
      }
    }catch{}
    if(!views.some(([key])=>key===active))active='considering';
    render();root.dataset.viewsReady='true';
  }
  init();window.addEventListener('nest:sync',render);window.addEventListener('nest:choices',render);
})();
