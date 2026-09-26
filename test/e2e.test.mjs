import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { startServer } from '../src/server/start.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, '..', 'src', 'generate.mjs');
const CLI_MOCK = join(here, 'helpers', 'mock-fetch.mjs');

// fetch de proveedores mockeado (FAL cola + CDN); el tráfico a 127.0.0.1 pasa al fetch real.
const realFetch = globalThis.fetch;
const realSetTimeout = globalThis.setTimeout;
const json = (o) => new Response(JSON.stringify(o), { status: 200 });
const mocks = [
  [/queue\.fal\.run\/fal-ai\/kling/, () => json({ status_url: 'https://s/status', response_url: 'https://s/video' })],
  [/queue\.fal\.run\/fal-ai/, () => json({ status_url: 'https://s/status', response_url: 'https://s/image' })],
  [/s\/status/, () => json({ status: 'COMPLETED' })],
  [/s\/image/, () => json({ images: [{ url: 'https://cdn/a.png' }] })],
  [/s\/video/, () => json({ video: { url: 'https://cdn/v.mp4' } })],
  [/cdn\/a\.png/, () => new Response(Buffer.from('png-bytes'), { headers: { 'content-type': 'image/png' } })],
  [/cdn\/v\.mp4/, () => new Response(Buffer.from('mp4-bytes'), { headers: { 'content-type': 'video/mp4' } })],
];

let home, cwd, srv, base;
const seen = []; // eventos `job` recibidos por SSE
const sse = new AbortController();

const api = async (path, { method = 'GET', body, headers } = {}) => {
  const r = await fetch(`${base}${path}`, {
    method, headers: { 'content-type': 'application/json', ...headers },
    body: body && JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
};

const waitDone = async (jobId) => {
  for (let i = 0; i < 200; i++) {
    const ev = seen.find((j) => j.id === jobId && (j.status === 'done' || j.status === 'failed'));
    if (ev) return ev;
    await new Promise((r) => realSetTimeout(r, 50));
  }
  throw new Error(`job ${jobId} sin evento done por SSE`);
};

before(async () => {
  home = await mkdtemp(join(tmpdir(), 'davinci-e2e-'));
  cwd = await mkdtemp(join(tmpdir(), 'davinci-e2e-cwd-'));
  Object.assign(process.env, { DAVINCI_HOME: home, DAVINCI_SECRETS_SOURCE: 'env', FAL_API_KEY: 'k' });

  globalThis.setTimeout = (fn, ms, ...a) => realSetTimeout(fn, ms === 2000 ? 0 : ms, ...a); // poll de FAL
  globalThis.fetch = async (url, init) => {
    const hit = mocks.find(([re]) => re.test(String(url)));
    if (hit) return hit[1]();
    if (String(url).startsWith('http://127.0.0.1')) return realFetch(url, init);
    throw new Error(`fetch sin mock: ${url}`);
  };

  srv = await startServer({ port: 0, host: '127.0.0.1', open: false, cwd });
  base = srv.url;

  const res = await fetch(`${base}/api/events`, { signal: sse.signal });
  (async () => {
    let buf = '';
    for await (const chunk of res.body.pipeThrough(new TextDecoderStream())) {
      buf += chunk;
      const parts = buf.split('\n\n');
      buf = parts.pop();
      for (const p of parts) {
        const m = p.match(/^event: job\ndata: (.*)$/m);
        if (m) seen.push(JSON.parse(m[1]));
      }
    }
  })().catch(() => {});
});

after(async () => {
  sse.abort();
  globalThis.fetch = realFetch;
  globalThis.setTimeout = realSetTimeout;
  await srv.close();
});

test('imagen → video con linaje → /v1 → spend → CLI en la misma biblioteca', async () => {
  // 1. imagen por la API + evento SSE
  const img = await api('/api/generations', { method: 'POST', body: { kind: 'image', model: 'fal/flux-schnell', prompt: 'gato' } });
  assert.equal(img.status, 202);
  const imgJob = await waitDone(img.body.job.id);
  assert.equal(imgJob.status, 'done');
  const [imgId] = imgJob.generationIds;

  // 2. video con la imagen como input
  const vid = await api('/api/generations', {
    method: 'POST',
    body: { kind: 'video', model: 'fal/kling-1.6-pro', prompt: 'gato corre', inputs: [{ id: imgId }], confirm: true },
  });
  assert.equal(vid.status, 202);
  const vidJob = await waitDone(vid.body.job.id);
  assert.equal(vidJob.status, 'done', JSON.stringify(vidJob.error));
  const [vidId] = vidJob.generationIds;

  // 3. linaje
  const lib = await api(`/api/library/${vidId}`);
  assert.equal(lib.status, 200);
  assert.deepEqual(lib.body.parents.map((g) => g.id), [imgId]);
  const parent = await api(`/api/library/${imgId}`);
  assert.deepEqual(parent.body.children.map((g) => g.id), [vidId]);

  // 4. endpoint compatible con OpenAI
  const oa = await api('/v1/images/generations', { method: 'POST', body: { model: 'fal/flux-schnell', prompt: 'perro' } });
  assert.equal(oa.status, 200);
  assert.equal(oa.body.data.length, 1);

  // 5. spend suma los tres costos (schnell + kling 5s + schnell)
  const spend = await api('/api/spend');
  assert.ok(Math.abs(spend.body.totalUsd - (0.003 + 0.42 + 0.003)) < 1e-9, `total=${spend.body.totalUsd}`);

  // 6. el CLI escribe en la misma DAVINCI_HOME y el servidor lo ve
  const r = spawnSync(process.execPath, ['--import', CLI_MOCK, CLI, 'image', '--prompt', 'desde cli'], {
    cwd, encoding: 'utf8', env: { ...process.env },
  });
  assert.equal(r.status, 0, r.stderr);
  const { id: cliId } = JSON.parse(r.stdout.trim());
  const list = await api('/api/library?limit=50');
  const row = list.body.items.find((g) => g.id === cliId);
  assert.ok(row, 'la generación del CLI no aparece en /api/library');
  assert.equal(row.source, 'cli');
});
