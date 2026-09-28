import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openLibrary } from '../src/library/db.mjs';
import { loadConfig, saveConfig } from '../src/core/config.mjs';

const home = () => mkdtempSync(join(tmpdir(), 'davinci-'));
let n = 0;
const gen = (o = {}) => ({
  id: `g${++n}`, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString(), kind: 'image',
  prompt: 'a cat', provider: 'fal', model: 'flux', requestedModel: null, params: {}, costUsd: 0.1,
  filePath: `/tmp/x/${n}.png`, mime: 'image/png', bytes: 1, source: 'cli', projectDir: null,
  favorite: false, inputs: [], ...o,
});

test('config merges defaults and saves', () => {
  const h = home();
  process.env.DAVINCI_HOME = h;
  assert.equal(loadConfig().port, 20130);
  saveConfig({ port: 1, thresholds: { warn: 5 } });
  const c = loadConfig();
  assert.deepEqual([c.port, c.thresholds, c.home], [1, { auto: 0.1, warn: 5 }, h]);
});

test('record/get/lineage/remove', () => {
  const lib = openLibrary(home());
  const a = lib.record(gen({ id: 'a', filePath: '/tmp/a.png' }));
  lib.record(gen({
    id: 'b',
    inputs: [{ id: 'davinci:a' }, { ref: '/tmp/a.png' }, { ref: 'http://h:1/files/a' }, { ref: 'nope' }],
  }));
  assert.equal(a.url, '/files/a');
  assert.deepEqual(lib.get('b').inputs.map((i) => i.id), ['a', 'a', 'a', null]);
  assert.equal(lib.get('b').inputs[3].ref, 'nope');
  assert.equal(lib.resolveInputId('/files/a'), 'a');
  assert.equal(lib.lineage('b').parents[0].id, 'a');
  assert.deepEqual(lib.lineage('a').children.map((c) => c.id), ['b']);

  const f = join(home(), 'f.png');
  writeFileSync(f, 'x');
  lib.record(gen({ id: 'c', filePath: f }));
  lib.remove('c', { deleteFile: true });
  assert.equal(existsSync(f), false);

  lib.remove('a');
  assert.equal(lib.get('a'), null);
  const l = lib.lineage('b');
  assert.equal(l.parents[0].id, 'a');
  assert.ok(l.parents[0].deletedAt);
  assert.equal(lib.get('b').inputs[0].id, 'a');
});

test('list q + kind + cursor', () => {
  const lib = openLibrary(home());
  for (let i = 0; i < 5; i++) lib.record(gen({ prompt: `red fox 100% ${i}` }));
  for (let i = 0; i < 2; i++) lib.record(gen({ prompt: 'red fox', kind: 'svg' }));
  lib.record(gen({ prompt: 'blue' }));
  const seen = [];
  let cursor;
  let pages = 0;
  do {
    const r = lib.list({ q: 'fox', kind: 'image', limit: 2, cursor });
    seen.push(...r.items.map((x) => x.id));
    cursor = r.nextCursor;
    pages++;
  } while (cursor);
  assert.equal(pages, 3);
  assert.equal(new Set(seen).size, 5);
  assert.equal(lib.list({ q: '%' }).items.length, 5); // wildcard is escaped
});

test('spend by provider + spentToday', () => {
  const lib = openLibrary(home());
  lib.record(gen({ provider: 'fal', costUsd: 1, createdAt: new Date().toISOString() }));
  lib.record(gen({ provider: 'fal', costUsd: 2, createdAt: new Date().toISOString() }));
  lib.record(gen({ provider: 'openai', costUsd: 4, createdAt: '2020-01-01T00:00:00.000Z' }));
  assert.deepEqual(lib.spend({ groupBy: 'provider' }), [
    { key: 'fal', costUsd: 3, count: 2 },
    { key: 'openai', costUsd: 4, count: 1 },
  ]);
  assert.equal(lib.spentToday(), 3);
});

test('jobs + markInterrupted', () => {
  const lib = openLibrary(home());
  lib.jobs.create({ id: 'j1', source: 'api', request: { kind: 'image' } });
  lib.jobs.create({ id: 'j2', source: 'api', request: {}, status: 'running' });
  lib.jobs.create({ id: 'j3', source: 'api', request: {} });
  lib.jobs.update('j3', { status: 'done', generationIds: ['x'] });
  assert.equal(lib.jobs.get('j3').generationIds[0], 'x');
  assert.equal(lib.jobs.markInterrupted(), 2);
  assert.equal(lib.jobs.get('j1').error.code, 'interrupted');
  assert.equal(lib.jobs.list({ status: 'interrupted' }).length, 2);
  assert.equal(lib.jobs.list({ status: 'failed' }).length, 0);
});

test('two handles on same home', () => {
  const h = home();
  const a = openLibrary(h);
  const b = openLibrary(h);
  for (let i = 0; i < 10; i++) (i % 2 ? a : b).record(gen());
  assert.equal(a.list({}).items.length, 10);
  assert.equal(b.list({}).items.length, 10);
});
