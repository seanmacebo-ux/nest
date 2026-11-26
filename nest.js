// The Nest — instant local saves, shared same-origin state and a durable outbox.
// A static GitHub Pages copy keeps working when /api/kv is unavailable.
window.NEST = {
  _rows: {}, _ready: false, _busy: false, _pulling: false, _reachable: false,
  _get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } },
  _raw(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  _out() { return this._get('nest_sync_outbox', {}); },
  _snapshot() {
    const result = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k.startsWith('nest_') || k.startsWith('nest_sync_')) continue;
      if (k === 'nest_notes') Object.entries(this.notes()).forEach(([n,v]) => result['note:' + n] = v);
      else if (k === 'nest_ticks') result.ticks = JSON.stringify(this.ticks());
      else if (k.startsWith('nest_save_')) result['save:' + k.slice(10)] = JSON.stringify(this._get(k, []));
      else result['local:' + k] = JSON.stringify(this._get(k, null));
    }
    return result;
  },
  _set(k, v) {
    const before = this._snapshot();
    this._raw(k, v);
    const after = this._snapshot();
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const value = after[key] ?? '';
      if (value !== before[key]) this._queue(key, value, before[key]);
    }
  },
  _queue(k, v, fallback) {
    const out = this._out(), previous = out[k];
    out[k] = { v, base: previous ? previous.base : (this._rows[k]?.v ?? fallback ?? null), rev: previous ? previous.rev : (this._rows[k]?.rev ?? 0), id: crypto.randomUUID() };
    this._raw('nest_sync_outbox', out);
    this._chip();
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._flush(), 450);
  },
  _apply(k, v) {
    if (k.startsWith('note:')) { const notes = this.notes(); if (v) notes[k.slice(5)] = v; else delete notes[k.slice(5)]; this._raw('nest_notes', notes); }
    else {
      try {
        const value = JSON.parse(v);
        if (k === 'ticks') this._raw('nest_ticks', value);
        else if (k.startsWith('save:')) this._raw('nest_save_' + k.slice(5), value);
        else if (k.startsWith('local:nest_') && !k.startsWith('local:nest_sync_')) this._raw(k.slice(6), value);
      } catch {}
    }
  },
  async _fetch(path, options) {
    const response = await fetch(path, { cache: 'no-store', ...options });
    if (response.status === 401) { location.assign('/login?next=' + encodeURIComponent(location.pathname + location.search)); throw new Error('Login required'); }
    return response;
  },
  _chip() {
    const el = document.getElementById('nest-sync-status');
    if (el) el.textContent = Object.keys(this._out()).length ? 'Not synced yet' : this._reachable ? 'Synced' : 'Saved on this phone';
  },
  // Apply only this phone's changes to the current server value after a conflict.
  // Missing object properties represent removals, including unticked tasks.
  _merge(k, base, mine, theirs) {
    if (mine === base) return theirs;
    if (k.startsWith('note:')) return mine;
    try {
      const b = base == null ? null : JSON.parse(base), m = JSON.parse(mine), t = JSON.parse(theirs);
      const object = x => x && typeof x === 'object' && !Array.isArray(x);
      const patch = (before, local, remote) => {
        if (JSON.stringify(before) === JSON.stringify(local)) return remote;
        if (!object(local)) return local;
        const result = object(remote) ? {...remote} : {};
        for (const key of new Set([...Object.keys(before || {}), ...Object.keys(local)])) {
          if (!Object.hasOwn(local, key)) delete result[key];
          else result[key] = patch(before?.[key], local[key], remote?.[key]);
        }
        return result;
      };
      if (Array.isArray(m) && Array.isArray(t) && (k.startsWith('save:') || k.startsWith('local:nest_todos_') || k === 'local:nest_milestones')) {
        const identity = x => k.startsWith('save:') ? x.label : x.id;
        const before = new Map((b || []).map(x => [identity(x), x]));
        const local = new Map(m.map(x => [identity(x), x]));
        const result = new Map(t.map(x => [identity(x), x]));
        for (const label of before.keys()) if (!local.has(label)) result.delete(label);
        for (const [label, value] of local) if (JSON.stringify(before.get(label)) !== JSON.stringify(value)) result.set(label, value);
        return JSON.stringify([...result.values()]);
      }
      return JSON.stringify(patch(b, m, t));
    } catch { return mine; }
  },
  async _flush() {
    if (!this._ready || this._busy || this._pulling) return;
    this._busy = true;
    try {
      for (const [k, entry] of Object.entries(this._out())) {
        const response = await this._fetch('/api/kv/' + encodeURIComponent(k), { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({v: entry.v, rev: entry.rev}) });
        const data = await response.json();
        const out = this._out();
        if (response.status === 409) {
          this._rows[k] = data.current;
          // A keystroke may have updated the outbox while the request was in flight.
          const pending = out[k];
          if (pending) {
            pending.v = this._merge(k, pending.base, pending.v, data.current?.v ?? 'null');
            pending.base = data.current?.v ?? null; pending.rev = data.current?.rev ?? 0;
            this._apply(k, pending.v);
          }
        } else {
          if (!response.ok) throw new Error('Save failed');
          this._rows[k] = data;
          if (out[k]?.id === entry.id) delete out[k];
          else if (out[k]) { out[k].base = entry.v; out[k].rev = data.rev; }
        }
        this._raw('nest_sync_outbox', out);
      }
      this._reachable = true;
      this._repaint();
      window.dispatchEvent(new Event('nest:sync'));
    } catch { this._reachable = false; }
    finally {
      this._busy = false; this._chip();
      if (Object.keys(this._out()).length) { clearTimeout(this._timer); this._timer = setTimeout(() => this._flush(), 5000); }
    }
  },
  async _pull() {
    if (this._pulling || this._busy) return;
    this._pulling = true;
    try {
      const response = await this._fetch('/api/kv');
      if (!response.ok) throw new Error('Offline');
      const {rows} = await response.json();
      if (!Array.isArray(rows)) throw new Error('Not the Nest API');
      this._rows = Object.fromEntries(rows.map(r => [r.k, r]));
      const local = this._snapshot(), out = this._out();
      const migration = !this._get('nest_sync_migrated', false);
      if (migration && !this._get('nest_sync_migration_backup', null)) this._raw('nest_sync_migration_backup', local);
      for (const [k, v] of Object.entries(local)) {
        if (out[k]) continue;
        if (!this._rows[k]) this._queue(k, v, null);
        else if (migration && (k === 'ticks' || k.startsWith('save:'))) {
          // Only the first migration unions old phone picks. Later pulls must
          // respect removals rather than resurrecting another phone's unticks.
          const cloud = this._rows[k].v;
          const merged = k === 'ticks' ? JSON.stringify({...JSON.parse(v), ...JSON.parse(cloud)}) : JSON.stringify([...new Map([...JSON.parse(v), ...JSON.parse(cloud)].map(x => [x.label,x])).values()]);
          if (merged !== cloud) this._queue(k, merged, cloud);
        }
      }
      const pending = this._out();
      rows.forEach(r => { if (!pending[r.k]) this._apply(r.k, r.v); });
      Object.entries(pending).forEach(([k, e]) => this._apply(k, e.v));
      this._raw('nest_sync_migrated', true);
      this._ready = true; this._reachable = true;
      this._repaint(); window.dispatchEvent(new Event('nest:sync'));
    } catch { this._reachable = false; }
    finally { this._pulling = false; this._chip(); }
    this._flush();
  },
  saves(kind) { return this._get('nest_save_' + kind, []); },
  isSaved(kind, label) { return this.saves(kind).some(x => x.label === label); },
  toggleSave(kind, label, url) {
    const saves = this.saves(kind), i = saves.findIndex(x => x.label === label);
    if (i >= 0) saves.splice(i, 1); else saves.push({label, url: url || ''});
    this._set('nest_save_' + kind, saves); return i < 0;
  },
  ticks() { return this._get('nest_ticks', {}); },
  isTicked(id) { return !!this.ticks()[id]; },
  toggleTick(id) {
    const ticks = this.ticks(); if (ticks[id]) delete ticks[id]; else ticks[id] = 1;
    this._set('nest_ticks', ticks); return !!ticks[id];
  },
  notes() { return this._get('nest_notes', {}); },
  getNote(k) { return this.notes()[k] || ''; },
  setNote(k, v) { const notes = this.notes(); if (v.trim()) notes[k] = v; else delete notes[k]; this._set('nest_notes', notes); },

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
      el.addEventListener('click', e => { if (e.target.closest('button,a,input,textarea,select')) return; NEST.toggleTick(id); paint(); window.dispatchEvent(new Event('nest:sync')); });
      el.addEventListener('keydown', e => { if (e.target !== el) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); NEST.toggleTick(id); paint(); window.dispatchEvent(new Event('nest:sync')); } });
    });
  },
};

document.addEventListener('DOMContentLoaded', () => {
  const nin = document.querySelector('.nav-in'), cur = nin && nin.querySelector('a.tab[aria-current]');
  if (cur && nin.scrollWidth > nin.clientWidth) nin.scrollLeft += cur.getBoundingClientRect().left - nin.getBoundingClientRect().left - (nin.clientWidth - cur.offsetWidth) / 2;
  const chip = document.createElement('small');
  chip.id = 'nest-sync-status'; chip.setAttribute('role', 'status');
  chip.style.cssText = 'display:block;text-align:right;color:var(--ink-soft);font-size:11px;margin:8px 18px';
  document.querySelector('.nav')?.after(chip);
  NEST.wire(); NEST._chip(); NEST._pull();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) NEST._pull(); });
  window.addEventListener('focus', () => NEST._pull());
  window.addEventListener('online', () => NEST._pull());
  setInterval(() => { if (!document.hidden) NEST._pull(); }, 30000);
});

// No service worker: caching froze phones on old copies (killed 1 Oct). Clear any
// leftover registration. sw.js stays on the server as the kill switch for phones
// that still run the old caching worker.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
}
