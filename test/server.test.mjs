import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../src/server/index.mjs';
import { events } from '../src/server/events.mjs';
import { openLibrary } from '../src/library/db.mjs';

let dir, library, uiDir, id, deletedId;
const open = [];

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'davinci-server-'));
  process.env.DAVINCI_HOME = dir;
  library = openLibrary();
  uiDir = join(dir, 'ui');
  await mkdir(uiDir);
  await writeFile(join(uiDir, 'index.html'), '<h1>ui</h1>');
  const rec = async (name) => {
    const filePath = join(dir, name);
    await writeFile(filePath, '0123456789');
    return library.record({ kind: 'image', provider: 'x', model: 'm', filePath, mime: 'image/png', source: 'test' }).id;
  };
  id = await rec('a.png');
  deletedId = await rec('b.png');
  library.remove(deletedId);
});

after(() => open.forEach((s) => { s.closeAllConnections(); s.close(); }));

async function listen(config) {
  const server = createServer({ config: { host: '127.0.0.1', apiKey: null, ...config }, library, uiDir });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  open.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

// fetch normaliza '/../x'; http.request lo manda tal cual.
const raw = (base, path) => new Promise((resolve, reject) => {
  const { port } = new URL(base);
  http.get({ port, path }, (res) => {
    let body = '';
    res.on('data', (c) => (body += c));
    res.on('end', () => resolve({ status: res.statusCode, body }));
  }).on('error', reject);
});

test('health, 404 JSON en /api y /v1, HTML en /', async () => {
  const base = await listen();
  const h = await (await fetch(`${base}/api/health`)).json();
  assert.equal(h.ok, true);
  assert.ok(h.version);

  for (const p of ['/api/x', '/v1/x']) {
    const r = await fetch(base + p);
    assert.equal(r.status, 404);
    assert.equal((await r.json()).error.code, 'not_found');
  }
  assert.match(await (await fetch(`${base}/algo/spa`)).text(), /<h1>ui<\/h1>/);
});

test('/files/:id con y sin Range; borrado → 404', async () => {
  const base = await listen();
  const full = await fetch(`${base}/files/${id}`);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('content-type'), 'image/png');
  assert.equal(full.headers.get('content-length'), '10');
  assert.equal(await full.text(), '0123456789');

  const part = await fetch(`${base}/files/${id}`, { headers: { Range: 'bytes=2-5' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(await part.text(), '2345');

  assert.equal((await fetch(`${base}/files/${deletedId}`)).status, 404);
  assert.equal((await fetch(`${base}/files/nope`)).status, 404);
});

test('path traversal no escapa de dist/ui', async () => {
  const base = await listen();
  for (const p of ['/../package.json', '/%2e%2e/package.json', '/..%2fpackage.json']) {
    const r = await raw(base, p);
    assert.doesNotMatch(r.body, /"name": "da-vinci"/, p);
  }
});

test('host no local: 401 sin token, 200 con token, ?key= solo en /files y /api/events', async () => {
  assert.throws(() => createServer({ config: { host: '0.0.0.0', apiKey: null }, library }), /apiKey/);
  const base = await listen({ host: '0.0.0.0', apiKey: 'sekret' });
  assert.equal((await fetch(`${base}/api/health`)).status, 401);
  assert.equal((await fetch(`${base}/api/health`, { headers: { Authorization: 'Bearer sekret' } })).status, 200);
  assert.equal((await fetch(`${base}/api/health?key=sekret`)).status, 401);
  assert.equal((await fetch(`${base}/files/${id}?key=sekret`)).status, 200);
});

test('un evento emitido llega por SSE', async () => {
  const base = await listen();
  const ac = new AbortController();
  const res = await fetch(`${base}/api/events`, { signal: ac.signal });
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  const reader = res.body.getReader();
  await reader.read(); // ': connected'
  events.emit('job', { id: 'j1', status: 'done' });
  const { value } = await reader.read();
  assert.equal(new TextDecoder().decode(value), 'event: job\ndata: {"id":"j1","status":"done"}\n\n');
  ac.abort();
});
