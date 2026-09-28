import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openLibrary } from '../src/library/db.mjs';
import { detectDavinci, migrateFromDavinci } from '../src/library/migrate.mjs';

const dir = () => mkdtempSync(join(tmpdir(), 'davinci-migrate-'));

function makeSource() {
  const sourceHome = dir();
  const assetsDir = join(sourceHome, 'library');
  mkdirSync(assetsDir, { recursive: true });
  const lib = openLibrary(sourceHome);
  const rows = [1, 2].map((i) => {
    const filePath = join(assetsDir, `${i}.png`);
    writeFileSync(filePath, `asset-${i}`, { flag: 'w' });
    return lib.record({
      id: randomUUID(),
      kind: 'image',
      prompt: `prompt ${i}`,
      provider: 'fal',
      model: 'flux-schnell',
      costUsd: 0.05 * i,
      filePath,
      mime: 'image/png',
      bytes: 5,
      source: 'cli',
    });
  });
  lib.close();
  return { sourceHome, assetsDir, rows };
}

test('detectDavinci counts without importing anything', async () => {
  const { sourceHome, rows } = makeSource();
  const destHome = dir();

  const info = await detectDavinci(sourceHome);
  assert.deepEqual(info, { home: sourceHome, count: rows.length });
  assert.equal(existsSync(join(destHome, 'davinci.db')), false);
});

test('detectDavinci returns null when there is no previous install', async () => {
  assert.equal(await detectDavinci(dir()), null);
});

test('migrateFromDavinci copies rows, keeps source files in place, and is idempotent', async () => {
  const { sourceHome, assetsDir, rows } = makeSource();
  const destHome = dir();

  const first = await migrateFromDavinci({ sourceHome, destHome });
  assert.deepEqual(first, { total: rows.length, migrated: rows.length });

  const destLib = openLibrary(destHome);
  for (const [i, row] of rows.entries()) {
    const got = destLib.get(row.id);
    assert.equal(got.prompt, `prompt ${i + 1}`);
    assert.equal(got.model, 'flux-schnell');
    assert.equal(got.costUsd, 0.05 * (i + 1));
    assert.equal(got.filePath, join(assetsDir, `${i + 1}.png`));
    assert.equal(existsSync(got.filePath), true); // file was never copied, still at the source path
  }
  const countAfterFirst = destLib.list({ limit: 1000 }).items.length;
  assert.equal(countAfterFirst, rows.length);
  destLib.close();

  const second = await migrateFromDavinci({ sourceHome, destHome });
  assert.deepEqual(second, { total: rows.length, migrated: 0 });

  const destLib2 = openLibrary(destHome);
  assert.equal(destLib2.list({ limit: 1000 }).items.length, countAfterFirst);
  destLib2.close();
});

test('migrateFromDavinci is a no-op when there is no previous install', async () => {
  const destHome = dir();
  const result = await migrateFromDavinci({ sourceHome: dir(), destHome });
  assert.deepEqual(result, { total: 0, migrated: 0 });
  assert.equal(existsSync(join(destHome, 'davinci.db')), false);
});
