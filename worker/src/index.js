// The Nest: private assets, household state and Babybean's outbound inbox.
const enc = new TextEncoder();
const json = (v, status = 200) => Response.json(v, { status });
const stamp = () => new Date().toISOString();
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const url64 = bytes => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const from64 = s => unb64(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4));
async function hmacKey(secret) {
  if (!secret) fail(503, 'Authentication is not configured');
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function equalSecret(a, b) {
  if (!a || !b) return false;
  const key = await hmacKey(b);
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(a));
  return crypto.subtle.verify('HMAC', key, signature, enc.encode(b));
}
async function session(req, env) {
  try {
    const cookie = (req.headers.get('Cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith('nest_s='));
    if (!cookie) return null;
    const [payload, signature, extra] = cookie.slice(7).split('.');
    if (extra || !await crypto.subtle.verify('HMAC', await hmacKey(env.SESSION_SECRET), from64(signature), enc.encode(payload))) return null;
    const data = JSON.parse(new TextDecoder().decode(from64(payload)));
    const users = JSON.parse(env.USERS_JSON || '{}');
    return Object.hasOwn(users, data.u) && Number.isFinite(data.exp) && data.exp > Date.now() / 1000 ? data : null;
  } catch { return null; }
}
function nextPath(value) {
  // Backslashes and protocol-relative URLs must never become redirect targets.
  return typeof value === 'string' && value.startsWith('/') && !/^\/[\/\\]/.test(value) && !/[\r\n\\]/.test(value) ? value : '/';
}
function loginForm(next, error = '', status = 200) {
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#100E22" media="(prefers-color-scheme:dark)"><meta name="theme-color" content="#F6F4FF" media="(prefers-color-scheme:light)"><title>Log in · The Nest</title>
<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Figtree:wght@400;500;600;700&display=swap">
<style>:root{color-scheme:light dark;--ground:#F6F4FF;--surface:#fff;--surface-2:#F0ECFF;--ink:#1E1A3A;--ink-soft:#6B668F;--line:#E2DDF7;--accent:#6C4CF5;--warn:#E0405F}@media (prefers-color-scheme:dark){:root{--ground:#100E22;--surface:#181633;--surface-2:#211E44;--ink:#EDEAFB;--ink-soft:#A9A3D9;--line:#ffffff14;--accent:#A594FF;--warn:#FF7A93}}*{box-sizing:border-box}body{margin:0;background:var(--ground);color:var(--ink);font:16px/1.55 Figtree,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;display:grid;min-height:100svh;place-items:center}main{width:min(92%,380px);padding:28px;background:var(--surface);border:1px solid var(--line);border-radius:16px;box-shadow:none}.eyebrow{font:600 12px Figtree,system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-soft);display:flex;align-items:center;gap:8px}.eyebrow:before{content:'';width:7px;height:7px;border-radius:50%;background:var(--accent)}h1{font-family:'Bricolage Grotesque',Georgia,serif;font-weight:700;letter-spacing:-.01em;font-size:24px;line-height:1.25;margin:10px 0 6px}p{color:var(--ink-soft);margin:0}label{display:block;margin-top:18px;font-weight:600}input,button{width:100%;padding:13px 14px;border:1.5px solid var(--line);border-radius:12px;font:inherit;margin-top:7px;background:var(--surface-2);color:var(--ink)}input:focus{outline:2px solid var(--accent);outline-offset:1px}button{background:var(--accent);color:var(--ground);border:1px solid var(--line);border-radius:999px;font-weight:700;cursor:pointer;margin-top:24px;box-shadow:none}.error{color:var(--warn);font-weight:600;margin-top:8px}.error:empty{display:none}html,body{overscroll-behavior-y:contain}body{padding: max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))}input,button{min-height:48px;touch-action:manipulation;-webkit-tap-highlight-color:transparent}button{user-select:none}</style>
<main><div class="eyebrow">Sean &amp; Mishka · private</div><h1>🪺 The Nest</h1><p>Log in to see everything, synced on both phones.</p><p class="error" role="alert">${escape(error)}</p><form method="post" action="/login"><input type="hidden" name="next" value="${escape(nextPath(next))}"><label>Name<input name="username" autocomplete="username" required autocapitalize="none" maxlength="40"></label><label>Password<input name="password" type="password" autocomplete="current-password" required maxlength="1024"></label><button>Come in →</button></form></main></html>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
async function passwordOK(password, stored) {
  const [kind, iterations, salt, hash] = stored.split('$');
  if (kind !== 'pbkdf2' || +iterations !== 100000) return false;
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const result = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(salt), iterations: +iterations }, material, 256);
  return equalSecret(b64(result), hash);
}
async function login(req, env, url) {
  if (req.method === 'GET') return loginForm(url.searchParams.get('next'));
  if (req.method !== 'POST') fail(405, 'Method not allowed');
  const form = await req.formData();
  const username = String(form.get('username') || '').toLowerCase().trim();
  const password = String(form.get('password') || '');
  if (username.length > 40 || password.length > 1024) fail(400, 'Invalid login');
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  const cutoff = new Date(Date.now() - 15 * 60000).toISOString();
  await env.DB.prepare('DELETE FROM login_attempts WHERE at < ?').bind(cutoff).run();
  // Reserve before hashing: concurrent failed logins cannot pass the limit together.
  const attempt = await env.DB.prepare('INSERT INTO login_attempts(ip,at) SELECT ?,? WHERE (SELECT count(*) FROM login_attempts WHERE ip=? AND at>=?) < 10 RETURNING rowid').bind(ip, stamp(), ip, cutoff).first();
  if (!attempt) return loginForm(form.get('next'), 'Too many attempts. Try again in 15 minutes.', 429);
  const users = JSON.parse(env.USERS_JSON || '{}');
  const stored = Object.hasOwn(users, username) ? users[username] : null;
  // Do the same expensive work for an unknown name.
  const dummy = 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
  const valid = await passwordOK(password, stored || dummy);
  if (!stored || !valid) return loginForm(form.get('next'), 'Name or password did not match.', 401);
  await env.DB.prepare('DELETE FROM login_attempts WHERE rowid=?').bind(attempt.rowid).run();
  const payload = url64(enc.encode(JSON.stringify({ u: username, exp: Math.floor(Date.now() / 1000) + 90 * 86400 })));
  const sig = url64(await crypto.subtle.sign('HMAC', await hmacKey(env.SESSION_SECRET), enc.encode(payload)));
  return new Response(null, { status: 303, headers: { Location: nextPath(form.get('next')), 'Set-Cookie': `nest_s=${payload}.${sig}; Max-Age=7776000; HttpOnly; Secure; SameSite=Lax; Path=/` } });
}
async function bodyJSON(req) {
  const data = await req.json().catch(() => fail(400, 'Invalid JSON'));
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, 'Expected an object');
  return data;
}
function text(value, max, name, empty = false) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) fail(400, `Invalid ${name}`);
  return value;
}
async function fileList(env, id) {
  return (await env.DB.prepare('SELECT * FROM files WHERE request_id=? ORDER BY created_at,id').bind(id).all()).results;
}
async function download(env, id) {
  const row = await env.DB.prepare('SELECT * FROM files WHERE id=?').bind(id).first();
  if (!row) fail(404, 'File not found');
  const file = await env.FILES.get(`file:${id}`, { type: 'stream' });
  if (!file) fail(503, 'File is not available yet; try again');
  return new Response(file, { headers: { 'Content-Type': row.mime, 'Content-Length': String(row.size), 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}` } });
}
const types = { pdf:'application/pdf', jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', heic:'image/heic', webp:'image/webp', doc:'application/msword', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls:'application/vnd.ms-excel', xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
async function enqueue(req, env, user) {
  if (!(req.headers.get('Content-Type') || '').startsWith('multipart/form-data')) fail(415, 'Use multipart form data');
  const form = await req.formData();
  const message = text(form.get('text'), 20000, 'text').trim();
  const uploads = form.getAll('files[]').filter(f => typeof f !== 'string' && f.name);
  if (uploads.length > 5) fail(400, 'Choose at most 5 files');
  const id = crypto.randomUUID(), at = stamp();
  const files = uploads.map(f => {
    const ext = f.name.split('.').pop().toLowerCase();
    if (!types[ext] || f.size > 20 * 1024 * 1024 || f.size === 0) fail(400, 'Files must be PDF, JPEG, PNG, HEIC, WebP, Word or Excel, up to 20 MB each');
    return { id: crypto.randomUUID(), request_id: id, name: f.name.slice(0, 240).replace(/[\x00-\x1f]/g, ''), mime: types[ext], size: f.size, created_at: at, upload: f };
  });
  const stored = [];
  try {
    for (const f of files) {
      await env.FILES.put(`file:${f.id}`, f.upload.stream(), { metadata: { name: f.name, mime: f.mime, request_id: id, size: f.size } });
      stored.push(f.id);
    }
    await env.DB.batch([
      env.DB.prepare("INSERT INTO requests(id,created_at,created_by,text,status) VALUES(?,?,?,?,'queued')").bind(id, at, user.u, message),
      ...files.map(f => env.DB.prepare('INSERT INTO files(id,request_id,name,mime,size,created_at) VALUES(?,?,?,?,?,?)').bind(f.id, id, f.name, f.mime, f.size, at))
    ]);
  } catch (e) {
    await Promise.allSettled(stored.map(fid => env.FILES.delete(`file:${fid}`)));
    throw e;
  }
  return json({ id, status: 'queued' }, 201);
}
async function api(req, env, user, path) {
  const method = req.method;
  if (path === '/api/kv' && method === 'GET') return json({ rows: (await env.DB.prepare('SELECT * FROM kv ORDER BY k').all()).results });
  if (path.startsWith('/api/kv/')) {
    const k = text(decodeURIComponent(path.slice(8)), 200, 'key');
    if (method === 'DELETE') { await env.DB.prepare('DELETE FROM kv WHERE k=?').bind(k).run(); return json({ ok: true }); }
    if (method === 'PUT') {
      const data = await bodyJSON(req);
      text(data.v, 200000, 'value', true);
      if (data.rev !== undefined && (!Number.isSafeInteger(data.rev) || data.rev < 0)) fail(400, 'Invalid revision');
      // One statement implements compare-and-swap, including the absent-row rev=0 case.
      const row = await env.DB.prepare(`INSERT INTO kv(k,v,rev,updated_at,updated_by)
        SELECT ?,?,1,?,? WHERE ? IS NULL OR ?=0 OR EXISTS(SELECT 1 FROM kv WHERE k=?)
        ON CONFLICT(k) DO UPDATE SET v=excluded.v,rev=kv.rev+1,updated_at=excluded.updated_at,updated_by=excluded.updated_by
        WHERE ? IS NULL OR kv.rev=? RETURNING *`).bind(k, data.v, stamp(), user.u, data.rev ?? null, data.rev ?? null, k, data.rev ?? null, data.rev ?? null).first();
      if (!row) return json({ current: await env.DB.prepare('SELECT * FROM kv WHERE k=?').bind(k).first() }, 409);
      return json(row);
    }
  }
  if (path === '/api/requests' && method === 'POST') return enqueue(req, env, user);
  if (path === '/api/requests' && method === 'GET') {
    const rows = (await env.DB.prepare('SELECT * FROM requests ORDER BY created_at DESC,id DESC LIMIT 50').all()).results;
    const attachments = (await env.DB.prepare('SELECT * FROM files WHERE request_id IN (SELECT id FROM requests ORDER BY created_at DESC,id DESC LIMIT 50)').all()).results;
    return json({ requests: rows.map(r => ({ ...r, files: attachments.filter(f => f.request_id === r.id) })) });
  }
  if (path.startsWith('/api/files/') && method === 'GET') return download(env, path.slice(11));
  if (path === '/api/status' && method === 'GET') return json({ heartbeat: await env.DB.prepare('SELECT at,note FROM heartbeat WHERE id=1').first() });
  fail(404, 'Not found');
}
async function workerAPI(req, env, path) {
  if (!await equalSecret(req.headers.get('Authorization'), env.WORKER_TOKEN ? `Bearer ${env.WORKER_TOKEN}` : '')) fail(401, 'Unauthorized');
  if (path === '/api/worker/claim' && req.method === 'POST') {
    const at = stamp(), lease = new Date(Date.now() + 45 * 60000).toISOString();
    const row = await env.DB.prepare(`UPDATE requests SET status='working',lease_until=? WHERE id=(
      SELECT id FROM requests WHERE status='queued' OR (status='working' AND lease_until<?)
      ORDER BY created_at,id LIMIT 1) RETURNING *`).bind(lease, at).first();
    return json({ request: row ? { ...row, files: await fileList(env, row.id) } : null });
  }
  if (path.startsWith('/api/worker/files/') && req.method === 'GET') return download(env, path.slice(18));
  if (path.startsWith('/api/worker/reply/') && req.method === 'POST') {
    const data = await bodyJSON(req);
    if (!['done', 'failed'].includes(data.status)) fail(400, 'Invalid status');
    text(data.reply, 200000, 'reply', true);
    if (data.lease_until !== undefined) text(data.lease_until, 40, 'lease');
    const result = await env.DB.prepare("UPDATE requests SET reply=?,status=?,replied_at=?,lease_until=NULL WHERE id=? AND status='working' AND (? IS NULL OR lease_until=?) AND lease_until>?").bind(data.reply, data.status, stamp(), path.slice(18), data.lease_until ?? null, data.lease_until ?? null, stamp()).run();
    if (!result.meta.changes) {
      // A transport retry after a successful write is safe and must not rerun Claude.
      const previous = await env.DB.prepare('SELECT status,reply FROM requests WHERE id=?').bind(path.slice(18)).first();
      if (!previous || previous.status !== data.status || previous.reply !== data.reply) fail(409, 'Claim expired or request already answered');
    }
    return json({ ok: true });
  }
  if (path === '/api/worker/heartbeat' && req.method === 'POST') {
    const { note = '' } = await bodyJSON(req); text(note, 1000, 'note', true);
    await env.DB.prepare('INSERT INTO heartbeat(id,at,note) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET at=excluded.at,note=excluded.note').bind(stamp(), note).run();
    return json({ ok: true });
  }
  fail(404, 'Not found');
}
async function route(req, env) {
  const url = new URL(req.url), path = url.pathname;
  if (path.startsWith('/api/worker/')) return workerAPI(req, env, path);
  if (!['GET', 'HEAD'].includes(req.method)) {
    const origin = req.headers.get('Origin');
    if ((origin && origin !== url.origin) || req.headers.get('Sec-Fetch-Site') === 'cross-site') fail(403, 'Cross-site request denied');
    const limit = path === '/api/requests' ? 101 * 1024 * 1024 : 256 * 1024;
    if (Number(req.headers.get('Content-Length')) > limit) fail(413, 'Request too large');
    // Also limit chunked bodies; Content-Length alone is not a trustworthy bound.
    let size = 0;
    const body = req.body?.pipeThrough(new TransformStream({ transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > limit) fail(413, 'Request too large');
      controller.enqueue(chunk);
    } }));
    if (body) req = new Request(req, { body, duplex: 'half' });
  }
  if (path === '/login') return login(req, env, url);
  if (path === '/logout' && req.method === 'GET') return new Response(null, { status: 302, headers: { Location: '/login', 'Set-Cookie': 'nest_s=; Max-Age=0; HttpOnly; Secure; SameSite=Lax; Path=/' } });
  if (['/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/icon.svg', '/apple-touch-icon.png'].includes(path) && ['GET', 'HEAD'].includes(req.method)) return env.ASSETS.fetch(req);
  const user = await session(req, env);
  if (!user) return path.startsWith('/api/') ? json({ error: 'Login required' }, 401) : new Response(null, { status: 302, headers: { Location: `/login?next=${encodeURIComponent(path + url.search)}` } });
  if (path.startsWith('/api/')) return api(req, env, user, path);
  return env.ASSETS.fetch(req);
}
export default {
  async fetch(req, env) {
    let response;
    try { response = await route(req, env); }
    catch (error) { response = json({ error: error.status ? error.message : 'Something went wrong. Please try again.' }, error.status || 500); }
    const secured = new Response(response.body, response);
    for (const [k, v] of Object.entries({ 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'X-Robots-Tag': 'noindex', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' })) secured.headers.set(k, v);
    return secured;
  }
};
