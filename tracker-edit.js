// Editable tracker lists. Existing page content is the first-run default.
(() => {
  const defaults = (window.NEST_MILESTONES || []).map((m, i) => ({...m, id: 'mile-' + i}));
  const lists = [...document.querySelectorAll('ul.todos')].map((ul, index) => ({
    ul, key: 'nest_todos_' + index,
    defaults: [...ul.children].map(li => ({ id: li.dataset.tick, title: li.querySelector('.txt').childNodes[0].textContent.trim(), sub: li.querySelector('small')?.textContent || '' })),
    originals: new Map([...ul.children].map(li => [li.dataset.tick, li.querySelector('.txt').cloneNode(true)]))
  }));
  const style = document.createElement('style');
  style.textContent = '.tracker-actions{display:flex;gap:4px;margin-left:auto;flex:none}.tracker-actions button,.tracker-add{font:inherit;font-size:12px;color:var(--accent);background:var(--surface);border:1px solid var(--line);border-radius:8px;min-height:38px;padding:6px 9px;cursor:pointer}.tracker-add{margin-top:12px}dialog{width:min(92vw,420px);box-sizing:border-box;border:1px solid var(--line);border-radius:18px;background:var(--surface);color:var(--ink);padding:22px}dialog::backdrop{background:#12102788}dialog label{display:block;margin:12px 0}dialog input,dialog textarea{display:block;width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:10px;border:1px solid var(--line);border-radius:9px;background:var(--ground);color:var(--ink)}.todos .txt,.mile .what{flex:1;min-width:0}@media(max-width:480px){.mile li{flex-wrap:wrap}.mile .when{width:78px}.tracker-actions{gap:2px}.tracker-actions button{padding:6px;font-size:11px}}';
  document.head.append(style);
  const dialog = document.createElement('dialog');
  dialog.innerHTML = '<form><h3>Edit tracker</h3><label>Title<input name="title" maxlength="500" required></label><label class="date">Date<input name="date" type="date" required></label><label class="when">Date label<input name="when" maxlength="80" placeholder="e.g. Early 2027"></label><label>Details<textarea name="sub" rows="3" maxlength="2000"></textarea></label><p class="tracker-actions"><button type="button" class="cancel">Cancel</button><button type="submit">Save</button></p></form>';
  document.body.append(dialog);
  dialog.querySelector('.cancel').onclick = () => dialog.close();
  function edit(key, items, item, milestone) {
    const form = dialog.querySelector('form'); form.reset();
    form.elements.title.value = item?.title || item?.what || '';
    form.elements.sub.value = item?.sub || '';
    form.elements.date.value = item?.d || '';
    form.elements.when.value = item?.when || '';
    form.elements.date.required = milestone;
    dialog.querySelector('.date').hidden = !milestone; dialog.querySelector('.when').hidden = !milestone;
    form.onsubmit = e => {
      e.preventDefault();
      const title = form.elements.title.value.trim(); if (!title) return;
      const value = { id: item?.id || crypto.randomUUID(), sub: form.elements.sub.value.trim() };
      if (milestone) Object.assign(value, {what: title, d: form.elements.date.value, when: form.elements.when.value.trim() || form.elements.date.value});
      else value.title = title;
      // Re-read in case the other phone edited this list while the dialog was open.
      const current = NEST._get(key, items);
      NEST._set(key, item ? current.map(x => x.id === item.id ? value : x) : [...current, value]);
      dialog.close(); render();
    };
    dialog.showModal(); form.elements.title.focus();
  }
  function actions(key, items, item, milestone) {
    const span = document.createElement('span'); span.className = 'tracker-actions';
    for (const label of ['Edit', 'Delete']) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.setAttribute('aria-label', label + ' ' + (item.title || item.what));
      b.onclick = e => {
        e.stopPropagation();
        if (label === 'Edit') edit(key, items, item, milestone);
        else if (confirm('Delete this ' + (milestone ? 'milestone' : 'to-do') + '?')) {
          NEST._set(key, NEST._get(key, items).filter(x => x.id !== item.id)); render();
        }
      };
      span.append(b);
    }
    return span;
  }
  function addButton(ul, key, fallback, milestone) {
    const button = document.createElement('button'); button.className = 'tracker-add'; button.type = 'button'; button.textContent = '+ Add';
    button.onclick = () => edit(key, NEST._get(key, fallback), null, milestone); ul.after(button);
  }
  for (const list of lists) addButton(list.ul, list.key, list.defaults, false);
  addButton(document.getElementById('mile'), 'nest_milestones', defaults, true);
  function values(key, fallback) {
    const stored = NEST._get(key, null);
    if (stored === null && NEST._ready) NEST._set(key, fallback);
    return stored || fallback;
  }
  function render() {
    for (const list of lists) {
      const items = values(list.key, list.defaults);
      list.ul.replaceChildren(...items.map(item => {
        const li = document.createElement('li'); li.dataset.tick = item.id;
        const box = document.createElement('span'); box.className = 'box';
        const original = list.defaults.find(x => x.id === item.id);
        let txt;
        if (original && original.title === item.title && original.sub === item.sub) txt = list.originals.get(item.id).cloneNode(true);
        else { txt = document.createElement('span'); txt.className = 'txt'; txt.textContent = item.title; if (item.sub) { const small = document.createElement('small'); small.textContent = item.sub; txt.append(small); } }
        li.append(box, txt, actions(list.key, items, item, false)); return li;
      }));
      NEST.wire(list.ul);
    }
    const items = values('nest_milestones', defaults).slice().sort((a,b) => a.d.localeCompare(b.d));
    let upcoming = false;
    const today = new Date().toLocaleDateString('en-CA');
    document.getElementById('mile').replaceChildren(...items.map(item => {
      const li = document.createElement('li');
      if (item.d < today) li.className = 'past'; else if (!upcoming) { li.className = 'now'; upcoming = true; }
      const when = document.createElement('span'); when.className = 'when'; when.textContent = item.when;
      const what = document.createElement('span'); what.className = 'what'; what.textContent = item.what;
      if (item.sub) { const sub = document.createElement('small'); sub.textContent = item.sub; what.append(sub); }
      li.append(when, what, actions('nest_milestones', items, item, true)); return li;
    }));
  }
  window.addEventListener('nest:sync', render); render();
})();
