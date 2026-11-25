// The Nest — 🤔 Consider / ✕ Reject on any option (rooms, cars, places).
// Replaces the old ♡ Save, which only ever lived on one phone.
//
// How it works:
//   - Any element with data-dk="<unique key>" (and data-dl="<label>") is a card.
//     decide.js adds the two buttons into its .dec slot (or at the end).
//   - Tapping marks the card straight away on this phone (stored in localStorage)
//     and adds it to a "send" tray at the bottom of the screen.
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
    const s = state(el);
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
      if (!slot.children.length) slot.innerHTML = '<button type="button" data-dv="consider"></button><button type="button" data-dv="reject"></button>';
      paint(el);
    });
    tray();
  };

  // bottom tray: what's changed on this phone and not sent yet
  const bar = document.createElement('div'); bar.className = 'dectray'; bar.setAttribute('role', 'status');
  const tray = () => {
    const p = get(PEND), ks = Object.keys(p);
    if (!ks.length) { bar.classList.remove('on'); return; }
    const c = ks.filter(k => p[k].v === 'consider').length, r = ks.filter(k => p[k].v === 'reject').length, u = ks.length - c - r;
    bar.innerHTML = `<span>${[c ? '🤔 ' + c : '', r ? '✕ ' + r : '', u ? '↩︎ ' + u : ''].filter(Boolean).join(' · ')} <small>${APP ? 'saved for both of you' : 'only on this phone'}</small></span><button type="button" class="send">${APP ? 'Send to Claude →' : 'Send to The Nest →'}</button>`;
    bar.classList.add('on');
  };

  const send = () => {
    const p = get(PEND), ks = Object.keys(p); if (!ks.length) return;
    // The tray collects taps from every page, so label each line by the room
    // in its key ("Room|thing|option"), not by whichever page Send was tapped on.
    const page = document.title.replace(' · The Nest', '');
    const tag = { flat: 'Apartments', car: 'Cars', newcar: 'Cars' };
    const where = k => { const r = k.includes('|') ? k.split('|')[0] : ''; return r ? (tag[r] || r.replace(' + ', ' & ')) : page; };
    const lines = ['🗳 Our picks'];
    [['consider', '🤔 Consider:'], ['reject', '✕ Reject:'], ['', '↩︎ Undo:']].forEach(([v, head]) => {
      const mine = ks.filter(k => p[k].v === v); if (!mine.length) return;
      lines.push(head);
      [...new Set(mine.map(where))].forEach(w => {
        lines.push('  ' + w + ':', ...mine.filter(k => where(k) === w).map(k => '• ' + p[k].l));
      });
    });
    const text = lines.join('\n');
    if (APP) {
      // Straight into the Ask Claude inbox, so Claude writes the picks into the pages for good.
      const btn = bar.querySelector('.send'); if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      const fd = new FormData(); fd.append('text', text);
      NEST._fetch('/api/requests', { method: 'POST', body: fd }).then(r => {
        if (!r.ok) throw new Error();
        put(PEND, {}); bar.innerHTML = '<span>Sent ✓ <small>Claude will add these to the pages</small></span>';
        setTimeout(tray, 4000);
      }).catch(() => { if (btn) { btn.disabled = false; btn.textContent = 'Try again →'; } });
      return;
    }
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
    const p = get(PEND);
    if (v === (el.dataset.st || '')) delete p[k]; else p[k] = { v, l: el.dataset.dl || k };
    put(PEND, p);
    paint(el); tray();
  });

  document.addEventListener('DOMContentLoaded', () => { document.body.appendChild(bar); wire(); });
  // The other phone's choices arrive with each sync.
  window.addEventListener('nest:sync', () => wire());
  window.DECIDE = { wire };
})();
