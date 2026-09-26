import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../src/server/index.mjs';
import { createJobQueue } from '../src/server/jobs.mjs';
import { openLibrary } from '../src/library/db.mjs';
import * as realRouter from '../src/core/router.mjs';

let dir, library, jobs, server, base, events;
const seen = [];

// estimate real (gate y validación); run falso que registra en la biblioteca.
const router = {
  estimate: realRouter.estimate,
  async run(req, ctx) {
    const filePath = join(dir, `out-${Date.now()}.png`);
    await writeFile(filePath, 'x');
    return [ctx.library.record({ kind: 'image', provider: 'fal', model: 'flux-pro-ultra', prompt: req.prompt,
      filePath, mime: 'image/png', source: ctx.source, costUsd: 0.06 })];
  },
};

const call = async (path, init = {}) => {
  const r = await fetch(base + path, { ...init, headers: { 'content-type': 'application/json', ...init.headers },
    body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
};

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'davinci-api-'));
  process.env.DAVINCI_HOME = dir;
  process.env.FAL_API_KEY = 'k';
  delete process.env.OPENAI_API_KEY;
  await writeFile(join(dir, 'config.json'), JSON.stringify({ thresholds: { auto: 0.01, warn: 0.02 } }));
  library = openLibrary();
  events = new EventEmitter();
  events.on('generation.deleted', (e) => seen.push(e));
  jobs = createJobQueue({ library, router, events, outDir: dir });
  server = createServer({ config: { host: '127.0.0.1', apiKey: null }, library, router, jobs, events });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => { server.closeAllConnections(); server.close(); });

test('models: filtro por kind y available según env', async () => {
  const { body } = await call('/api/models?kind=image');
  assert.ok(body.items.length && body.items.every((m) => m.kind === 'image'));
  assert.equal(body.items.find((m) => m.provider === 'fal').available, true);
  assert.equal(body.items.find((m) => m.provider === 'openai').available, false);
});

test('estimate y validación 400', async () => {
  const ok = await call('/api/estimate', { method: 'POST', body: { kind: 'image', prompt: 'a', model: 'fal/flux-pro-ultra' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.level, 'confirm');
  const bad = await call('/api/estimate', { method: 'POST', body: { kind: 'image' } });
  assert.equal(bad.status, 400);
});

test('generations: 402 sin job, 400, 202 → job done → aparece en library', async () => {
  const req = { kind: 'image', prompt: 'gato', model: 'fal/flux-pro-ultra' };
  const denied = await call('/api/generations', { method: 'POST', body: req });
  assert.equal(denied.status, 402);
  assert.equal(denied.body.error.code, 'cost_confirm_required');
  assert.equal((await call('/api/jobs')).body.items.length, 0);
  assert.equal((await call('/api/generations', { method: 'POST', body: { kind: 'image' } })).status, 400);

  const acc = await call('/api/generations', { method: 'POST', body: { ...req, confirm: true },
    headers: { 'X-Davinci-Source': 'dashboard' } });
  assert.equal(acc.status, 202);
  assert.equal(acc.body.job.source, 'dashboard');
  await jobs.idle();
  const job = (await call(`/api/jobs/${acc.body.job.id}`)).body;
  assert.equal(job.status, 'done');
  assert.equal((await call('/api/jobs?status=done')).body.items.length, 1);
  assert.equal((await call('/api/jobs/nope')).status, 404);

  const lib = (await call('/api/library')).body;
  assert.equal(lib.items[0].id, job.generationIds[0]);
  assert.equal(lib.items[0].url, `/files/${lib.items[0].id}`);
});

test('library: filtro, detalle con lineage, favorito, delete', async () => {
  const parent = (await call('/api/library')).body.items[0];
  const filePath = join(dir, 'child.png');
  await writeFile(filePath, 'y');
  const child = library.record({ kind: 'image', provider: 'x', model: 'm', filePath, source: 'test',
    projectDir: '/proj', inputs: [{ id: parent.id }] });

  assert.equal((await call('/api/library?kind=video')).body.items.length, 0);
  assert.equal((await call('/api/library?project=/proj')).body.items.length, 1);

  const d = (await call(`/api/library/${child.id}`)).body;
  assert.equal(d.parents[0].id, parent.id);
  assert.equal((await call(`/api/library/${parent.id}`)).body.children[0].id, child.id);
  assert.equal((await call('/api/library/nope')).status, 404);

  const fav = await call(`/api/library/${child.id}`, { method: 'PATCH', body: { favorite: true } });
  assert.equal(fav.body.favorite, true);
  assert.equal((await call('/api/library?favorite=true')).body.items.length, 1);
  assert.equal((await call(`/api/library/${child.id}`, { method: 'PATCH', body: {} })).status, 400);

  assert.deepEqual((await call('/api/projects')).body.items, [{ dir: '/proj', count: 1 }]);

  const del = await call(`/api/library/${child.id}?file=true`, { method: 'DELETE' });
  assert.equal(del.status, 204);
  assert.deepEqual(seen, [{ id: child.id }]);
  assert.equal(existsSync(filePath), false);
  assert.equal((await call(`/api/library/${child.id}`)).status, 404);
});

test('spend con totalUsd e import', async () => {
  const s = (await call('/api/spend?groupBy=provider')).body;
  assert.equal(s.items[0].key, 'fal');
  assert.ok(Math.abs(s.totalUsd - 0.06) < 1e-9);
  assert.equal((await call('/api/spend?groupBy=x')).status, 400);

  const out = join(dir, 'proj', 'assets', 'generated');
  const { mkdirSync } = await import('node:fs');
  mkdirSync(out, { recursive: true });
  const manifest = join(out, 'manifest.json');
  await writeFile(manifest, JSON.stringify({ generated: [{ id: 'imp1', prompt: 'p', outputPath: join(out, 'a.png') }] }));
  const imp = await call('/api/import', { method: 'POST', body: { path: manifest } });
  assert.deepEqual(imp.body, { imported: 1, skipped: 0 });
  assert.equal((await call('/api/import', { method: 'POST', body: {} })).status, 400);
});
