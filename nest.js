// The Nest — client-side interactivity (saves + ticks), persisted on this device.
// Cross-device sync (you + Mishka) comes when Babybean is live.
window.NEST = {
  _get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
  _set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },

  saves(kind) { return this._get('nest_save_' + kind, []); },
  isSaved(kind, label) { return this.saves(kind).some(x => x.label === label); },
  toggleSave(kind, label, url) {
    const s = this.saves(kind);
    const i = s.findIndex(x => x.label === label);
    if (i >= 0) s.splice(i, 1); else s.push({ label: label, url: url || '' });
    this._set('nest_save_' + kind, s);
    return i < 0;
  },

  ticks() { return this._get('nest_ticks', {}); },
  isTicked(id) { return !!this.ticks()[id]; },
  toggleTick(id) { const t = this.ticks(); if (t[id]) delete t[id]; else t[id] = 1; this._set('nest_ticks', t); return !!t[id]; },

  notes() { return this._get('nest_notes', {}); },
  getNote(k) { return this.notes()[k] || ''; },
  setNote(k, v) { const n = this.notes(); if (v && v.trim()) n[k] = v; else delete n[k]; this._set('nest_notes', n); },

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
  }
};
document.addEventListener('DOMContentLoaded', () => window.NEST.wire());
// Register the service worker so The Nest installs as an app + works offline.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
