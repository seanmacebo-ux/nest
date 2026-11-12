// The Nest — phone menu. On small screens the 12 tabs collapse behind a
// "☰ Menu" button that opens a grid of big tiles. Without JS (or on wide
// screens) the normal tab row is used, so nothing breaks if this fails.
(() => {
  const nav = document.querySelector('.nav'), inner = nav && nav.querySelector('.nav-in');
  if (!inner) return;
  const tabs = [...inner.querySelectorAll('a.tab')];
  if (!tabs.length) return;
  const ICON = { 'Plan': '🗺️', 'Tracker': '📈', 'Shopping': '🛒', 'Medical aid': '🩺', 'Cars': '🚗', 'Apartments': '🏡',
    'Furniture': '🛋️', 'Bedding': '🛏️', 'Kitchen': '🍳', 'WiFi': '🛜', 'Laptop': '💻', 'Decided': '✅' };

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
  tabs.forEach(t => {
    const a = document.createElement('a');
    a.href = t.getAttribute('href');
    a.className = 'navtile';
    const name = t.textContent.trim();
    a.innerHTML = '<span class="ni" aria-hidden="true">' + (ICON[name] || '•') + '</span><span>' + name + '</span>';
    if (t.hasAttribute('aria-current')) a.setAttribute('aria-current', 'page');
    panel.appendChild(a);
  });

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
