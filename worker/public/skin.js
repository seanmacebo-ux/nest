// Private app only. Use the same shared ticks and notes as the other Nest pages.
(() => {
  const checks = document.getElementById('skin-checks');
  for (let week = 0; week <= 24; week += 4) {
    const item = document.createElement('li');
    item.innerHTML = `<div class="skin-tick" data-tick="skin-photo-${week}"><span class="box" aria-hidden="true"></span><span class="txt"><b>${week ? 'Week ' + week + ' photo check' : 'Baseline photos'}</b><small data-skin-week="${week}">Choose your restart date above</small></span></div>
      <label class="skin-label" for="skin-note-${week}">Bumps / marks / texture 1–5 + notes</label>
      <textarea class="notebox skin-note" id="skin-note-${week}" data-note-key="skin-check-${week}" placeholder="1 = mild, 5 = severe. Add the actual photo date if different."></textarea>`;
    checks.appendChild(item);
  }
  const start = document.getElementById('skin-start');
  const dates = () => {
    const value = start.value;
    document.querySelectorAll('[data-skin-week]').forEach(el => {
      if (!value) { el.textContent = 'Choose your restart date above'; return; }
      // Local noon avoids a UTC date rolling back on phones west of Greenwich.
      const date = new Date(value + 'T12:00:00');
      date.setDate(date.getDate() + Number(el.dataset.skinWeek) * 7);
      el.textContent = date.toLocaleDateString('en-ZA', {day:'numeric', month:'short', year:'numeric'});
    });
  };
  const states = () => document.querySelectorAll('.skin-tick[data-tick]').forEach(el => {
    el.setAttribute('role', 'checkbox');
    el.setAttribute('aria-checked', String(NEST.isTicked(el.dataset.tick)));
  });
  document.addEventListener('DOMContentLoaded', () => {
    // NEST's DOMContentLoaded handler wires the fields before this handler runs.
    dates(); states();
    new MutationObserver(states).observe(document.querySelector('main'), {subtree:true, attributes:true, attributeFilter:['class']});
  });
  start.addEventListener('input', dates);
  window.addEventListener('nest:sync', () => { dates(); states(); });
})();
