(() => {
  // Product rendering and compare controls share the same status projection as the overviews.
  if (!document.body.dataset.room) return;
  const BOT = 'babybeanbot', SENT = 'nest_sent', ROOM = document.body.dataset.room;
  const APP = !/github\.io$/.test(location.hostname) && !!window.NEST;
  const tg = t => 'tg://resolve?domain=' + BOT + '&text=' + encodeURIComponent(t);
  const web = 'https://t.me/' + BOT;
  const copy = t => {
    try { const ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;opacity:0';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, t.length); document.execCommand('copy'); ta.remove(); } catch (e) {}
    try { navigator.clipboard && navigator.clipboard.writeText(t).catch(() => {}); } catch (e) {}
  };
  const toast = document.createElement('div'); toast.className = 'toast'; toast.setAttribute('role', 'status');
  document.body.appendChild(toast);
  let toastTimer;
  const showToast = text => {
    clearTimeout(toastTimer);
    if (APP) {
      toast.textContent = text; toast.classList.add('on');
      toastTimer = setTimeout(() => toast.classList.remove('on'), 5000);
      return;
    }
    toast.innerHTML = '<b>Opening Telegram…</b> If the message box is empty, it\'s copied: just paste and send.<q></q><div class="tb"><a href="' + web + '">Open Telegram</a><button type="button" data-tcopy>Copy again</button><button type="button" data-tclose>Close</button></div>';
    toast.querySelector('q').textContent = text;
    toast.querySelector('[data-tcopy]').onclick = e => { e.stopPropagation(); copy(text); e.target.textContent = 'Copied ✓'; };
    toast.querySelector('[data-tclose]').onclick = e => { e.stopPropagation(); toast.classList.remove('on'); };
    toast.classList.add('on');
  };
  const sent = () => { try { return JSON.parse(localStorage.getItem(SENT)) || {}; } catch (e) { return {}; } };
  const go = async (key, text, button) => {
    if (APP) {
      if (button.disabled) return false;
      const label = button.textContent;
      button.disabled = true; button.textContent = 'Sending…';
      try {
        const body = new FormData(); body.append('text', text);
        const response = await NEST._fetch('/api/requests', { method: 'POST', body });
        if (!response.ok) throw new Error('Could not send');
        showToast('Sent to The Nest. Claude will pick this up shortly.');
        return true;
      } catch {
        showToast('Could not send. Please try again when you are online.');
        return false;
      } finally { button.disabled = false; button.textContent = label; }
    }
    const s = sent(); s[key] = 1; localStorage.setItem(SENT, JSON.stringify(s));
    copy(text); showToast(text); window.location.href = tg(text);
    return true;
  };
  const esc = x => String(x == null ? '' : x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  const num = p => { const m = String(p).replace(/,/g,'').match(/\d+/); return m ? +m[0] : 0; };
  const fmt = n => 'R' + n.toLocaleString('en-ZA').replace(/\s/g, ',');
  const slug = t => t.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const short = t => t.split(/[,(]/)[0].trim();
  const pickOf = it => { const o = it.o || []; return o.find(x => x.pick) || (o.length === 1 ? o[0] : null); };
  const itemIcons = { 'Desk(s) for both of you': '🖥️', 'Dining table': '🍽️', 'Bedside tables': '🗄️' };
  const iconOf = it => itemIcons[it.name] || it.ic;
  const photoHTML = (it, o) => `<span class="product-photo${o && o.img ? ' has-photo' : ''}">
    <span class="photo-fallback" aria-hidden="true">${esc(iconOf(it))}</span>
    ${o && o.img ? `<img src="${esc(o.img)}" alt="${esc(o.n)}" loading="lazy" decoding="async" width="96" height="96">` : ''}</span>`;
  // Capture failed loads too, so a missing file gets the same quiet fallback.
  document.addEventListener('error', e => {
    if (e.target.matches && e.target.matches('.product-photo img')) {
      e.target.parentElement.classList.remove('has-photo'); e.target.remove();
    }
  }, true);
  // "ref" items show another room's list (e.g. the Weddell refills on Water). Same
  // keys as the source room, so Consider/Reject stays in sync; not added to this total.
  const src = [...NEED, ...MAYBE].flatMap(g => g.items.map(it => ({ it, room: g.g })));
  const deref = it => { const s = it.ref && src.find(x => x.it.name === it.ref); return s ? { ...it, o: s.it.o, room: s.room, srcName: s.it.name } : it; };
  const mine = list => list.filter(g => g.g === ROOM).flatMap(g => g.items).map(deref);
  const need = mine(NEED), maybe = mine(MAYBE);

  const optHTML = (it, o) => {
    const key = it.name + ' — ' + o.n, on = sent()[key];
    const imp = o.imp, d = imp ? num(o.p) - num(imp.p) : 0;
    return `<div class="opt ${o.pick ? 'pick' : ''}" data-dk="${esc((it.room || ROOM) + '|' + (it.srcName || it.name) + '|' + o.n)}" data-dl="${esc((it.srcName || it.name) + ': ' + o.n + ' (' + o.p + ', ' + o.s + ')')}" data-chosen="${!!it.fixedStatus&&o.pick===1}" data-st="${esc(o.st || '')}">
      <div class="opt-head">${photoHTML(it, o)}<div class="opt-info">
        ${o.t || o.pick ? `<div class="ot">${esc((o.t || '⭐ Recommended').replace(/Pick/g, 'Recommended').replace(/pick/g, 'recommendation'))}</div>` : ''}
        <div class="on">${esc(o.n)}</div>
        <div class="opr">${esc(o.p)}</div>
        <div class="ometa">${esc(o.s)}${o.c ? ' · checked ' + esc(o.c) : ''}</div>
      </div></div>
      ${imp ? `<div class="oimp">🌍 Import: ${esc(imp.p)} from ${esc(imp.s)} · ${esc(imp.d)} · <b class="${d > 0 ? 'good' : ''}">${esc((d > 0 ? 'saves ~' : 'costs ~') + fmt(Math.round(Math.abs(d) / 50) * 50) + (d > 0 ? '' : ' more'))}</b></div><details class="oimp-note"><summary>How we worked it out</summary>${esc(imp.n)}</details>` : ''}
      ${o.w ? `<p class="ow">${o.w}</p>` : ''}${o.f ? `<p class="of">⚠️ ${o.f}</p>` : ''}${o.yt ? `<p class="oyt">▶️ Reviews: ${o.yt.map(v => `<a href="${esc(v.u)}" target="_blank" rel="noopener">${esc(v.l)}</a>`).join(' · ')}</p>` : o.ytx ? `<p class="oyt">▶️ ${esc(o.ytx)}</p>` : ''}
      <div class="opt-actions"><div class="acts">${o.u ? `<a class="op" href="${esc(o.u)}" target="_blank" rel="noopener">Open ↗</a>` : ''}<button type="button" class="got ${on ? 'sent' : ''}" data-k="${esc(key)}" aria-label="Bought this: ${esc(o.n)}">${on ? '✓ Sent' : '🧾 Bought'}</button></div>
      <div class="dec"></div></div>
    </div>`;
  };
  const itemHTML = it => {
    const n = (it.o || []).length;
    const sub = [n ? n + ' option' + (n > 1 ? 's' : '') : '', it.price ? esc(it.price) : '', it.sub ? esc(it.sub) : ''].filter(Boolean).join(' · ');
    return `<article class="room-item" data-item="${esc(NEST_ITEMS.id(ROOM,it.name))}"><div class="sec" id="${slug(short(it.name))}"><h2>${iconOf(it)} ${esc(it.name)}</h2>
      <p>${sub ? `<span class="isub">${sub}</span>` : ''}${it.note ? ' ' + it.note : ''}${!n && !it.note ? ' No options yet. Tap 🔎 and I\'ll find some.' : ''}</p></div>
      ${n ? `<div class="opts">${it.o.map(o => optHTML(it, o)).join('')}</div>` : ''}
      <div class="iacts">${n > 1 ? `<button type="button" class="cmpb" data-cmp="${esc(it.name)}">⚖️ Compare side by side</button>` : ''}${n ? '' : `<button type="button" data-done="${esc(it.name)}">✓ Got it</button>`}<button type="button" data-more="${esc(it.srcName || it.name)}">🔎 More options</button><button type="button" data-skip="${esc(it.name)}">✕ Don't need it</button></div></article>`;
  };

  const roomItems = NEST_ITEMS.forRoom(ROOM);
  const needRoot = document.getElementById('need');
  document.getElementById('maybe-wrap').remove();
  document.getElementById('bought-sec').remove();
  document.getElementById('boughtlist').closest('.panel').remove();
  needRoot.innerHTML = need.concat(maybe).map(itemHTML).join('');
  for (const item of roomItems.filter(x=>x.boughtHTML)) {
    needRoot.insertAdjacentHTML('beforeend', `<article id="${slug(short(item.name))}" class="room-item panel" data-item="${esc(item.id)}"><ul class="bl">${item.boughtHTML}</ul></article>`);
  }
  const cards = [...needRoot.querySelectorAll('.room-item')];
  const groups = NEST_ITEMS.statuses.map(([key,label])=> {
    const group=document.createElement('section'); group.className='status-group'; group.dataset.status=key;
    group.innerHTML=`<h2 class="status-label status-${key}">${label} <span class="status-count"></span></h2><div class="status-items"></div><p class="status-empty">Nothing here yet.</p>`;
    needRoot.append(group); return group;
  });
  const jump=document.getElementById('jump');
  jump.setAttribute('aria-label','Filter by status');
  jump.innerHTML=[['all','All'],...NEST_ITEMS.statuses].map(([k,l])=>`<button type="button" data-filter="${k}" aria-pressed="${k==='all'}">${k==='all'?l:l.split(' ').slice(1).join(' ')}</button>`).join('');
  let filter='all';
  function regroup() {
    for (const card of cards) {
      const item=roomItems.find(x=>x.id===card.dataset.item), status=NEST_ITEMS.status(item);
      if(item.ref) { needRoot.append(card); card.dataset.reference='true'; }
      else groups.find(g=>g.dataset.status===status).querySelector('.status-items').append(card);
      let badge=card.querySelector(':scope > .item-status');
      if(!badge) { badge=document.createElement('div'); card.prepend(badge); }
      badge.className='item-status status-label status-'+status; badge.textContent=NEST_ITEMS.label(status)+(item.ref?' · reference only, counted in '+item.source.room:'');
      card.hidden=!!item.ref&&filter!=='all'&&filter!==status;
      const opts=card.querySelector('.opts');
      if(opts) {
        let rejected=card.querySelector('.rejected');
        if(!rejected) { rejected=document.createElement('details'); rejected.className='rejected'; rejected.innerHTML='<summary>Rejected</summary><div class="opts"></div>'; opts.after(rejected); }
        for(const opt of card.querySelectorAll('[data-dk]')) {
          const os=NEST_ITEMS.optionStatus(item,item.o.find(o=>NEST_ITEMS.optionKey(item,o)===opt.dataset.dk));
          (os==='reject'?rejected.querySelector('.opts'):opts).append(opt);
          let tag=opt.querySelector('.option-status');
          if(!tag) { tag=document.createElement('div'); opt.prepend(tag); }
          tag.className='option-status status-label status-'+os; tag.textContent=os==='reject'?'✕ Rejected':NEST_ITEMS.label(os);
        }
        const count=rejected.querySelectorAll('[data-dk]').length;
        rejected.querySelector('summary').textContent='Rejected · '+count; rejected.hidden=!count;
      }
    }
    for(const group of groups) {
      const count=group.querySelector('.status-items').children.length;
      group.querySelector('.status-count').textContent='· '+count;
      group.querySelector('.status-empty').hidden=!!count;
      group.hidden=filter!=='all' && filter!==group.dataset.status;
    }
    const summary=NEST_ITEMS.summary(ROOM);
    document.getElementById('hero').innerHTML=`<div class="lbl">${esc(ROOM)} · still to spend</div><div class="big">~${NEST_ITEMS.money(summary.toGo)} <small>to go</small></div><div class="bigsub">Estimate from recommended options. ${summary.unpriced} unpriced; conditional items included. ${NEST_ITEMS.money(summary.spent)} bought (known prices).</div>`;
  }
  jump.addEventListener('click',e=>{ const b=e.target.closest('[data-filter]'); if(!b)return;filter=b.dataset.filter;jump.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b));regroup(); });
  window.addEventListener('nest:choices',regroup); window.addEventListener('nest:sync',regroup);
  regroup();

  const box = document.getElementById('addtxt');
  document.querySelectorAll('.qchips button').forEach(c => c.addEventListener('click', () => { box.value = (box.value.trim() ? box.value.replace(/\s*$/, '') + '\n' : '') + c.dataset.q; box.focus(); }));
  const addsend = document.getElementById('addsend');
  if (APP) {
    addsend.textContent = 'Send to The Nest →';
    const sub = document.querySelector('header .sub');
    sub.textContent = sub.textContent.replace('then tap Send so I save it for both of you.', 'your choices save automatically for both of you.');
  }
  addsend.addEventListener('click', async () => {
    const t = box.value.trim(); if (!t) { box.focus(); return; }
    if (await go('add:' + t, '🛒 Add to ' + ROOM + ':\n' + t, addsend)) {
      if (APP && box.value.trim() === t) box.value = '';
    }
  });
  // ⚖️ compare: any item with 2+ options opens a side-by-side sheet (Sean, 16 Nov)
  const all = need.concat(maybe);
  const ov = document.createElement('div'); ov.className = 'cmp-ov'; ov.hidden = true;
  ov.innerHTML = '<div class="cmp-sheet" role="dialog" aria-modal="true" aria-labelledby="cmp-t"><div class="cmp-top"><b id="cmp-t"></b><button type="button" class="cmp-x" data-cmpclose aria-label="Close">✕</button></div><p class="cmp-hint">Tap to choose up to 3.</p><div class="pickrow" role="group" aria-label="Choose up to 3 products"></div><div class="cmp-body"></div></div>';
  document.body.appendChild(ov);
  let cIt = null, cSel = [], cFocus = null;
  const cTints = ['var(--accent)', 'var(--amber)', 'var(--good)'];
  const cSaved = () => { try { const s = JSON.parse(localStorage.getItem('nest_cmp_sel')); return s && typeof s === 'object' && !Array.isArray(s) ? s : {}; } catch (e) { return {}; } };
  const cSave = () => { try { localStorage.setItem('nest_cmp_sel', JSON.stringify({ ...cSaved(), [cIt.name]: cSel })); } catch (e) {} };
  const cRow = (label, sel, get) => {
    const cells = sel.map(get); if (!cells.some(v => v.h)) return '';
    return `<div class="crow2"><div class="rl">${esc(label)}</div><div class="cells">${cells.map((v, i) => `<div class="cell ${v.cls || ''}"><span class="who" style="--t:${cTints[i]}">${esc(short(sel[i].n))}</span><span class="val">${v.h || '—'}</span></div>`).join('')}</div></div>`;
  };
  const cRender = () => {
    const opts = cIt.o, pk = pickOf(cIt), sel = cSel.map(i => opts[i]);
    const picker = ov.querySelector('.pickrow'), left = picker.scrollLeft;
    picker.innerHTML = opts.map((o, i) => `<button type="button" data-ci="${i}" style="--t:${cTints[cSel.indexOf(i)] || cTints[0]}" aria-pressed="${cSel.includes(i)}">${o.pick ? '⭐ ' : ''}${esc(short(o.n))} · ${esc(o.p)}</button>`).join('');
    picker.scrollLeft = left;
    const prices = sel.map(o => num(o.p)), low = Math.min(...prices.filter(Boolean));
    const vs = o => { if (o === pk) return '⭐ Recommended'; if (!pk || !num(o.p)) return ''; const d = num(o.p) - num(pk.p); return d === 0 ? 'Same as recommended' : (d > 0 ? '+' : '−') + fmt(Math.abs(d)) + ' vs recommended'; };
    const txt = (s, cls) => ({ h: esc(s), cls });
    const row = (label, get) => cRow(label, sel, get);
    const group = (title, rows) => rows ? `<div class="cgrp"><div class="gt">${esc(title)}</div>${rows}</div>` : '';
    const modelItem=roomItems.find(x=>x.name===cIt.name);
    ov.querySelector('.cmp-body').style.setProperty('--n', sel.length);
    ov.querySelector('.cmp-body').innerHTML =
      `<div class="cmp-mini" style="--n:${sel.length}">${sel.map((o, i) => `<b style="--t:${cTints[i]}">${o.pick ? '⭐ ' : ''}${esc(short(o.n))}</b>`).join('')}</div>` +
      `<div class="chead" style="--n:${sel.length}">${sel.map((o, i) => `<div class="h" style="--t:${cTints[i]}">${photoHTML(cIt, o)}<div><small>${esc(o.s)}</small><b>${esc(o.n)}</b>${o.u ? `<a class="op" href="${esc(o.u)}" target="_blank" rel="noopener">Open ↗</a>` : ''}</div></div>`).join('')}</div>` +
      group('💰 Price', row('Price', o => txt(o.p, num(o.p) && num(o.p) === low ? 'best' : '')) +
        row('vs recommended', o => txt(vs(o))) +
        (sel.some(o => o.imp) ? row('Import (landed)', o => ({ h: o.imp ? esc(o.imp.p) + (o.imp.d ? '<br><small>' + esc(o.imp.d) + '</small>' : '') : '', cls: o.imp && num(o.imp.p) && num(o.imp.p) < num(o.p) ? 'best' : '' })) : '')) +
      group('🛒 Where to buy', row('Shop', o => txt((o.s || '') + (o.c ? ' · checked ' + o.c : ''))) +
        row('Status', o => { const status=NEST_ITEMS.optionStatus(modelItem,o); return txt(status==='reject'?'✕ Rejected':NEST_ITEMS.label(status),'status-'+status); })) +
      group('📋 What it is', row('Details', o => txt((o.n.match(/\(([^)]*)\)/) || [, ''])[1])) + row('In short', o => txt(o.t))) +
      group('👍 Why', row('Why', o => ({ h: o.w || '', cls: 'y' }))) +
      group('⚠️ Catch', sel.some(o => o.f) ? row('Catch', o => txt(o.f || 'None noted', o.f ? 'n' : '')) : '');
  };
  window.addEventListener('nest:sync',()=>{if(!ov.hidden)cRender();});
  const cOpen = name => {
    cIt = all.find(it => it.name === name); if (!cIt) return;
    const pi = cIt.o.findIndex(o => o.pick), saved = cSaved()[cIt.name];
    cSel = Array.isArray(saved) && saved.length > 0 && saved.length <= 3 && new Set(saved).size === saved.length && saved.every(i => Number.isInteger(i) && i >= 0 && i < cIt.o.length) ? saved :
      (pi >= 0 ? [pi] : []).concat(cIt.o.map((o, i) => i).filter(i => i !== pi)).slice(0, 3);
    cFocus = document.activeElement;
    ov.querySelector('#cmp-t').textContent = '⚖️ ' + short(cIt.name);
    cRender(); cSave(); ov.hidden = false; document.documentElement.classList.add('cmp-lock');
    ov.querySelector('.cmp-sheet').scrollTop = 0; ov.querySelector('.cmp-x').focus();
  };
  const cClose = () => { ov.hidden = true; document.documentElement.classList.remove('cmp-lock'); if (cFocus) cFocus.focus(); };
  ov.addEventListener('click', e => {
    if (e.target === ov || e.target.closest('[data-cmpclose]')) { cClose(); return; }
    const c = e.target.closest('[data-ci]'); if (!c) return;
    const i = +c.dataset.ci;
    if (cSel.includes(i)) { if (cSel.length > 1) cSel = cSel.filter(x => x !== i); }
    else { cSel = cSel.concat(i); if (cSel.length > 3) cSel.shift(); }
    cSave(); cRender(); ov.querySelector(`[data-ci="${i}"]`).focus({ preventScroll: true });
  });
  document.addEventListener('keydown', e => {
    if (ov.hidden) return;
    if (e.key === 'Escape') cClose();
    if (e.key === 'Tab') {
      const tabs = [...ov.querySelectorAll('button, a[href]')], first = tabs[0], last = tabs[tabs.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  document.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b || b.closest('.dec') || b.closest('.cmp-ov')) return;
    if (b.dataset.cmp) { cOpen(b.dataset.cmp); return; }
    if (b.dataset.k) {
      if (!APP) { b.classList.add('sent'); b.textContent = '✓ Sent'; }
      if (await go(b.dataset.k, '✅ Bought: ' + b.dataset.k, b)) { b.classList.add('sent'); b.textContent = '✓ Sent'; }
    }
    else if (b.dataset.done) go(b.dataset.done, '✅ Bought: ' + b.dataset.done, b);
    else if (b.dataset.more) go('more:' + b.dataset.more, '🔎 More options please: ' + b.dataset.more, b);
    else if (b.dataset.skip) go('skip:' + b.dataset.skip, "✕ Don't need: " + b.dataset.skip, b);
  });

  const nav = document.querySelector('.nav');
  const setNav = () => document.documentElement.style.setProperty('--navh', nav.offsetHeight + 'px');
  setNav(); window.addEventListener('resize', setNav);
  if (location.hash) { const t = document.getElementById(decodeURIComponent(location.hash.slice(1))); if(t) setTimeout(()=>t.scrollIntoView(),50); }
})();
