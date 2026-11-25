(() => {
  const M=NEST_ITEMS, inventory=M.items.filter(x=>!x.ref), view=document.body.dataset.overview, root=document.getElementById('overview');
  const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  document.getElementById('status-legend').innerHTML='<p class="status-legend">'+M.statuses.map(([k,l])=>`<span class="status-${k}">${l}</span>`).join(' · ')+'</p>';
  const href=it=>ROOMS.find(r=>r.g===it.room).href+'#'+M.slug(it.name);
  function card(it) {
    const status=M.status(it), pk=(it.o||[]).find(o=>o.pick), price=M.price(it);
    return `<article class="summary-item" data-item="${esc(it.id)}" data-status="${status}"><span class="status-label status-${status}">${M.label(status)}</span><a class="item-link" href="${esc(href(it))}"><b>${esc(it.name)}</b><small>${esc(it.room)} →</small></a>${it.boughtHTML?`<ul class="bl">${it.boughtHTML}</ul>`:`<p>${esc(it.sub||'')}${it.sub?' · ':''}${pk?'Recommended: '+esc(pk.n):'No recommendation yet'}</p><b>${price?M.money(price):'Not priced'}</b>`}${it.name==='Weddell Duo filter refills'?'<a class="item-link" href="water.html#shower-filter">Also shown in Water →</a>':''}${it.history?`<details class="history"><summary>Decision notes · ${esc(it.history.shop)}</summary><p>${it.history.html}</p><p>Price recorded then: ${esc(it.history.price)}. Current estimate is shown above.</p></details>`:''}</article>`;
  }
  const group=(key,title,items)=>`<section class="status-group" data-status="${key}"><h2 class="status-label status-${key}">${title} · ${items.length}</h2>${['decided','bought'].includes(key)?`<p class="group-total">${M.money(items.reduce((n,x)=>n+M.price(x),0))} ${key==='bought'?'bought (known prices)':'running total'}</p>`:''}${items.length?items.map(card).join(''):'<p class="status-empty">Nothing here yet.</p>'}</section>`;
  function render() {
    if(view==='rooms') {
      root.innerHTML='<div class="room-hub status-hub">'+ROOMS.map(r=>{const s=M.summary(r.g);return `<a class="room-link" href="${r.href}" data-room-summary="${esc(r.g)}"><b>${r.ic} ${esc(r.g)}</b><div class="room-counts">${M.statuses.map(([k,l])=>`<span class="status-${k}" data-count="${k}">${s.counts[k]} ${l}</span>`).join(' · ')}</div><strong>~${M.money(s.toGo)} to go</strong><small>${s.unpriced} unpriced · conditional items included</small></a>`;}).join('')+'</div><a class="room-link service-link" href="wifi.html">🛜 WiFi · service plan and setup →</a><p><a href="list.html">Shopping · all rooms together →</a></p>';
    } else if(view==='decided') {
      root.innerHTML=group('decided',M.label('decided'),inventory.filter(x=>M.status(x)==='decided'))+group('bought',M.label('bought'),inventory.filter(x=>M.status(x)==='bought'))+'<section class="still-open"><h2>Still open</h2><p>🔎 Need: still looking. 🤔 Considering: marked Consider. The bed frame size is still open: the old Timeless Queen choice does not fit the Queen XL mattress.</p>'+inventory.filter(x=>['need','considering'].includes(M.status(x))).map(card).join('')+'</section><details class="history"><summary>Budget and buying notes</summary><p>Budget to start: ~R27k, set 18 Oct. The old locked-in estimate was ~R48,919, or ~R27,808 without the fridge and washer. Those were historical estimates; the current totals above separate choices from purchases.</p><p>On every buy: pay by card, inspect before signing, and keep the box and receipt for the warranty. Appliance and furniture after-sales can be weak. LASA had no public reviews recorded; they offered 30-day returns.</p></details>';
    } else root.innerHTML=M.statuses.map(([key,label])=>group(key,label,inventory.filter(x=>M.status(x)===key))).join('');
  }
  render();window.addEventListener('nest:sync',render);window.addEventListener('nest:choices',render);
})();
