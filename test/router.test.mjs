import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, estimate } from '../src/core/router.mjs';
import { saveConfig } from '../src/core/config.mjs';
import { openLibrary } from '../src/library/db.mjs';
import { resolveOutputDir, resolveManifestPath } from '../src/utils/manifest.mjs';

const realFetch = globalThis.fetch;
const realSetTimeout = globalThis.setTimeout;
let calls, routes, library, outDir;

const json = (o, status = 200) => new Response(JSON.stringify(o), { status });
const bin = (type) => new Response(Buffer.from('data'), { headers: { 'content-type': type } });
const tmp = () => mkdtemp(join(tmpdir(), 'davinci-router-'));

beforeEach(async () => {
  calls = [];
  routes = [];
  process.env.DAVINCI_HOME = await tmp();
  for (const k of ['FAL_API_KEY', 'GEMINI_API_KEY', 'KIE_API_KEY']) process.env[k] = 'k';
  library = openLibrary();
  outDir = await tmp();
  globalThis.setTimeout = (fn) => realSetTimeout(fn, 0); // sin esperas de polling
  globalThis.fetch = async (url, init) => {
    url = String(url);
    calls.push(url);
    const r = routes.find(([re]) => re.test(url));
    if (!r) throw new Error(`fetch sin mock: ${url}`);
    return r[1](url, init);
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
  globalThis.setTimeout = realSetTimeout;
  library.close();
});

const falImage = () => routes.push(
  [/queue\.fal\.run\/fal-ai/, () => json({ status_url: 'https://s/status', response_url: 'https://s/result' })],
  [/s\/status/, () => json({ status: 'COMPLETED' })],
  [/s\/result/, () => json({ images: [{ url: 'https://cdn/a.png' }] })],
  [/cdn\/a/, () => bin('image/png')],
);
const kieVideo = () => routes.push(
  [/api\.kie\.ai.*createTask/, () => json({ data: { taskId: 't1' } })],
  [/api\.kie\.ai.*recordInfo/, () => json({ data: { state: 'success', response: { resultUrls: ['https://cdn/v.mp4'] } } })],
  [/cdn\/v/, () => bin('video/mp4')],
);
const veoFast = { kind: 'video', model: 'gemini/veo-3.0-fast-generate-001', prompt: 'x' };

test('auto elige el default del kind y registra en la biblioteca', async () => {
  falImage();
  const [g] = await run({ kind: 'image', model: 'auto', prompt: 'gato' }, { source: 'api', outDir, library });
  assert.equal(g.provider, 'fal');
  assert.equal(g.model, 'flux-pro-ultra');
  assert.equal(g.requestedModel, null);
  assert.equal(g.costUsd, 0.06);
  assert.deepEqual(library.get(g.id), g);
  assert.equal(estimate({ kind: 'image', prompt: 'x' }, { library }).model, 'fal/flux-pro-ultra');
});

test('modelo desconocido o campo faltante → invalid_request', async () => {
  await assert.rejects(run({ kind: 'image', model: 'fal/nope', prompt: 'x' }, { source: 'api', outDir, library }),
    { code: 'invalid_request', status: 400 });
  await assert.rejects(run({ kind: 'audio', model: 'auto' }, { source: 'api', outDir, library }),
    { code: 'invalid_request' });
});

test('costo alto sin confirm → 402 cost_confirm_required sin llamar al proveedor', async () => {
  const req = { kind: 'video', model: 'gemini/veo-3.0-generate-001', prompt: 'x', params: { duration: 8 } };
  await assert.rejects(run(req, { source: 'api', outDir, library }), (e) => {
    assert.equal(e.code, 'cost_confirm_required');
    assert.equal(e.status, 402);
    assert.equal(e.details.costUsd, 4);
    return true;
  });
  assert.equal(calls.length, 0);
  assert.equal(estimate(req, { library }).level, 'confirm');
});

test('tope diario → budget_exceeded aunque venga confirm', async () => {
  saveConfig({ dailyBudgetUsd: 0.1 });
  library.record({ kind: 'image', provider: 'fal', model: 'flux-pro', costUsd: 0.08, filePath: '/x.png', source: 'cli' });
  const req = { kind: 'image', prompt: 'x', confirm: true };
  assert.ok(Math.abs(estimate(req, { library }).budgetLeftUsd - 0.02) < 1e-9);
  await assert.rejects(run(req, { source: 'api', outDir, library }), { code: 'budget_exceeded', status: 402 });
  assert.equal(calls.length, 0);
});

test('401 de gemini hace fallback a kie y registra requested_model', async () => {
  routes.push([/predictLongRunning/, () => new Response('bad key', { status: 401 })]);
  kieVideo();
  const [g] = await run(veoFast, { source: 'api', outDir, library });
  assert.equal(g.provider, 'kie');
  assert.equal(g.model, 'veo-3-fast');
  assert.equal(g.requestedModel, 'gemini/veo-3.0-fast-generate-001');
  assert.equal(library.get(g.id).provider, 'kie');
});

test('422 no hace fallback', async () => {
  routes.push([/predictLongRunning/, () => new Response('bad prompt', { status: 422 })]);
  kieVideo();
  await assert.rejects(run(veoFast, { source: 'api', outDir, library }), { code: 'provider_rejected' });
  assert.ok(!calls.some((u) => /kie\.ai/.test(u)));
});

test('fallback: false no prueba equivalentes', async () => {
  routes.push([/predictLongRunning/, () => new Response('bad key', { status: 401 })]);
  kieVideo();
  await assert.rejects(run({ ...veoFast, fallback: false }, { source: 'api', outDir, library }), { code: 'provider_error' });
  assert.ok(!calls.some((u) => /kie\.ai/.test(u)));
});

test('con projectDir el manifest y la biblioteca comparten id', async () => {
  falImage();
  const projectDir = await tmp();
  const [g] = await run({ kind: 'image', prompt: 'x', inputs: [{ url: 'https://cdn/a.png' }] },
    { source: 'cli', projectDir, outDir: resolveOutputDir(projectDir), library });
  const manifest = JSON.parse(await readFile(resolveManifestPath(projectDir), 'utf8'));
  assert.equal(manifest.generated.length, 1);
  assert.equal(manifest.generated[0].id, g.id);
  assert.equal(manifest.generated[0].outputPath, g.filePath);
  assert.deepEqual(manifest.generated[0].references, ['https://cdn/a.png']);
  assert.equal(g.projectDir, projectDir);
  assert.equal(g.source, 'cli');
  assert.deepEqual(g.inputs, [{ id: null, ref: 'https://cdn/a.png' }]);
});

test('sin ctx.library abre la biblioteca de DAVINCI_HOME', async () => {
  falImage();
  const [g] = await run({ kind: 'image', prompt: 'x' }, { source: 'api', outDir });
  assert.equal(library.get(g.id).id, g.id);
});
