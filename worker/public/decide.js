// The Nest — 🤔 Consider / ✕ Reject on any option (rooms, cars, places).
// Replaces the old ♡ Save, which only ever lived on one phone.
//
// How it works:
//   - Any element with data-dk="<unique key>" (and data-dl="<label>") is a card.
//     decide.js adds the two buttons into its .dec slot (or at the end).
//   - Tapping marks the card straight away on this phone (stored in localStorage)
//     and syncs automatically in the private app. The public copy adds it
//     to a "send" tray at the bottom of the screen.
//   - "Send to The Nest" opens Telegram with ONE message listing every change,
//     so The Nest writes them into the page data (data-st="consider|reject")
//     and both phones see the same thing.
// Rejected cards fade and sink to the bottom of their list (CSS order).
(() => {
  const KEY = 'nest_decide', PEND = 'nest_decide_pending', BOT = 'babybeanbot';
  // In the private app (not the GitHub Pages copy), choices go through NEST so both phones share them.
  const APP = !/github\.io$/.test(location.hostname) && !!window.NEST;
  const get = k => { if (APP) { const v = NEST._get(k, {}); return v && typeof v === 'object' ? v : {}; } try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } };
  const put = (k, v) => { if (APP) { NEST._set(k, v); return; } try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const state = el => get(KEY)[el.dataset.dk] ?? el.dataset.st ?? '';

  const paint = el => {
    const s = el.dataset.chosen === 'true' ? 'decided' : state(el);
    el.classList.toggle('is-consider', s === 'consider');
    el.classList.toggle('is-reject', s === 'reject');
    el.querySelectorAll('.dec button').forEach(b => {
      const on = b.dataset.dv === s;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.textContent = b.dataset.dv === 'consider' ? (on ? '🤔 Considering' : '🤔 Consider') : (on ? '✕ Rejected · undo' : '✕ Reject');
    });
  };

  const wire = (root) => {
    (root || document).querySelectorAll('[data-dk]').forEach(el => {
      if (!el.querySelector('.dec')) {
        const d = document.createElement('div'); d.className = 'dec'; el.appendChild(d);
      }
      const slot = el.querySelector('.dec');
      if (el.dataset.chosen === 'true') { slot.textContent = 'Chosen · not yet bought'; paint(el); return; }
      if (!slot.children.length) slot.innerHTML = '<button type="button" data-dv="consider"></button><button type="button" data-dv="reject"></button>';
      paint(el);
    });
    tray();
  };

  // bottom tray: what's changed on this phone and not sent yet
  const bar = document.createElement('div'); bar.className = 'dectray'; bar.setAttribute('role', 'status');
  const tray = () => {
    if (APP) return;
    const p = get(PEND), ks = Object.keys(p);
    if (!ks.length) { bar.classList.remove('on'); return; }
    const c = ks.filter(k => p[k].v === 'consider').length, r = ks.filter(k => p[k].v === 'reject').length, u = ks.length - c - r;
    bar.innerHTML = `<span>${[c ? '🤔 ' + c : '', r ? '✕ ' + r : '', u ? '↩︎ ' + u : ''].filter(Boolean).join(' · ')} <small>only on this phone</small></span><button type="button" class="send">Send to The Nest →</button>`;
    bar.classList.add('on');
  };

  const send = () => {
    if (APP) return;
    const p = get(PEND), ks = Object.keys(p); if (!ks.length) return;
    // The tray collects taps from every page, so label each line by the room
    // in its key ("Room|thing|option"), not by whichever page Send was tapped on.
    const page = document.title.replace(' · The Nest', '');
    const tag = { flat: 'Apartments', car: 'Cars', newcar: 'Cars' };
    const where = k => { const r = k.includes('|') ? k.split('|')[0] : ''; return r ? (tag[r] || r.replace(' + ', ' & ')) : page; };
    const lines = ['🗳 Our choices'];
    [['consider', '🤔 Consider:'], ['reject', '✕ Reject:'], ['', '↩︎ Undo:']].forEach(([v, head]) => {
      const mine = ks.filter(k => p[k].v === v); if (!mine.length) return;
      lines.push(head);
      [...new Set(mine.map(where))].forEach(w => {
        lines.push('  ' + w + ':', ...mine.filter(k => where(k) === w).map(k => '• ' + p[k].l));
      });
    });
    const text = lines.join('\n');
    try { navigator.clipboard && navigator.clipboard.writeText(text).catch(() => {}); } catch (e) {}
    put(PEND, {}); tray();
    window.location.href = 'tg://resolve?domain=' + BOT + '&text=' + encodeURIComponent(text);
  };

  document.addEventListener('click', e => {
    if (e.target.closest('.dectray .send')) { send(); return; }
    const b = e.target.closest('.dec button'); if (!b) return;
    const el = b.closest('[data-dk]'); if (!el) return;
    e.preventDefault(); e.stopPropagation();
    const k = el.dataset.dk, cur = state(el), v = cur === b.dataset.dv ? '' : b.dataset.dv;
    const all = get(KEY); all[k] = v; put(KEY, all);
    if (!APP) {
      const p = get(PEND);
      if (v === (el.dataset.st || '')) delete p[k]; else p[k] = { v, l: el.dataset.dl || k };
      put(PEND, p);
    }
    paint(el); tray(); window.dispatchEvent(new Event('nest:choices'));
  });

  document.addEventListener('DOMContentLoaded', () => { if (!APP) document.body.appendChild(bar); wire(); });
  // The other phone's choices arrive with each sync.
  window.addEventListener('nest:sync', () => wire());
  window.DECIDE = { wire };
})();
