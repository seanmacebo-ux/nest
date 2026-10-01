// The Nest — client-side interactivity (notes + saves + ticks).
//
// Storage is two-layer:
//   1. localStorage  — instant render + full offline use (always written first).
//   2. Supabase      — the SHARED source of truth, so your notes/saves/ticks
//                      sync between Sean's phone, Mishka's phone, and Babybean.
//
// If Supabase isn't configured or is unreachable, everything still works exactly
// like before (local-only). Cloud is additive and never blocks the UI.

// --- cloud config -----------------------------------------------------------
// Publishable (anon) key: safe to ship in a public site by design — Row Level
// Security decides what it can touch. Fill these two in and sync goes live.
const NEST_SB = {
  url: '',   // e.g. https://xxxx.supabase.co
  key: '',   // e.g. sb_publishable_....
  table: 'nest_kv',
};
const NEST_SB_ON = () => !!(NEST_SB.url && NEST_SB.key);

window.NEST = {
  _get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
  _set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },

  // --- Supabase REST helpers (plain fetch, no SDK) --------------------------
  _sbHeaders(extra) {
    return Object.assign({
      'apikey': NEST_SB.key,
      'Authorization': 'Bearer ' + NEST_SB.key,
      'Content-Type': 'application/json',
    }, extra || {});
  },
  _sbUpsert(k, v) {
    if (!NEST_SB_ON()) return;
    try {
      fetch(`${NEST_SB.url}/rest/v1/${NEST_SB.table}?on_conflict=k`, {
        method: 'POST',
        headers: this._sbHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({ k: k, v: v, updated_at: new Date().toISOString() }),
      }).catch(() => {});
    } catch (e) {}
  },
  _sbDelete(k) {
    if (!NEST_SB_ON()) return;
    try {
      fetch(`${NEST_SB.url}/rest/v1/${NEST_SB.table}?k=eq.${encodeURIComponent(k)}`, {
        method: 'DELETE', headers: this._sbHeaders(),
      }).catch(() => {});
    } catch (e) {}
  },
  async _sbFetchAll() {
    const r = await fetch(`${NEST_SB.url}/rest/v1/${NEST_SB.table}?select=k,v`, { headers: this._sbHeaders() });
    if (!r.ok) throw new Error('sb ' + r.status);
    return await r.json();
  },

  // --- saves ----------------------------------------------------------------
  saves(kind) { return this._get('nest_save_' + kind, []); },
  isSaved(kind, label) { return this.saves(kind).some(x => x.label === label); },
  toggleSave(kind, label, url) {
    const s = this.saves(kind);
    const i = s.findIndex(x => x.label === label);
    if (i >= 0) s.splice(i, 1); else s.push({ label: label, url: url || '' });
    this._set('nest_save_' + kind, s);
    this._sbUpsert('save:' + kind, JSON.stringify(s));
    return i < 0;
  },

  // --- ticks ----------------------------------------------------------------
  ticks() { return this._get('nest_ticks', {}); },
  isTicked(id) { return !!this.ticks()[id]; },
  toggleTick(id) {
    const t = this.ticks();
    if (t[id]) delete t[id]; else t[id] = 1;
    this._set('nest_ticks', t);
    this._sbUpsert('ticks', JSON.stringify(t));
    return !!t[id];
  },

  // --- notes ----------------------------------------------------------------
  notes() { return this._get('nest_notes', {}); },
  getNote(k) { return this.notes()[k] || ''; },
  setNote(k, v) {
    const n = this.notes();
    if (v && v.trim()) { n[k] = v; this._sbUpsert('note:' + k, v); }
    else { delete n[k]; this._sbDelete('note:' + k); }
    this._set('nest_notes', n);
  },

  // --- cloud sync: pull shared state down, repaint the page -----------------
  async _pull(seed) {
    if (!NEST_SB_ON()) return;
    let rows;
    try { rows = await this._sbFetchAll(); } catch (e) { return; } // offline: keep local

    const cloudNotes = {}, cloudTicks = {}, cloudSaves = {};
    let haveTicks = false;
    rows.forEach(row => {
      if (row.k.indexOf('note:') === 0) { if (row.v) cloudNotes[row.k.slice(5)] = row.v; }
      else if (row.k.indexOf('save:') === 0) { try { cloudSaves[row.k.slice(5)] = JSON.parse(row.v) || []; } catch (e) {} }
      else if (row.k === 'ticks') { try { Object.assign(cloudTicks, JSON.parse(row.v) || {}); haveTicks = true; } catch (e) {} }
    });

    // Notes: cloud wins per-key. On first run (seed), push any local-only notes
    // up so nothing already typed on this phone gets lost.
    const localNotes = this.notes();
    const mergedNotes = Object.assign({}, cloudNotes);
    if (seed) {
      Object.keys(localNotes).forEach(k => {
        if (!(k in cloudNotes) && localNotes[k] && localNotes[k].trim()) {
          mergedNotes[k] = localNotes[k];
          this._sbUpsert('note:' + k, localNotes[k]);
        }
      });
    }
    this._set('nest_notes', mergedNotes);

    // Ticks: cloud wins if present; else seed from local.
    if (haveTicks) this._set('nest_ticks', cloudTicks);
    else if (seed && Object.keys(this.ticks()).length) this._sbUpsert('ticks', JSON.stringify(this.ticks()));

    // Saves: cloud wins per-kind if present; else seed from local.
    Object.keys(cloudSaves).forEach(kind => this._set('nest_save_' + kind, cloudSaves[kind]));
    if (seed) {
      document.querySelectorAll('[data-save-kind]').forEach(btn => {
        const kind = btn.dataset.saveKind;
        if (!(kind in cloudSaves) && this.saves(kind).length) this._sbUpsert('save:' + kind, JSON.stringify(this.saves(kind)));
      });
    }

    this._repaint();
  },

  // Re-sync the on-screen widgets from storage without clobbering a field the
  // user is actively typing in.
  _repaint() {
    document.querySelectorAll('.notebox[data-note-key]').forEach(box => {
      if (document.activeElement === box) return;
      const v = this.getNote(box.dataset.noteKey);
      if (box.value === v) return;
      box.value = v;
      const wrap = box.closest('.notewrap');
      if (wrap && v.trim()) wrap.classList.add('open');
      const btn = wrap && wrap.querySelector('.notetoggle');
      if (btn) btn.textContent = v.trim() ? '💬 Notes ✓' : '💬 Notes';
    });
    document.querySelectorAll('[data-save-kind]').forEach(btn => {
      const on = this.isSaved(btn.dataset.saveKind, btn.dataset.saveLabel);
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.textContent = on ? '♥ Saved' : '♡ Save';
    });
    document.querySelectorAll('[data-tick]').forEach(el => el.classList.toggle('done', this.isTicked(el.dataset.tick)));
  },

  wire(root) {
    root = root || document;
    root.querySelectorAll('[data-save-kind]').forEach(btn => {
      if (btn._wired) return; btn._wired = 1;
      const kind = btn.dataset.saveKind, label = btn.dataset.saveLabel, url = btn.dataset.saveUrl || '';
      const paint = () => {
        const on = NEST.isSaved(kind, label);
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.textContent = on ? '♥ Saved' : '♡ Save';
      };
      paint();
      btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); NEST.toggleSave(kind, label, url); paint(); });
    });
    root.querySelectorAll('.notetoggle').forEach(btn => {
      if (btn._wired) return; btn._wired = 1;
      const wrap = btn.closest('.notewrap');
      const box = wrap && wrap.querySelector('.notebox');
      const label = () => { btn.textContent = (box && box.value.trim()) ? '💬 Notes ✓' : '💬 Notes'; };
      if (box && box.value.trim()) wrap.classList.add('open');
      label();
      btn.addEventListener('click', () => { wrap.classList.toggle('open'); if (box) box.focus(); });
      if (box) box.addEventListener('input', label);
    });
    root.querySelectorAll('.notebox[data-note-key]').forEach(box => {
      if (box._wired) return; box._wired = 1;
      box.value = NEST.getNote(box.dataset.noteKey);
      let t;
      box.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => NEST.setNote(box.dataset.noteKey, box.value), 300); });
    });
    root.querySelectorAll('[data-tick]').forEach(el => {
      if (el._wired) return; el._wired = 1;
      const id = el.dataset.tick;
      const paint = () => el.classList.toggle('done', NEST.isTicked(id));
      paint();
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.addEventListener('click', () => { NEST.toggleTick(id); paint(); });
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); NEST.toggleTick(id); paint(); } });
    });
  },
};

document.addEventListener('DOMContentLoaded', () => {
  window.NEST.wire();
  // First pull seeds the cloud from anything already on this phone, then keeps
  // it in sync. Refresh on tab-focus and every 20s so the other person's edits
  // show up without a manual reload.
  window.NEST._pull(true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) window.NEST._pull(false); });
  setInterval(() => { if (!document.hidden) window.NEST._pull(false); }, 20000);
});

// No service worker: tear down any old one + its caches so phones never serve a
// frozen copy. Cheap no-op once a phone is clean.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
}
if (window.caches && caches.keys) caches.keys().then(ks => ks.forEach(k => caches.delete(k))).catch(() => {});

// "Jump to" strip under the page header, built from the page's own headings so
// it stays right when content changes. Plus a back-to-top button on long pages.
function nestJump() {
  const wrap = document.querySelector('.wrap');
  const header = wrap && wrap.querySelector(':scope > header');
  if (!header) return;
  const clean = t => {
    t = t.replace(/^[^\p{L}\p{N}]+/u, '').split(/ [—–] | \(|:/)[0].trim();
    return t.length > 28 ? t.slice(0, 27).trim() + '…' : t;
  };
  // Long intro paragraph → first 3 lines + "Read more". Legend callout → tucked into a fold.
  const sub = header.querySelector('.sub');
  if (sub && sub.textContent.length > 240) {
    sub.classList.add('clamp');
    const more = document.createElement('button');
    more.type = 'button'; more.className = 'more-btn'; more.textContent = 'Read more';
    more.addEventListener('click', () => { const open = sub.classList.toggle('clamp'); more.textContent = open ? 'Read more' : 'Show less'; });
    sub.after(more);
  }
  header.querySelectorAll(':scope > .callout').forEach(c => {
    const d = document.createElement('details');
    d.className = 'fold';
    d.innerHTML = '<summary>How to read this page</summary><div class="fb"></div>';
    c.replaceWith(d);
    d.querySelector('.fb').appendChild(c);
  });

  const targets = [];
  wrap.querySelectorAll('.sec h2, .note > h4, .filterbar').forEach(el => {
    const isBar = el.classList.contains('filterbar');
    const anchor = isBar ? el : (el.closest('.sec') || el.closest('.note'));
    let label = 'Browse all';
    if (!isBar) { const h = el.cloneNode(true); h.querySelectorAll('span').forEach(x => x.remove()); label = clean(h.textContent); }
    if (anchor && label) targets.push({ anchor, label });
  });
  if (targets.length < 3) return;
  const strip = document.createElement('nav');
  strip.className = 'jump';
  strip.setAttribute('aria-label', 'Jump to');
  strip.innerHTML = '<span class="jl">Jump to</span>';
  targets.forEach((t, i) => {
    if (!t.anchor.id) t.anchor.id = 'j' + i;
    t.anchor.setAttribute('data-jump', '');
    const a = document.createElement('a');
    a.href = '#' + t.anchor.id;
    a.textContent = t.label;
    strip.appendChild(a);
  });
  header.after(strip);

  if (document.body.scrollHeight < window.innerHeight * 3) return;
  const top = document.createElement('button');
  top.type = 'button';
  top.className = 'totop';
  top.textContent = '↑ Top';
  top.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  document.body.appendChild(top);
  const onScroll = () => top.classList.toggle('show', window.scrollY > 900);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}
document.addEventListener('DOMContentLoaded', nestJump);
