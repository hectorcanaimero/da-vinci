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

let dir, library, jobs, server, base;
let runs = 0; // cuántas veces se llamó al "proveedor"

const REQ = { kind: 'image', prompt: 'gato', model: 'fal/flux-pro-ultra' }; // $0.06

// estimate real (es la barrera); run falso que registra el gasto como el real.
const router = {
  estimate: realRouter.estimate,
  async run(req, ctx) {
    runs += 1;
    const filePath = join(dir, `out-${runs}.png`);
    await writeFile(filePath, 'x');
    return [ctx.library.record({ kind: 'image', provider: 'fal', model: 'flux-pro-ultra', prompt: req.prompt,
      filePath, mime: 'image/png', source: ctx.source, costUsd: 0.06 })];
  },
};

const config = (patch) => writeFile(join(dir, 'config.json'), JSON.stringify(patch));

const call = async (path, body) => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'davinci-gate-'));
  process.env.DAVINCI_HOME = dir;
  process.env.FAL_API_KEY = 'k';
  library = openLibrary();
  jobs = createJobQueue({ library, router, events: new EventEmitter(), outDir: dir });
  server = createServer({ config: { host: '127.0.0.1', apiKey: null }, library, router, jobs,
    events: new EventEmitter() });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => { server.closeAllConnections(); server.close(); });

test('por debajo del umbral ejecuta directo', async () => {
  await config({ thresholds: { auto: 0.01, warn: 0.10 } });
  const res = await call('/api/generations', REQ);
  assert.equal(res.status, 202);
  await jobs.idle();
  assert.equal(runs, 1);
  assert.ok(Math.abs(library.spentToday() - 0.06) < 1e-9);
});

test('por encima del umbral exige confirmación y no llama al proveedor', async () => {
  await config({ thresholds: { auto: 0.01, warn: 0.05 } });
  const denied = await call('/api/generations', REQ);
  assert.equal(denied.status, 402);
  assert.equal(denied.body.error.code, 'cost_confirm_required');
  assert.equal(runs, 1);

  const ok = await call('/api/generations', { ...REQ, confirm: true });
  assert.equal(ok.status, 202);
  await jobs.idle();
  assert.equal(runs, 2);
});

test('con el tope diario alcanzado bloquea, aun con confirm', async () => {
  // Ya se gastaron $0.12 hoy: el tope está alcanzado.
  await config({ thresholds: { auto: 0.01, warn: 0.10 }, dailyBudgetUsd: 0.12 });
  const spentBefore = library.spentToday();

  const res = await call('/api/generations', { ...REQ, confirm: true });
  assert.equal(res.status, 402);
  assert.equal(res.body.error.code, 'budget_exceeded');
  assert.equal(res.body.error.details.dailyBudgetUsd, 0.12);
  assert.equal(runs, 2); // ningún proveedor llamado
  assert.equal(library.spentToday(), spentBefore);
});

test('sólo estimar: informa la barrera sin gasto ni asset', async () => {
  await config({ thresholds: { auto: 0.01, warn: 0.05 }, dailyBudgetUsd: 10 });
  const assets = library.list({}).items.length;
  const spent = library.spentToday();

  const est = await call('/api/estimate', REQ);
  assert.equal(est.status, 200);
  assert.equal(est.body.costUsd, 0.06);
  assert.equal(est.body.needsConfirm, true);
  assert.equal(est.body.blocked, false);
  assert.equal(est.body.dailyBudgetUsd, 10);
  assert.ok(Math.abs(est.body.spentTodayUsd - spent) < 1e-9);

  assert.equal(runs, 2);
  assert.equal(library.list({}).items.length, assets);
  assert.equal(library.spentToday(), spent);
});
