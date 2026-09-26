import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordGeneration, resolveManifestPath } from '../src/utils/manifest.mjs';

const self = fileURLToPath(import.meta.url);

if (process.argv[2] === 'child') {
  await recordGeneration({
    projectRoot: process.argv[3], prompt: 'p', provider: 'fal', model: 'm',
    outputPath: '/x', costUsd: 0.01,
  });
  process.exit(0);
}

test('10 procesos concurrentes → 10 entradas, JSON válido', async () => {
  const root = await mkdtemp(join(tmpdir(), 'manifest-'));
  await Promise.all(Array.from({ length: 10 }, () => new Promise((res, rej) => {
    fork(self, ['child', root]).on('exit', (c) => (c === 0 ? res() : rej(new Error(`exit ${c}`))));
  })));
  const m = JSON.parse(await readFile(resolveManifestPath(root), 'utf8'));
  assert.equal(m.generated.length, 10);
  assert.equal(new Set(m.generated.map((e) => e.id)).size, 10);
});

test('entry.id dado se respeta', async () => {
  const root = await mkdtemp(join(tmpdir(), 'manifest-'));
  const { id } = await recordGeneration({ id: 'abc', projectRoot: root, prompt: 'p', costUsd: 0 });
  assert.equal(id, 'abc');
  const m = JSON.parse(await readFile(resolveManifestPath(root), 'utf8'));
  assert.equal(m.generated[0].id, 'abc');
});
