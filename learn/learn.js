// Nest Learn: ✓ Done on resources, checkboxes on "What we do", progress bars, filter chips, jump-bar highlight.
// Progress lives on this phone (localStorage).
(() => {
  const KEY = 'learn_done';
  const get = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const put = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };

  // resources
  const paintRc = rc => {
    const on = !!get()[rc.dataset.rk];
    rc.classList.toggle('is-done', on);
    const b = rc.querySelector('.done');
    b.textContent = on ? '✓ Done · undo' : '✓ Done';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  };
  document.querySelectorAll('.rc').forEach(rc => {
    paintRc(rc);
    rc.querySelector('.done').addEventListener('click', () => {
      const d = get(); d[rc.dataset.rk] ? delete d[rc.dataset.rk] : (d[rc.dataset.rk] = 1); put(d); paintRc(rc); progress();
    });
  });

  // checklist
  document.querySelectorAll('input[data-ck]').forEach(i => {
    i.checked = !!get()[i.dataset.ck];
    i.addEventListener('change', () => { const d = get(); i.checked ? (d[i.dataset.ck] = 1) : delete d[i.dataset.ck]; put(d); progress(); });
  });

  // progress: counts done items per track; totals come from TOTALS (home) or the page itself
  const progress = () => {
    const d = get();
    document.querySelectorAll('.tprog').forEach(p => {
      const t = p.dataset.track;
      const total = window.LEARN_TOTALS ? window.LEARN_TOTALS[t] : document.querySelectorAll('.rc, input[data-ck]').length;
      const done = Object.keys(d).filter(k => k.startsWith(t + ':')).length;
      const pc = total ? Math.round(100 * Math.min(done, total) / total) : 0;
      p.querySelector('.bar span').style.width = pc + '%';
      p.querySelector('.pc').textContent = done ? `${Math.min(done, total)} of ${total} done` : `${total} things to read, watch or do`;
    });
  };
  progress();

  // filter chips
  const chips = [...document.querySelectorAll('.filt .chip')];
  chips.forEach(c => c.addEventListener('click', () => {
    chips.forEach(x => x.setAttribute('aria-pressed', x === c ? 'true' : 'false'));
    document.querySelectorAll('.rc').forEach(rc => { rc.hidden = c.dataset.f !== 'all' && rc.dataset.type !== c.dataset.f; });
  }));

  // jump bar highlight
  const links = [...document.querySelectorAll('.jump a')];
  if (links.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(en => {
      if (en.isIntersecting) links.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + en.target.id));
    }), { rootMargin: '-40% 0px -55% 0px' });
    links.forEach(a => { const s = document.querySelector(a.getAttribute('href')); if (s) io.observe(s); });
  }
})();

// "Add a find": pick track + type, paste link, send to Babybean on Telegram
(() => {
  document.querySelectorAll('.addbox').forEach(box => {
    box.querySelectorAll('.qchips').forEach(g => g.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      const on = b.getAttribute('aria-pressed') !== 'true';
      g.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }));
    box.querySelector('.sendbtn').addEventListener('click', () => {
      const ta = box.querySelector('textarea'), txt = ta.value.trim();
      if (!txt) { ta.focus(); ta.placeholder = 'Paste a link or a name first 🙂'; return; }
      const t = box.dataset.track || (box.querySelector('.tpick [aria-pressed="true"]') || {}).dataset?.t || 'Not sure which track';
      const kb = box.querySelector('.kpick [aria-pressed="true"]');
      const kind = kb ? kb.textContent.trim() : '';
      const msg = `📖 Nest Learn find\nTrack: ${t}${kind ? '\nType: ' + kind : ''}\n${txt}\n\nBreak it down and add it to Nest Learn please.`;
      try { navigator.clipboard && navigator.clipboard.writeText(msg).catch(() => {}); } catch (e) {}
      window.location.href = 'tg://resolve?domain=babybeanbot&text=' + encodeURIComponent(msg);
    });
  });
})();
