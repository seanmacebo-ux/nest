// Shared app shell. Only this branch is deployed to the private Worker.
(() => {
  const top = document.querySelector('.nav');
  if (!top) return;
  const app = !/github\.io$/.test(location.hostname);
  const current = location.pathname.split('/').pop().replace(/\.html$/, '') || 'index';
  const rooms = ['lounge', 'bedroom', 'kitchen', 'bathroom', 'office', 'water', 'wifi'];
  const titles = {index:'Home', rooms:'Rooms', decided:'Picks', ask:'Ask Claude', tracker:'Tracker', findings:'Findings', medical:'Medical aid', skin:'Skin', cars:'Cars', apartments:'Apartments', recovery:'Post-pregnancy', plans:'Medical plans', ...Object.fromEntries(rooms.map(x=>[x,x==='wifi'?'WiFi':x[0].toUpperCase()+x.slice(1)]))};
  top.className = 'nav app-topbar';
  top.innerHTML = '<div class="nav-in">' + (titles[current] || 'The Nest') + '</div>';
  const active = current === 'index' ? 'Home' : rooms.includes(current) || current === 'rooms' ? 'Rooms' : current === 'decided' ? 'Picks' : current === 'ask' ? 'Ask' : 'More';
  const icons = {
    Home:'<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3z"/>',
    Rooms:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    Picks:'<path d="m5 12 4 4L19 6"/>', Ask:'<path d="M21 11a8 8 0 0 1-8 8H7l-4 3V11a9 9 0 0 1 18 0Z"/>',
    More:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
  };
  const bar = document.createElement('nav'); bar.className = 'bottom-bar'; bar.setAttribute('aria-label','Primary');
  for (const [label,href] of [['Home','index.html'],['Rooms','rooms.html'],['Picks','decided.html'],...(app ? [['Ask','ask.html']] : []),['More',null]]) {
    const el = document.createElement(href ? 'a' : 'button');
    if (href) el.href = href; else {el.type='button'; el.setAttribute('aria-haspopup','dialog'); el.setAttribute('aria-controls','more-sheet'); el.setAttribute('aria-expanded','false');}
    el.className='bottom-tab';
    el.dataset.tone = {Home:'primary',Rooms:'shopping',Picks:'picks',Ask:'primary',More:'primary'}[label];
    el.innerHTML='<span class="tab-icon"><svg viewBox="0 0 24 24" aria-hidden="true">'+icons[label]+'</svg></span><span>'+label+'</span>';
    if (active===label) { el.classList.add('active'); if(href) el.setAttribute('aria-current','page'); }
    bar.append(el);
  }
  document.body.append(bar);
  const more = bar.querySelector('button');
  const sheet = document.createElement('dialog'); sheet.id='more-sheet'; sheet.className='more-sheet'; sheet.setAttribute('aria-labelledby','more-title');
  sheet.innerHTML='<div class="sheet-head"><button class="sheet-handle" type="button" aria-label="Close More"><span></span></button><div class="sheet-title"><h2 id="more-title">More</h2><button class="sheet-close" type="button" aria-label="Close More">✕</button></div></div><div class="sheet-scroll"></div>';
  const scroll = sheet.querySelector('.sheet-scroll');
  for(const [group,links] of [['Us',[['index','Plan'],['tracker','Tracker'],['findings','Findings']]],['Life',[['medical','Medical aid'],...(app ? [['skin','Skin']] : []),['cars','Cars'],['apartments','Apartments'],['recovery','Post-pregnancy']]]]) {
    const section=document.createElement('section'); section.className='navgroup';
    section.innerHTML='<h3>'+group+'</h3><div class="navlinks">'+links.map(([path,label])=>'<a class="navtile" href="'+path+'.html"'+(path===current?' aria-current="page"':'')+'>'+label+'</a>').join('')+'</div>';
    scroll.append(section);
  }
  if(app) scroll.insertAdjacentHTML('beforeend','<a class="navlogout" href="/logout">Log out</a>');
  document.body.append(sheet);
  let pushed=false, startY=null;
  const finish=()=>{sheet.close();document.documentElement.classList.remove('sheet-lock');more.setAttribute('aria-expanded','false');more.focus();};
  const close=()=>{if(!sheet.open)return;const back=pushed;pushed=false;finish();if(back)history.back();};
  more.onclick=()=>{history.pushState({...history.state,nestMore:true},'');pushed=true;scroll.scrollTop=0;sheet.showModal();document.documentElement.classList.add('sheet-lock');more.setAttribute('aria-expanded','true');};
  window.addEventListener('popstate',()=>{pushed=false;if(sheet.open)finish();});
  sheet.addEventListener('cancel',e=>{e.preventDefault();close();});
  sheet.addEventListener('keydown',e=>{
    if(e.key!=='Tab')return;
    const targets=[...sheet.querySelectorAll('button, a[href]')];
    const first=targets[0], last=targets[targets.length-1];
    if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
  });
  sheet.querySelectorAll('button').forEach(b=>b.onclick=close);
  sheet.addEventListener('click',e=>{if(e.target!==sheet)return;const r=sheet.getBoundingClientRect();if(e.clientY<r.top||e.clientX<r.left||e.clientX>r.right)close();});
  // Swipe the handle; scrolling the menu never starts a dismiss gesture.
  const handle=sheet.querySelector('.sheet-handle');
  handle.addEventListener('pointerdown',e=>{startY=e.clientY;handle.setPointerCapture(e.pointerId);});
  handle.addEventListener('pointerup',e=>{if(startY!==null && e.clientY-startY>60)close();startY=null;});
  handle.addEventListener('pointercancel',()=>{startY=null;});
})();
