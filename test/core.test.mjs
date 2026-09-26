import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generate } from '../src/core/generate.mjs';
import { getModel } from '../src/core/catalog.mjs';

const realFetch = globalThis.fetch;
const realSetTimeout = globalThis.setTimeout;
let calls;
let routes; // [regex, (url, init) => Response]

const json = (o, status = 200) => new Response(JSON.stringify(o), { status });
const png = (bytes) => new Response(Buffer.from(bytes), { headers: { 'content-type': 'image/png' } });

beforeEach(() => {
  calls = [];
  routes = [];
  process.env.FAL_API_KEY = 'k';
  process.env.OPENAI_API_KEY = 'k';
  process.env.GEMINI_API_KEY = 'k';
  process.env.ELEVENLABS_API_KEY = 'k';
  globalThis.setTimeout = (fn) => realSetTimeout(fn, 0); // sin esperas de polling
  globalThis.fetch = async (url, init) => {
    url = String(url);
    calls.push({ url, init });
    const r = routes.find(([re]) => re.test(url));
    if (!r) throw new Error(`fetch sin mock: ${url}`);
    return r[1](url, init);
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
  globalThis.setTimeout = realSetTimeout;
});

const tmp = () => mkdtemp(join(tmpdir(), 'davinci-core-'));

test('image fal n=2 guarda dos archivos', async () => {
  const outDir = await tmp();
  routes.push(
    [/queue\.fal\.run\/fal-ai/, () => json({ status_url: 'https://s/status', response_url: 'https://s/result' })],
    [/s\/status/, () => json({ status: 'COMPLETED' })],
    [/s\/result/, () => json({ images: [{ url: 'https://cdn/a.png' }, { url: 'https://cdn/b.png' }] })],
    [/cdn\/a/, () => png([1, 2, 3])],
    [/cdn\/b/, () => png([4, 5])],
  );
  const out = await generate(getModel('fal/flux-pro-ultra'), { kind: 'image', prompt: 'x', params: { n: 2 } }, { outDir });
  assert.equal(out.length, 2);
  assert.match(out[0].filePath, /image-\d{8}-\d{6}-1\.png$/);
  assert.match(out[1].filePath, /-2\.png$/);
  assert.deepEqual(out.map((o) => o.bytes), [3, 2]);
  assert.equal(out[0].mime, 'image/png');
  assert.equal((await readdir(outDir)).length, 2);
});

test('image openai b64 respeta ctx.outPath', async () => {
  const outDir = await tmp();
  const outPath = join(outDir, 'sub', 'mine.png');
  routes.push([/api\.openai\.com/, () => json({ data: [{ b64_json: Buffer.from('hola').toString('base64') }] })]);
  const out = await generate(getModel('openai/gpt-image-2'), { kind: 'image', prompt: 'x' }, { outDir, outPath });
  assert.equal(out.length, 1);
  assert.equal(out[0].filePath, outPath);
  assert.equal(await readFile(outPath, 'utf8'), 'hola');
});

test('video gemini con input {path}', async () => {
  const outDir = await tmp();
  const inPath = join(outDir, 'in.png');
  await writeFile(inPath, 'PNGDATA');
  routes.push(
    [/predictLongRunning/, () => json({ name: 'operations/1' })],
    [/operations\/1/, () => json({ done: true, response: { generatedVideos: [{ video: { bytesBase64Encoded: Buffer.from('vid').toString('base64') } }] } })],
  );
  const out = await generate(
    getModel('gemini/veo-3.0-fast-generate-001'),
    { kind: 'video', prompt: 'x', inputs: [{ path: inPath }] },
    { outDir },
  );
  const sent = JSON.parse(calls.find((c) => /predictLongRunning/.test(c.url)).init.body);
  assert.equal(sent.instances[0].image.bytesBase64Encoded, Buffer.from('PNGDATA').toString('base64'));
  assert.equal(sent.instances[0].image.mimeType, 'image/png');
  assert.match(out[0].filePath, /video-.*\.mp4$/);
  assert.equal(out[0].mime, 'video/mp4');
});

test('tts guarda el buffer de audio', async () => {
  const outDir = await tmp();
  routes.push([/api\.elevenlabs\.io/, () => new Response(Buffer.from('mp3data'))]);
  const out = await generate(getModel('elevenlabs/multilingual-v2'), { kind: 'audio', text: 'hola' }, { outDir });
  assert.match(out[0].filePath, /audio-.*\.mp3$/);
  assert.equal(out[0].mime, 'audio/mpeg');
  assert.equal(await readFile(out[0].filePath, 'utf8'), 'mp3data');
});

test('bg-remove con input {id} resuelto por ctx pasa data URL a FAL', async () => {
  const outDir = await tmp();
  const inPath = join(outDir, 'src.png');
  await writeFile(inPath, 'img');
  routes.push(
    [/queue\.fal\.run\/fal-ai/, () => json({ status_url: 'https://s/status', response_url: 'https://s/result' })],
    [/s\/status/, () => json({ status: 'COMPLETED' })],
    [/s\/result/, () => json({ image: { url: 'https://cdn/o.png' } })],
    [/cdn\/o/, () => png([9])],
  );
  const out = await generate(
    getModel('fal/bria-bg-remove'),
    { kind: 'bg-remove', inputs: [{ id: 'abc' }] },
    { outDir, resolveInputPath: async (id) => (id === 'abc' ? inPath : null) },
  );
  const sent = JSON.parse(calls.find((c) => /queue\.fal\.run\/fal-ai/.test(c.url)).init.body);
  assert.match(sent.image_url, /^data:image\/png;base64,/);
  assert.equal(out.length, 1);
});

test('401 del proveedor sale como DavinciError provider_error', async () => {
  const outDir = await tmp();
  routes.push([/api\.openai\.com/, () => new Response('bad key', { status: 401 })]);
  await assert.rejects(
    generate(getModel('openai/gpt-image-2'), { kind: 'image', prompt: 'x' }, { outDir }),
    (e) => e.name === 'DavinciError' && e.code === 'provider_error' && e.status === 502,
  );
});
