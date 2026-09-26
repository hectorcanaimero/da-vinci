import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { openLibrary } from '../src/library/db.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, '..', 'src', 'generate.mjs');
const MOCK = join(here, 'helpers', 'mock-fetch.mjs');
const tmp = () => mkdtemp(join(tmpdir(), 'davinci-cli-'));

let home, cwd;
before(async () => {
  home = await tmp();
  cwd = await tmp();
});

const cli = (args, { home: h = home } = {}) => {
  const r = spawnSync(process.execPath, ['--import', MOCK, CLI, ...args], {
    cwd, encoding: 'utf8',
    env: { ...process.env, DAVINCI_HOME: h, DAVINCI_SECRETS_SOURCE: 'env', FAL_API_KEY: 'k' },
  });
  return { ...r, out: r.stdout.trim() };
};

test('image --dry-run imprime la estimación y no genera', () => {
  const r = cli(['image', '--prompt', 'gato', '--dry-run']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.out), {
    dryRun: true, modelKey: 'fal:flux-pro-ultra', unitCost: 0.06, totalCost: 0.06, level: 'auto', known: true,
  });
  assert.match(r.stderr, /💰/);
});

test('image fal: JSON de éxito y fila en la biblioteca', async () => {
  const r = cli(['image', '--prompt', 'gato']);
  assert.equal(r.status, 0, r.stderr);
  const o = JSON.parse(r.out);
  assert.deepEqual(Object.keys(o), ['ok', 'id', 'provider', 'model', 'outputPath', 'costUsd', 'manifestPath']);
  assert.equal(o.ok, true);
  assert.equal(o.provider, 'fal');
  assert.equal(o.model, 'flux-pro-ultra');
  assert.equal(o.costUsd, 0.06);
  await access(o.outputPath);
  await access(o.manifestPath);

  const lib = openLibrary(home);
  try {
    const g = lib.get(o.id);
    assert.equal(g.source, 'cli');
    assert.equal(g.prompt, 'gato');
    assert.equal(g.filePath, o.outputPath);
  } finally {
    lib.close();
  }
});

test('costo alto sin --force → exit 2; con --force genera', () => {
  const args = ['image', '--prompt', 'x', '--n', '20'];
  const r = cli(args);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--force/);
  assert.equal(r.out, '');

  const ok = cli([...args, '--force']);
  assert.equal(ok.status, 0, ok.stderr);
});

test('--refs davinci:<id> vincula el padre', () => {
  const parent = JSON.parse(cli(['image', '--prompt', 'padre']).out);
  const child = JSON.parse(cli(['image', '--prompt', 'hijo', '--refs', `davinci:${parent.id}`]).out);
  const lib = openLibrary(home);
  try {
    assert.deepEqual(lib.get(child.id).inputs.map((i) => i.id), [parent.id]);
  } finally {
    lib.close();
  }
});

test('import dos veces es idempotente', () => {
  const home2 = join(cwd, 'home2');
  const manifest = join(cwd, 'assets', 'generated', 'manifest.json');
  const first = cli(['import', manifest], { home: home2 });
  assert.equal(first.status, 0, first.stderr);
  const a = JSON.parse(first.out);
  assert.ok(a.imported >= 1);
  assert.equal(a.skipped, 0);
  assert.deepEqual(JSON.parse(cli(['import', manifest], { home: home2 }).out), { imported: 0, skipped: a.imported });
});
