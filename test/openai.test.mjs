import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../src/server/index.mjs';
import { createJobQueue } from '../src/server/jobs.mjs';
import { openLibrary } from '../src/library/db.mjs';
import * as realRouter from '../src/core/router.mjs';

let dir, server, base;
const runs = [];

const router = {
  estimate: realRouter.estimate,
  async run(req, ctx) {
    runs.push(req);
    const filePath = join(dir, `out-${runs.length}.png`);
    await writeFile(filePath, 'PNGDATA');
    return [ctx.library.record({ kind: 'image', provider: 'fal', model: 'flux-schnell', prompt: req.prompt,
      filePath, mime: 'image/png', source: ctx.source, costUsd: 0.003 })];
  },
};

// Misma forma que el SDK de OpenAI: POST JSON con Bearer.
const post = (body, headers = {}) => fetch(`${base}/v1/images/generations`, {
  method: 'POST', body: JSON.stringify(body),
  headers: { 'content-type': 'application/json', authorization: 'Bearer sk-x', ...headers },
});

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'davinci-openai-'));
  process.env.DAVINCI_HOME = dir;
  process.env.FAL_API_KEY = 'k';
  await writeFile(join(dir, 'config.json'), JSON.stringify({ thresholds: { auto: 0.01, warn: 0.02 } }));
  const library = openLibrary();
  const events = new EventEmitter();
  const jobs = createJobQueue({ library, router, events, outDir: dir });
  server = createServer({ config: { host: '127.0.0.1', apiKey: null }, library, router, jobs, events });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => { server.closeAllConnections(); server.close(); });

test('GET /v1/models: solo image/svg en formato OpenAI', async () => {
  const body = await (await fetch(`${base}/v1/models`)).json();
  assert.equal(body.object, 'list');
  assert.ok(body.data.find((m) => m.id === 'fal/flux-schnell' && m.object === 'model' && m.owned_by === 'fal'));
  assert.ok(body.data.find((m) => m.id === 'fal/recraft-v3-svg'));
  assert.ok(!body.data.find((m) => m.id.startsWith('fal/kling')));
});

test('generations: url absoluta que descarga el archivo; size→aspect', async () => {
  const r = await post({ model: 'fal/flux-schnell', prompt: 'gato', n: 1, size: '1536x1024' });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(typeof body.created, 'number');
  assert.ok(body.data[0].url.startsWith(`${base}/files/`));
  assert.equal(await (await fetch(body.data[0].url)).text(), 'PNGDATA');
  assert.equal(runs.at(-1).params.aspect, '16:9');
});

test('generations: b64_json', async () => {
  const body = await (await post({ model: 'fal/flux-schnell', prompt: 'gato', response_format: 'b64_json' })).json();
  assert.equal(Buffer.from(body.data[0].b64_json, 'base64').toString(), 'PNGDATA');
});

test('modelo desconocido → 400 formato OpenAI', async () => {
  const r = await post({ model: 'dall-e-9', prompt: 'x' });
  assert.equal(r.status, 400);
  const { error } = await r.json();
  assert.equal(error.type, 'invalid_request_error');
  assert.equal(error.code, 'invalid_request');
  assert.ok(error.message);
});

test('costo alto sin header → 402; con X-Davinci-Confirm pasa', async () => {
  const req = { model: 'fal/flux-pro-ultra', prompt: 'gato' };
  const n = runs.length;
  const denied = await post(req);
  assert.equal(denied.status, 402);
  assert.equal((await denied.json()).error.code, 'cost_confirm_required');
  assert.equal(runs.length, n);
  assert.equal((await post(req, { 'X-Davinci-Confirm': 'true' })).status, 200);
});
