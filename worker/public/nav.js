// The Nest — phone menu. On small screens the tabs collapse behind a
// "☰ Menu" button that opens grouped links. Without JS (or on wide
// screens) the normal tab row is used, so nothing breaks if this fails.
(() => {
  const nav = document.querySelector('.nav'), inner = nav && nav.querySelector('.nav-in');
  if (!inner) return;
  for (const [href, label] of [['skin.html', 'Skin'], ['ask.html', 'Ask Claude'], ['/logout', 'Log out']]) {
    if (inner.querySelector(`a[href="${href}"]`)) continue;
    const a = document.createElement('a'); a.href = href; a.className = 'tab'; a.textContent = label;
    if (href.replace(/\.html$/, '') === location.pathname.split('/').pop().replace(/\.html$/, '')) a.setAttribute('aria-current', 'page');
    inner.appendChild(a);
  }
  const tabs = [...inner.querySelectorAll('a.tab')];
  if (!tabs.length) return;
  // A phone can hold an old cached style.css: without the menu styling, keep the plain tab bar.
  if (getComputedStyle(document.documentElement).getPropertyValue('--nav-v').trim() !== '3') return;
  const ICON = { 'Skin': '🧴', 'Ask Claude': '💬', 'Log out': '↗', 'Plan': '🗺️', 'Tracker': '📈', 'Lounge': '🛋️', 'Bedroom': '🛏️', 'Bathroom': '🛁', 'Water': '💧', 'Kitchen': '🍳', 'Office': '💻', 'Medical aid': '🩺', 'Cars': '🚗', 'Apartments': '🏡',
    'Furniture': '🛋️', 'Bedding': '🛏️', 'Kitchen': '🍳', 'WiFi': '🛜', 'Post-pregnancy': '💛', 'Laptop': '💻', 'Decided': '✅', 'Findings': '🧾' };

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'menubtn';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'navpanel');
  btn.innerHTML = '<span aria-hidden="true">☰</span> Menu';

  const panel = document.createElement('div');
  panel.className = 'navpanel';
  panel.id = 'navpanel';
  panel.hidden = true;
  const tile = t => {
    const a = document.createElement('a');
    a.href = t.getAttribute('href');
    a.className = 'navtile';
    const name = t.textContent.trim();
    a.innerHTML = '<span class="ni" aria-hidden="true">' + (ICON[name] || '•') + '</span><span>' + name + '</span>';
    if (t.hasAttribute('aria-current')) a.setAttribute('aria-current', 'page');
    return a;
  };
  const groups = [
    ['Us', ['Plan', 'Tracker', 'Decided', 'Findings']],
    ['The flat', ['Lounge', 'Bedroom', 'Kitchen', 'Bathroom', 'Office', 'Water', 'WiFi']],
    ['Life', ['Medical aid', 'Skin', 'Cars', 'Apartments', 'Post-pregnancy']]
  ];
  const remaining = new Map(tabs.map(t => [t.textContent.trim(), t]));
  groups.forEach(([label, names], i) => {
    const section = document.createElement('section');
    const heading = document.createElement('h2');
    heading.id = 'navgroup-' + i;
    heading.textContent = label;
    section.className = 'navgroup';
    section.setAttribute('aria-labelledby', heading.id);
    section.appendChild(heading);
    const links = document.createElement('div');
    links.className = 'navlinks';
    names.forEach(name => {
      if (!remaining.has(name)) return;
      links.appendChild(tile(remaining.get(name)));
      remaining.delete(name);
    });
    section.appendChild(links);
    panel.appendChild(section);
  });
  const actions = document.createElement('div');
  actions.className = 'navactions';
  ['Ask Claude', 'Log out'].forEach(name => {
    if (!remaining.has(name)) return;
    const a = tile(remaining.get(name));
    a.classList.add(name === 'Ask Claude' ? 'navask' : 'navlogout');
    actions.appendChild(a);
    remaining.delete(name);
  });
  // Keep any page-specific tabs available too.
  remaining.forEach(t => panel.appendChild(tile(t)));
  panel.appendChild(actions);

  inner.querySelector('.brandmark').after(btn);
  nav.appendChild(panel);
  nav.classList.add('js-menu');

  const set = open => {
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    nav.classList.toggle('open', open);
  };
  btn.addEventListener('click', e => { e.stopPropagation(); set(panel.hidden); });
  document.addEventListener('click', e => { if (!panel.hidden && !nav.contains(e.target)) set(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { set(false); btn.focus(); } });
  window.addEventListener('resize', () => { if (window.innerWidth > 700) set(false); });
})();
