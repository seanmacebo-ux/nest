// DOM-only rendering: neither questions nor Claude replies are trusted HTML.
(() => {
  const form = document.getElementById('ask-form'), message = document.getElementById('ask-message');
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
  function inline(parent, text) {
    const pattern = /\*\*([^*\n]+)\*\*|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;
    let offset = 0;
    for (const match of text.matchAll(pattern)) {
      parent.append(document.createTextNode(text.slice(offset, match.index)));
      if (match[1]) parent.append(el('strong', match[1]));
      else {
        const link = el('a', match[2]); link.href = match[3]; link.target = '_blank'; link.rel = 'noopener noreferrer'; parent.append(link);
      }
      offset = match.index + match[0].length;
    }
    parent.append(document.createTextNode(text.slice(offset)));
  }
  function markdown(text) {
    const out = el('div', null, 'ask-reply'); let list;
    for (const line of text.split(/\r?\n/)) {
      if (/^\s*-\s+/.test(line)) {
        if (!list) { list = el('ul'); out.append(list); }
        const li = el('li'); inline(li, line.replace(/^\s*-\s+/, '')); list.append(li);
      } else {
        list = null;
        const p = el('p'); if (line) inline(p, line); else p.append(el('br')); out.append(p);
      }
    }
    return out;
  }
  let busy = false;
  async function refresh() {
    if (busy || document.hidden) return;
    busy = true;
    try {
      const [requests, status] = await Promise.all([NEST._fetch('/api/requests'), NEST._fetch('/api/status')]);
      if (!requests.ok || !status.ok) throw new Error('Unavailable');
      const data = await requests.json(), health = await status.json();
      const at = health.heartbeat?.at;
      const minutes = at ? Math.max(0, Math.floor((Date.now() - new Date(at)) / 60000)) : null;
      document.getElementById('ask-heartbeat').textContent = 'Claude last checked in: ' + (minutes === null ? 'not yet' : minutes + ' min ago');
      const cards = data.requests.map(r => {
        const card = el('article', null, 'panel ask-card');
        card.append(el('p', `${r.created_by === 'mishka' ? 'Mishka' : 'Sean'} · ${new Date(r.created_at).toLocaleString()}`, 'ask-meta'));
        const status = ['queued', 'working', 'done', 'failed'].includes(r.status) ? r.status : 'queued';
        card.append(el('span', status, 'ask-status ' + status), el('p', r.text, 'ask-question'));
        const files = el('ul', null, 'ask-attachments');
        for (const file of r.files || []) { const li = el('li'), a = el('a', file.name); a.href = '/api/files/' + encodeURIComponent(file.id); li.append(a); files.append(li); }
        card.append(files);
        if (r.reply) card.append(markdown(r.reply));
        return card;
      });
      document.getElementById('ask-requests').replaceChildren(...(cards.length ? cards : [el('p', 'No questions yet. Ask the first one.', 'ask-meta')]));
    } catch {
      document.getElementById('ask-heartbeat').textContent = 'Claude last checked in: unavailable';
      if (!document.querySelector('.ask-card')) document.getElementById('ask-requests').textContent = 'The inbox is unavailable. Your question will stay here until you can send it.';
    } finally { busy = false; }
  }
  const draft = () => { try { sessionStorage.setItem('nest_ask_draft', form.elements.text.value); } catch {} };
  try { form.elements.text.value = sessionStorage.getItem('nest_ask_draft') || ''; } catch {}
  form.elements.text.addEventListener('input', draft);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const files = [...form.elements['files[]'].files];
    message.classList.remove('error');
    if (!form.elements.text.value.trim()) { form.elements.text.focus(); return; }
    if (files.length > 5 || files.some(f => f.size > 20 * 1024 * 1024 || !/\.(pdf|jpe?g|png|heic|webp|docx?|xlsx?)$/i.test(f.name))) {
      message.textContent = 'Choose up to 5 supported files, each 20 MB or less.'; message.classList.add('error'); return;
    }
    const button = form.querySelector('button'); button.disabled = true; message.textContent = 'Sending…';
    try {
      const response = await NEST._fetch('/api/requests', { method: 'POST', body: new FormData(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not send');
      form.reset(); draft(); message.textContent = 'Sent. Claude will pick this up shortly.'; await refresh();
    } catch (error) { message.textContent = error.message === 'Failed to fetch' ? 'Could not send. Please try again when you are online.' : error.message; message.classList.add('error'); }
    finally { button.disabled = false; }
  });
  refresh(); setInterval(refresh, 15000);
  document.addEventListener('visibilitychange', refresh); window.addEventListener('focus', refresh);
})();
