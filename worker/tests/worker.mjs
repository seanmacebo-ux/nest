// Offline integration checks using real SQLite and Web Crypto, with D1/KV adapters.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { pbkdf2Sync } from 'node:crypto';
import worker from '../src/index.js';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
class Statement {
  constructor(sql, args = []) { this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.sql, args); }
  async first() { return sqlite.prepare(this.sql).get(...this.args) || null; }
  async all() { return {results: sqlite.prepare(this.sql).all(...this.args)}; }
  async run() { return {meta: sqlite.prepare(this.sql).run(...this.args)}; }
}
const values = new Map();
const salt = Buffer.from('test-only-salt');
const hash = 'pbkdf2$100000$' + salt.toString('base64') + '$' + pbkdf2Sync('test-password', salt, 100000, 32, 'sha256').toString('base64');
const env = {
  USERS_JSON: JSON.stringify({sean: hash, mishka: hash}), SESSION_SECRET: 'test-only-session-key', WORKER_TOKEN: 'test-only-machine-key',
  DB: { prepare: sql => new Statement(sql), async batch(statements) { sqlite.exec('BEGIN'); try { const result = []; for (const s of statements) result.push(await s.run()); sqlite.exec('COMMIT'); return result; } catch(e) { sqlite.exec('ROLLBACK'); throw e; } } },
  FILES: { async put(k, stream, options) { values.set(k, {bytes: await new Response(stream).arrayBuffer(), metadata: options.metadata}); }, async get(k) { return values.has(k) ? new Blob([values.get(k).bytes]).stream() : null; }, async delete(k) { values.delete(k); } },
  ASSETS: { fetch: async req => new Response('asset:' + new URL(req.url).pathname) }
};
let cookie = '';
async function call(path, options = {}, session = true) {
  const headers = new Headers(options.headers);
  if (session && cookie) headers.set('Cookie', cookie);
  const response = await worker.fetch(new Request('https://nest.test' + path, {...options, headers}), env);
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  return response;
}
const put = (v, rev) => ({method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({v,rev})});
const machine = (body = {}) => ({method:'POST', headers:{Authorization:'Bearer ' + env.WORKER_TOKEN, 'Content-Type':'application/json'}, body:JSON.stringify(body)});
for (const path of ['/', '/tracker.html', '/img/p/test.webp', '/nest.js']) assert.equal((await call(path)).status, 302);
for (const path of ['/manifest.webmanifest', '/icon-192.png', '/apple-touch-icon.png', '/login']) assert.equal((await call(path)).status, 200);
assert.equal((await call('/api/kv')).status, 401);
assert.equal((await call('/api/worker/claim', {method:'POST'})).status, 401);
async function login(username, password = 'test-password', ip='test-ip', next='/tracker.html') {
  return call('/login', {method:'POST', headers:{'CF-Connecting-IP':ip}, body:new URLSearchParams({username,password,next})}, false);
}
for (let i=0;i<10;i++) assert.equal((await login('sean','wrong','blocked-ip')).status,401);
assert.equal((await login('sean','test-password','blocked-ip')).status,429);
const auth = await login('sean'); assert.equal(auth.status,303);
assert.match(auth.headers.get('Set-Cookie'), /HttpOnly; Secure; SameSite=Lax; Path=\//);
cookie = auth.headers.get('Set-Cookie').split(';')[0];
assert.equal((await call('/tracker.html')).status,200);
assert.equal((await call('/api/kv', {headers:{Cookie:cookie + 'tampered'}}, false)).status,401);
assert.equal((await call('/api/kv/test', {...put('x',0), headers:{Origin:'https://evil.test'}})).status,403);
assert.equal((await login('sean','test-password','redirect-ip','//evil.test')).headers.get('Location'),'/');
assert.equal((await call('/api/kv')).status,200);
let row = await (await call('/api/kv/ticks', put('{"first":1}',0))).json(); assert.equal(row.rev,1); assert.equal(row.updated_by,'sean');
assert.equal((await call('/api/kv/ticks', put('stale',0))).status,409);
row = await (await call('/api/kv/ticks',put('{"second":1}',1))).json(); assert.equal(row.rev,2);
assert.equal((await call('/api/kv/missing',put('x',10))).status,409);
assert.equal((await call('/api/kv/ticks',put('x',-1))).status,400);
assert.equal((await call('/api/kv/ticks',{method:'DELETE'})).status,200);
assert.equal((await (await call('/api/kv')).json()).rows.length,0);
const form = new FormData(); form.set('text','Hello <script>bad()</script>'); form.append('files[]',new Blob(['%PDF-test'],{type:'application/pdf'}),'hello.pdf');
const submitted = await call('/api/requests',{method:'POST',body:form}); assert.equal(submitted.status,201);
const {id} = await submitted.json();
const list = (await (await call('/api/requests')).json()).requests;
assert.equal(list.length,1); assert.equal(list[0].files.length,1);
const file = list[0].files[0];
assert.equal((await call('/api/files/'+file.id,{},false)).status,401);
assert.equal(await (await call('/api/files/'+file.id)).text(),'%PDF-test');
assert.match((await call('/api/files/'+file.id)).headers.get('Content-Disposition'),/^attachment;/);
const bad = new FormData(); bad.set('text','test'); bad.append('files[]',new Blob(['x']),'evil.html');
assert.equal((await call('/api/requests',{method:'POST',body:bad})).status,400);
const claim = (await (await call('/api/worker/claim',machine(),false)).json()).request;
assert.equal(claim.id,id); assert.equal(claim.status,'working'); assert.equal(claim.files.length,1);
assert.equal((await (await call('/api/worker/claim',machine(),false)).json()).request,null);
assert.equal((await call('/api/worker/files/'+file.id,{headers:machine().headers},false)).status,200);
assert.equal((await call('/api/worker/reply/'+id,machine({reply:'late',status:'done',lease_until:'stale'}),false)).status,409);
sqlite.prepare('UPDATE requests SET lease_until=? WHERE id=?').run('2020-01-01',id);
const reclaimed = (await (await call('/api/worker/claim',machine(),false)).json()).request;
assert.equal(reclaimed.id,id);
assert.equal((await call('/api/worker/reply/'+id,machine({reply:'**Answer**',status:'done',lease_until:reclaimed.lease_until}),false)).status,200);
assert.equal((await call('/api/worker/reply/'+id,machine({reply:'overwrite',status:'failed',lease_until:reclaimed.lease_until}),false)).status,409);
assert.equal((await call('/api/worker/heartbeat',machine({note:'checked'}),false)).status,200);
assert.equal((await (await call('/api/status')).json()).heartbeat.note,'checked');
assert.equal((await call('/logout')).headers.get('Set-Cookie').includes('Max-Age=0'),true);
console.log('Worker integration checks passed: authentication, rate limits, CSRF, revisions, upload/download, claims, stale replies, heartbeat.');
