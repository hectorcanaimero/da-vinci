import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openLibrary } from '../src/library/db.mjs';
import { importManifest } from '../src/library/import.mjs';

test('importManifest: 4 entradas, idempotente, referencias vinculadas', async () => {
  const proj = mkdtempSync(join(tmpdir(), 'proj-'));
  const dir = join(proj, 'assets', 'generated');
  mkdirSync(dir, { recursive: true });
  const img = join(dir, 'a.png');
  const e = (id, prompt, outputPath, references = []) => ({
    id, timestamp: '2026-01-01T00:00:00.000Z', prompt, provider: 'fal', model: 'm',
    outputPath, costUsd: 0.1, references, params: {},
  });
  writeFileSync(img, 'x');
  const manifest = join(dir, 'manifest.json');
  writeFileSync(manifest, JSON.stringify({ version: 1, generated: [
    e('i1', 'a cat', img),
    e('v1', 'cat moves', join(dir, 'gone.mp4'), [img]), // archivo inexistente
    e('u1', 'upscale x2', join(dir, 'u.png')),
    e('s1', 'logo', join(dir, 'l.svg')),
  ] }));

  const lib = openLibrary(mkdtempSync(join(tmpdir(), 'davinci-')));
  assert.deepEqual(await importManifest(manifest, lib), { imported: 4, skipped: 0 });
  assert.deepEqual(await importManifest(manifest, lib), { imported: 0, skipped: 4 });
  assert.equal(lib.get('v1').inputs[0].id, 'i1');
  assert.deepEqual(['i1', 'v1', 'u1', 's1'].map((id) => lib.get(id).kind), ['image', 'video', 'upscale', 'svg']);
  assert.equal(lib.get('i1').source, 'import');
  assert.equal(lib.get('i1').projectDir, proj);
  lib.close();
});
