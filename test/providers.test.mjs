import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const KEYS = ['OPENAI', 'GEMINI', 'FAL', 'KIE', 'HEYGEN', 'ELEVENLABS', 'TRIPO'].map((p) => `${p}_API_KEY`);
const realFetch = globalThis.fetch;
const realHome = process.env.HOME;
let home;
let fetchStatus = 200;

before(async () => {
  home = await mkdtemp(join(tmpdir(), 'dv-providers-'));
  process.env.HOME = home;
  for (const k of [...KEYS, 'DAVINCI_SECRETS_SOURCE', 'DAVINCI_ENV_FILE', 'INFISICAL_URL']) delete process.env[k];
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: `bad key ${process.env.OPENAI_API_KEY}` }), { status: fetchStatus });
});

after(() => {
  globalThis.fetch = realFetch;
  process.env.HOME = realHome;
});

const { getProvidersStatus, saveKey, testProvider } = await import('../src/core/providers-status.mjs');

test('sin key → missing', async () => {
  const all = await getProvidersStatus();
  assert.equal(all.length, 7);
  for (const p of all) assert.deepEqual(p, { id: p.id, status: 'missing', source: null, keyHint: null });
});

test('saveKey crea .env con modo 600 y no pisa otras keys', async () => {
  const dir = join(home, '.config', 'da-vinci');
  await mkdir(dir, { recursive: true });
  const file = join(dir, '.env');
  await writeFile(file, '# comentario\nFAL_API_KEY=fal-secret\nOPENAI_API_KEY=old\n');

  const key = 'sk-supersecretkey1234';
  const st = await saveKey('openai', key);
  assert.equal(st.status, 'connected');
  assert.equal(st.source, `dotenv:${file}`);
  assert.equal(st.keyHint, '…1234');
  assert.ok(!JSON.stringify(st).includes(key));
  assert.equal(process.env.OPENAI_API_KEY, key);

  const txt = await readFile(file, 'utf8');
  assert.match(txt, /# comentario/);
  assert.match(txt, /FAL_API_KEY=fal-secret/);
  assert.equal(txt.match(/OPENAI_API_KEY=/g).length, 1);
  assert.match(txt, new RegExp(`OPENAI_API_KEY=${key}`));
  assert.equal((await stat(file)).mode & 0o777, 0o600);
});

test('saveKey crea el archivo si no existe', async () => {
  const other = await mkdtemp(join(tmpdir(), 'dv-providers-'));
  process.env.HOME = other;
  try {
    await saveKey('tripo', 'tsk_abcdefgh');
    const file = join(other, '.config', 'da-vinci', '.env');
    assert.equal(await readFile(file, 'utf8'), 'TRIPO_API_KEY=tsk_abcdefgh\n');
    assert.equal((await stat(file)).mode & 0o777, 0o600);
  } finally {
    process.env.HOME = home;
  }
});

test('401 → error sin filtrar la key', async () => {
  fetchStatus = 401;
  try {
    const st = await testProvider('openai');
    assert.equal(st.status, 'error');
    assert.match(st.error, /401/);
    assert.ok(!JSON.stringify(st).includes(process.env.OPENAI_API_KEY));
  } finally {
    fetchStatus = 200;
  }
});

test('saveKey rechaza keys vacías o multilínea y proveedores desconocidos', async () => {
  await assert.rejects(saveKey('openai', ''));
  await assert.rejects(saveKey('openai', 'a\nEVIL=1'));
  await assert.rejects(saveKey('nope', 'x'));
});
