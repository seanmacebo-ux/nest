// Private app only. Use the same shared sync as the other Nest pages.
(() => {
  const key = 'nest_skin_log_sean';
  const log = document.getElementById('skin-log');
  const note = document.getElementById('skin-log-note');
  const render = () => {
    log.replaceChildren();
    const entries = Object.values(NEST._get(key, {})).sort((a, b) => b.at.localeCompare(a.at));
    for (const entry of entries) {
      const item = document.createElement('li');
      const result = document.createElement('b');
      result.textContent = entry.result;
      const date = document.createElement('time');
      date.className = 'skin-muted';
      date.dateTime = entry.at;
      date.textContent = new Date(entry.at).toLocaleString('en-ZA', {day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'});
      const text = document.createElement('p');
      text.className = 'skin-entry-note';
      text.textContent = entry.note;
      item.append(result, date, text);
      log.appendChild(item);
    }
  };
  document.querySelectorAll('[data-skin-result]').forEach(button => {
    button.addEventListener('click', () => {
      // An object keyed by ID lets NEST merge entries from different devices.
      const entries = NEST._get(key, {});
      entries[crypto.randomUUID()] = {at: new Date().toISOString(), result: button.dataset.skinResult, note: note.value.trim()};
      NEST._set(key, entries);
      note.value = '';
      document.getElementById('skin-log-status').textContent = 'Entry saved. Sync status is shown at the top.';
      render();
    });
  });
  const states = () => document.querySelectorAll('.skin-tick[data-tick]').forEach(el => {
    el.setAttribute('role', 'checkbox');
    el.setAttribute('aria-checked', String(NEST.isTicked(el.dataset.tick)));
  });
  document.addEventListener('DOMContentLoaded', () => {
    // NEST's DOMContentLoaded handler wires the fields before this handler runs.
    render(); states();
    new MutationObserver(states).observe(document.querySelector('main'), {subtree:true, attributes:true, attributeFilter:['class']});
  });
  window.addEventListener('nest:sync', () => { render(); states(); });
})();
