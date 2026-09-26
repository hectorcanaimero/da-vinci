import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../src/server/index.mjs';
import { openLibrary } from '../src/library/db.mjs';

const KEYS = ['OPENAI', 'GEMINI', 'FAL', 'KIE', 'HEYGEN', 'ELEVENLABS', 'TRIPO'].map((p) => `${p}_API_KEY`);
const realFetch = globalThis.fetch;
const realHome = process.env.HOME;
let dir, library, home, base, server;

before(async () => {
  home = await mkdtemp(join(tmpdir(), 'dv-routes-'));
  dir = await mkdtemp(join(tmpdir(), 'davinci-providers-'));
  process.env.DAVINCI_HOME = dir;
  process.env.HOME = home;
  for (const k of [...KEYS, 'DAVINCI_SECRETS_SOURCE', 'DAVINCI_ENV_FILE', 'INFISICAL_URL']) delete process.env[k];

  // Mock fetch that intercepts only provider API calls, not localhost
  globalThis.fetch = async (url, opts) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    // Only mock external APIs, pass through localhost requests
    if (urlStr.includes('localhost') || urlStr.includes('127.0.0.1')) {
      return realFetch(urlStr, opts);
    }
    // Mock provider API responses
    const auth = opts?.headers?.Authorization || opts?.headers?.['x-goog-api-key'];
    if (!auth) {
      return new Response(JSON.stringify({ error: { message: 'no auth' } }), { status: 401 });
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  };

  library = openLibrary();
  const config = { host: '127.0.0.1', apiKey: null };
  server = createServer({ config, library });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  globalThis.fetch = realFetch;
  process.env.HOME = realHome;
  if (server) {
    server.closeAllConnections();
    server.close();
  }
});

test('GET /api/providers devuelve estado de todos los proveedores', async () => {
  const res = await fetch(`${base}/api/providers`);
  assert.equal(res.status, 200);
  const { items: data } = await res.json();
  assert.ok(Array.isArray(data));
  assert.equal(data.length, 7);
  for (const p of data) {
    assert.ok(p.id);
    assert.ok(['missing', 'connected', 'error'].includes(p.status));
  }
  // Verify no key leaks
  const body = JSON.stringify(data);
  assert.ok(!body.includes('sk-'), 'No OpenAI keys leaked');
  assert.ok(!body.includes('AIza'), 'No Google keys leaked');
});

test('GET /api/providers sin keys muestra status "missing"', async () => {
  const res = await fetch(`${base}/api/providers`);
  const { items: data } = await res.json();
  for (const p of data) {
    assert.equal(p.status, 'missing');
    assert.equal(p.keyHint, null);
    assert.equal(p.source, null);
  }
});

test('PUT /api/providers/:id/key guarda la clave', async () => {
  const key = 'sk-test-key-1234567890';
  const res = await fetch(`${base}/api/providers/openai/key`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.id, 'openai');
  assert.equal(data.status, 'connected');
  assert.ok(!JSON.stringify(data).includes(key), 'key no debe estar en la respuesta');
});

test('PUT /api/providers/:id/key rechaza key vacía con 400', async () => {
  const res = await fetch(`${base}/api/providers/openai/key`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: '' }),
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error.code, 'invalid_request');
});

test('PUT /api/providers/:id/key rechaza key whitespace-only con 400', async () => {
  const res = await fetch(`${base}/api/providers/openai/key`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: '   ' }),
  });
  assert.equal(res.status, 400);
});

test('PUT /api/providers/:id/key con proveedor desconocido → 404', async () => {
  const res = await fetch(`${base}/api/providers/nope/key`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'test' }),
  });
  assert.equal(res.status, 404);
  const data = await res.json();
  assert.equal(data.error.code, 'not_found');
});

test('POST /api/providers/:id/test testea la clave', async () => {
  // Primero guardar una key
  await fetch(`${base}/api/providers/openai/key`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'sk-test' }),
  });

  const res = await fetch(`${base}/api/providers/openai/test`, { method: 'POST' });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.id, 'openai');
  assert.equal(data.status, 'connected');
  assert.ok(!JSON.stringify(data).includes('sk-test'), 'key no debe estar en la respuesta');
});

test('POST /api/providers/:id/test sin key muestra missing', async () => {
  const res = await fetch(`${base}/api/providers/gemini/test`, { method: 'POST' });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.id, 'gemini');
  assert.equal(data.status, 'missing');
  assert.equal(data.keyHint, null);
});

test('POST /api/providers/:id/test con proveedor desconocido → 404', async () => {
  const res = await fetch(`${base}/api/providers/unknown/test`, { method: 'POST' });
  assert.equal(res.status, 404);
  const data = await res.json();
  assert.equal(data.error.code, 'not_found');
});

test('Ninguna respuesta contiene la clave completa', async () => {
  const testKey = 'sk-secret-key-12345';

  // Guardar key
  const putRes = await fetch(`${base}/api/providers/openai/key`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: testKey }),
  });
  const putText = await putRes.text();
  assert.ok(!putText.includes(testKey));

  // GET providers
  const getRes = await fetch(`${base}/api/providers`);
  const getText = await getRes.text();
  assert.ok(!getText.includes(testKey));

  // Test provider
  const testRes = await fetch(`${base}/api/providers/openai/test`, { method: 'POST' });
  const testText = await testRes.text();
  assert.ok(!testText.includes(testKey));
});
